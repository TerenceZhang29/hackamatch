import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { apiError, isUuid, readBody } from "@/lib/api/http";
import {
  authVerifyInput,
  deckAnswerSchema,
  deckSchema,
  deckUndoSchema,
  errorSchema,
  eventSchema,
  eventsSchema,
  matchAnswerSchema,
  matchesSchema,
  mePatchInput,
  meSchema,
  okSchema,
  pairSchema,
  personPageSchema,
  sessionSchema,
  taxonomySchema,
  teamUpSchema,
} from "@/lib/api/schemas";
import { answersSchema } from "@/lib/signup";
import { taxonomyView } from "@/server/api-views";

const FIXTURES = path.resolve(import.meta.dirname, "../../ios/Fixtures");

/**
 * The samples the iOS app's tests decode, each with the response it is a
 * sample of. A changed field fails here first, then in the Swift tests once
 * the sample is updated.
 */
const SAMPLES: Record<string, z.ZodType> = {
  "deck-answer-match.json": deckAnswerSchema,
  "deck-answer-pass.json": deckAnswerSchema,
  "deck-undo.json": deckUndoSchema,
  "deck.json": deckSchema,
  "error.json": errorSchema,
  "event-visitor.json": eventSchema,
  "event.json": eventSchema,
  "events.json": eventsSchema,
  "match-answer.json": matchAnswerSchema,
  "matches.json": matchesSchema,
  "me-new.json": meSchema,
  "me.json": meSchema,
  "ok.json": okSchema,
  "pair.json": pairSchema,
  "person-page.json": personPageSchema,
  "session.json": sessionSchema,
  "taxonomy.json": taxonomySchema,
  "team-up.json": teamUpSchema,
};

describe("iOS fixtures", () => {
  it("has a schema for every sample, and a sample for every schema", () => {
    expect(readdirSync(FIXTURES).sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  it.each(Object.entries(SAMPLES))("%s matches its response schema", (file, schema) => {
    const sample: unknown = JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8"));
    const parsed = schema.safeParse(sample);
    expect(parsed.error?.issues ?? []).toEqual([]);
    // Nothing is defaulted or dropped: the sample is exactly what a route sends.
    expect(parsed.data).toEqual(sample);
  });

  it("rejects a response with a field the contract doesn't name", () => {
    expect(okSchema.safeParse({ ok: true, extra: 1 }).success).toBe(false);
    expect(sessionSchema.safeParse({ accessToken: "a", refreshToken: "b" }).success).toBe(false);
  });
});

describe("the taxonomy response", () => {
  const taxonomy = taxonomyView();

  it("matches its schema and offers what sign-up accepts", () => {
    expect(taxonomySchema.safeParse(taxonomy).success).toBe(true);
    const answers = answersSchema.safeParse({
      firstName: "Ada",
      undecided: true,
      domains: taxonomy.areas.slice(0, taxonomy.maxAreas).map((area) => area.slug),
      skills: taxonomy.skills.slice(-taxonomy.maxSkills).map((skill) => skill.slug),
    });
    expect(answers.error?.issues ?? []).toEqual([]);
  });

  it("has no duplicates, and only related areas that exist", () => {
    const areas = taxonomy.areas.map((area) => area.slug);
    const skills = taxonomy.skills.map((skill) => skill.slug);
    expect(new Set(areas).size).toBe(areas.length);
    expect(new Set(skills).size).toBe(skills.length);
    for (const area of taxonomy.areas) {
      expect(area.related.filter((slug) => !areas.includes(slug))).toEqual([]);
    }
    expect(taxonomy.areas.some((area) => area.featured)).toBe(true);
    expect(taxonomy.skills.some((skill) => skill.featured && skill.group === "business")).toBe(
      true,
    );
  });
});

describe("request handling", () => {
  const post = (body: string) =>
    new Request("http://localhost/api/v1/test", { method: "POST", body });

  it("turns a bad body into a 400 with the schema's own wording", async () => {
    const result = await readBody(post(JSON.stringify({ name: { firstName: " " } })), mePatchInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({
      error: { code: "bad_request", message: "Add your first name" },
    });
  });

  it("uses a general message for zod's generic errors and for broken JSON", async () => {
    for (const raw of ["{not json", JSON.stringify({ pause: "forever" })]) {
      const result = await readBody(post(raw), mePatchInput);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      const json = errorSchema.parse(await result.response.json());
      expect(json.error.message).toBe("Something was wrong with that request.");
    }
  });

  it("accepts sign-in codes as digits only", () => {
    const email = "ut-001@cornell.edu";
    expect(authVerifyInput.safeParse({ email, code: " 123456 " }).data?.code).toBe("123456");
    expect(authVerifyInput.safeParse({ email, code: "12345" }).success).toBe(false);
    expect(authVerifyInput.safeParse({ email, code: "12345a" }).success).toBe(false);
  });

  it("gives each error its status, and never lets responses be cached", async () => {
    const statuses = (
      [
        ["unauthorized", 401],
        ["invalid_code", 401],
        ["not_onboarded", 403],
        ["not_found", 404],
        ["daily_limit", 409],
        ["confirm_needed", 409],
        ["refused", 422],
        ["rate_limited", 429],
      ] as const
    ).map(([code, status]) => [apiError(code).status, status]);
    for (const [actual, expected] of statuses) expect(actual).toBe(expected);
    const response = apiError("refused", "Use your @cornell.edu email");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: "refused", message: "Use your @cornell.edu email" },
    });
  });

  it("recognises ids", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isUuid("a0000000-0000-0000-c000-000000000001")).toBe(true);
    expect(isUuid("../matches")).toBe(false);
  });
});
