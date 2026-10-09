import { z } from "zod";

/**
 * Typed, validated access to environment variables.
 *
 * Every env var the app reads is declared here (and in `.env.example` and
 * docs/IMPLEMENTATION_PLAN.md §9). `src/instrumentation.ts` calls `getConfig()`
 * at server boot so a misconfigured deploy fails immediately instead of on the
 * first request that needs the missing value.
 */

const LLM_PROVIDERS = ["anthropic", "fake"] as const;
const EMBEDDINGS_PROVIDERS = ["voyage", "fake"] as const;
const EMAIL_PROVIDERS = ["resend", "fake"] as const;

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    APP_URL: z.url(),
    APP_TIMEZONE: z.string().default("America/New_York"),
    ALLOWED_EMAIL_DOMAINS: z
      .string()
      .default("cornell.edu")
      .transform((v) =>
        v
          .split(",")
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean),
      ),

    LLM_PROVIDER: z.enum(LLM_PROVIDERS).optional(),
    ANTHROPIC_API_KEY: optionalString,
    LLM_MODEL_FAST: z.string().default("claude-haiku-5-5"),

    EMBEDDINGS_PROVIDER: z.enum(EMBEDDINGS_PROVIDERS).optional(),
    VOYAGE_API_KEY: optionalString,
    EMBEDDING_MODEL: z.string().default("voyage-4-lite"),
    EMBEDDING_DIM: z.coerce.number().int().positive().default(1024),

    EMAIL_PROVIDER: z.enum(EMAIL_PROVIDERS).optional(),
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalString,

    RESPONSE_TOKEN_SECRET: optionalString,
    CRON_SECRET: optionalString,

    GITHUB_TOKEN: optionalString,
    SHOW_EXISTING_TEAMS: z.stringbool().default(false),
  })
  .transform((env) => {
    // Real providers are the default in production; fakes everywhere else, so
    // local dev and tests need no API keys.
    const isProd = env.NODE_ENV === "production";
    return {
      ...env,
      LLM_PROVIDER: env.LLM_PROVIDER ?? (isProd ? "anthropic" : "fake"),
      EMBEDDINGS_PROVIDER: env.EMBEDDINGS_PROVIDER ?? (isProd ? "voyage" : "fake"),
      EMAIL_PROVIDER: env.EMAIL_PROVIDER ?? (isProd ? "resend" : "fake"),
    } as const;
  })
  .superRefine((env, ctx) => {
    const requireIf = (condition: boolean, key: keyof typeof env, why: string) => {
      if (condition && !env[key]) {
        ctx.addIssue({ code: "custom", path: [key], message: `${key} is required ${why}` });
      }
    };

    requireIf(env.LLM_PROVIDER === "anthropic", "ANTHROPIC_API_KEY", "when LLM_PROVIDER=anthropic");
    requireIf(
      env.EMBEDDINGS_PROVIDER === "voyage",
      "VOYAGE_API_KEY",
      "when EMBEDDINGS_PROVIDER=voyage",
    );
    requireIf(env.EMAIL_PROVIDER === "resend", "RESEND_API_KEY", "when EMAIL_PROVIDER=resend");
    requireIf(env.EMAIL_PROVIDER === "resend", "EMAIL_FROM", "when EMAIL_PROVIDER=resend");

    const isProd = env.NODE_ENV === "production";
    requireIf(isProd, "RESPONSE_TOKEN_SECRET", "in production");
    requireIf(isProd, "CRON_SECRET", "in production");

    if (env.RESPONSE_TOKEN_SECRET && env.RESPONSE_TOKEN_SECRET.length < 32) {
      ctx.addIssue({
        code: "custom",
        path: ["RESPONSE_TOKEN_SECRET"],
        message: "RESPONSE_TOKEN_SECRET must be at least 32 characters",
      });
    }
    if (env.ALLOWED_EMAIL_DOMAINS.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["ALLOWED_EMAIL_DOMAINS"],
        message: "ALLOWED_EMAIL_DOMAINS must list at least one domain",
      });
    }
  });

export type Config = z.output<typeof envSchema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join("\n  - ")}`);
    this.name = "ConfigError";
  }
}

/** Parses an env object. Pure, so it can be unit tested with any input. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => {
        const key = issue.path.join(".");
        return key && !issue.message.startsWith(key) ? `${key}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data;
}

let cached: Config | undefined;

/** The app's config, parsed from `process.env` once per process. */
export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}
