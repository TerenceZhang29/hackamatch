import { z } from "zod";

/**
 * Row formats of the Phase 0 exports (docs/IMPLEMENTATION_PLAN.md P0-01 to
 * P0-03) and their mapping onto the app's data. Pure, so it is unit tested;
 * src/server/phase0-import.ts does the writing.
 */

export const SIGNUP_COLUMNS = [
  "email",
  "name",
  "role",
  "intents",
  "sentence",
  "github_url",
  "linkedin_url",
  "events",
  "submitted_at",
] as const;
export const SEED_IDEA_COLUMNS = ["owner_email", "sentence", "event"] as const;
export const MATCH_COLUMNS = [
  "email_a",
  "email_b",
  "idea_sentence",
  "reason",
  "a_response",
  "b_response",
  "teamed_up",
  "event",
] as const;

const ROLE_WORDS: Record<string, "idea" | "builder" | "both"> = {
  idea: "idea",
  "i have an idea": "idea",
  builder: "builder",
  build: "builder",
  "i can build": "builder",
  both: "both",
};

const INTENT_WORDS: Record<string, "hackathon" | "side_project" | "cofounder"> = {
  hackathon: "hackathon",
  "hackathon partner": "hackathon",
  side_project: "side_project",
  "side project": "side_project",
  cofounder: "cofounder",
  "co-founder": "cofounder",
  "co founder": "cofounder",
};

const RESPONSE_WORDS: Record<string, "interested" | "pass" | "pending"> = {
  interested: "interested",
  yes: "interested",
  "1": "interested",
  pass: "pass",
  no: "pass",
  "2": "pass",
  pending: "pending",
  "": "pending",
};

const key = (value: string) => value.trim().toLowerCase().replaceAll(/\s+/g, " ");

/** A `;`-separated cell as a list; Google Forms checkboxes use `, ` so both are accepted. */
export function splitList(cell: string): string[] {
  return cell
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const email = z.string().trim().toLowerCase().pipe(z.email("not an email address"));

const optionalUrl = z
  .string()
  .trim()
  .transform((value) => value || null);

export const signupRowSchema = z.object({
  email,
  name: z
    .string()
    .trim()
    .transform((value) => value || null),
  role: z
    .string()
    .transform((value) => ROLE_WORDS[key(value)])
    .pipe(z.enum(["idea", "builder", "both"], { error: "role must be idea, builder or both" })),
  intents: z
    .string()
    .transform((value) => {
      const intents = splitList(value).map((part) => INTENT_WORDS[key(part)]);
      return intents.every(Boolean) && intents.length
        ? [...new Set(intents as string[])]
        : ["hackathon"];
    })
    .pipe(z.array(z.enum(["hackathon", "side_project", "cofounder"]))),
  sentence: z.string().trim().min(3, "the sentence is empty"),
  github_url: optionalUrl,
  linkedin_url: optionalUrl,
  events: z.string().transform(splitList),
});
export type SignupRow = z.output<typeof signupRowSchema>;

export const seedIdeaRowSchema = z.object({
  owner_email: email,
  sentence: z.string().trim().min(10, "the idea is too short"),
  event: z
    .string()
    .trim()
    .transform((value) => value || null),
});
export type SeedIdeaRow = z.output<typeof seedIdeaRowSchema>;

const response = z
  .string()
  .transform((value) => RESPONSE_WORDS[key(value)])
  .pipe(z.enum(["interested", "pass", "pending"], { error: "use interested, pass or pending" }));

export const matchRowSchema = z
  .object({
    email_a: email,
    email_b: email,
    idea_sentence: z
      .string()
      .trim()
      .transform((value) => value || null),
    reason: z
      .string()
      .trim()
      .transform((value) => value || null),
    a_response: response,
    b_response: response,
    teamed_up: z.string().transform((value) => ["yes", "y", "true", "1"].includes(key(value))),
    event: z
      .string()
      .trim()
      .transform((value) => value || null),
  })
  .refine((row) => row.email_a !== row.email_b, { message: "a match needs two different people" });
export type MatchRow = z.output<typeof matchRowSchema>;

export interface RowError {
  line: number;
  message: string;
}

/** Validates rows; line numbers count the header as line 1, like a spreadsheet. */
export function validateRows<T>(
  rows: Record<string, string>[],
  schema: z.ZodType<T>,
): { valid: { line: number; row: T }[]; errors: RowError[] } {
  const valid: { line: number; row: T }[] = [];
  const errors: RowError[] = [];
  rows.forEach((raw, index) => {
    const line = index + 2;
    const parsed = schema.safeParse(raw);
    if (parsed.success) valid.push({ line, row: parsed.data });
    else {
      const issue = parsed.error.issues[0];
      errors.push({ line, message: `${issue?.path.join(".") || "row"}: ${issue?.message}` });
    }
  });
  return { valid, errors };
}

/** Matches an event cell against known events by slug or name, ignoring case. */
export function findEvent<T extends { slug: string; name: string }>(
  events: readonly T[],
  cell: string,
): T | null {
  const wanted = key(cell);
  return events.find((event) => event.slug === wanted || key(event.name) === wanted) ?? null;
}
