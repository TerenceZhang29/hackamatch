import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "@/lib/config";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  APP_URL: "http://localhost:3000",
};

const prodSecrets = {
  NODE_ENV: "production",
  ANTHROPIC_API_KEY: "sk-ant-test",
  VOYAGE_API_KEY: "pa-test",
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "HackaMatch <hello@example.com>",
  RESPONSE_TOKEN_SECRET: "x".repeat(32),
  CRON_SECRET: "cron",
};

describe("parseConfig", () => {
  it("throws when a required var is missing", () => {
    const { APP_URL: _omit, ...env } = base;
    expect(() => parseConfig(env)).toThrow(ConfigError);
    expect(() => parseConfig(env)).toThrow(/APP_URL/);
  });

  it("applies defaults and uses fake providers outside production", () => {
    const config = parseConfig({ ...base, NODE_ENV: "development" });
    expect(config.LLM_PROVIDER).toBe("fake");
    expect(config.EMBEDDINGS_PROVIDER).toBe("fake");
    expect(config.EMAIL_PROVIDER).toBe("fake");
    expect(config.EMBEDDING_MODEL).toBe("voyage-4-lite");
    expect(config.EMBEDDING_DIM).toBe(1024);
    expect(config.APP_TIMEZONE).toBe("America/New_York");
    expect(config.ALLOWED_EMAIL_DOMAINS).toEqual(["cornell.edu"]);
    expect(config.SHOW_EXISTING_TEAMS).toBe(false);
  });

  it("uses real providers in production and requires their keys", () => {
    expect(() => parseConfig({ ...base, NODE_ENV: "production" })).toThrow(/ANTHROPIC_API_KEY/);

    const config = parseConfig({ ...base, ...prodSecrets });
    expect(config.LLM_PROVIDER).toBe("anthropic");
    expect(config.EMBEDDINGS_PROVIDER).toBe("voyage");
    expect(config.EMAIL_PROVIDER).toBe("resend");
  });

  it("allows fake providers in production when chosen explicitly", () => {
    const config = parseConfig({
      ...base,
      ...prodSecrets,
      ANTHROPIC_API_KEY: "",
      LLM_PROVIDER: "fake",
    });
    expect(config.LLM_PROVIDER).toBe("fake");
  });

  it("requires the API key for a provider chosen explicitly", () => {
    expect(() => parseConfig({ ...base, EMAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
  });

  it("rejects a short response-token secret", () => {
    expect(() => parseConfig({ ...base, RESPONSE_TOKEN_SECRET: "short" })).toThrow(
      /at least 32 characters/,
    );
  });

  it("parses comma-separated email domains and booleans", () => {
    const config = parseConfig({
      ...base,
      ALLOWED_EMAIL_DOMAINS: "cornell.edu, Tech.Cornell.edu",
      SHOW_EXISTING_TEAMS: "true",
      EMBEDDING_DIM: "512",
    });
    expect(config.ALLOWED_EMAIL_DOMAINS).toEqual(["cornell.edu", "tech.cornell.edu"]);
    expect(config.SHOW_EXISTING_TEAMS).toBe(true);
    expect(config.EMBEDDING_DIM).toBe(512);
  });
});
