import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRows } from "@/lib/csv";
import {
  findEvent,
  matchRowSchema,
  seedIdeaRowSchema,
  SIGNUP_COLUMNS,
  signupRowSchema,
  splitList,
  validateRows,
} from "@/lib/phase0";

describe("parseCsvRows", () => {
  it("handles quotes, embedded commas and newlines, CRLF and a BOM", () => {
    const text = '﻿a,b,c\r\n"x, y","he said ""hi""","line\nbreak"\r\n\r\n1,,3';
    expect(parseCsvRows(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'he said "hi"', "line\nbreak"],
      ["1", "", "3"],
    ]);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsvRows('a\n"oops')).toThrow(/quoted field/);
  });
});

describe("parseCsv", () => {
  it("keys rows by lowercased header and checks required columns", () => {
    expect(parseCsv("Email,Name\nx@cornell.edu, Ann \n", ["email"])).toEqual([
      { email: "x@cornell.edu", name: "Ann" },
    ]);
    expect(() => parseCsv("email\nx", ["email", "role"])).toThrow(/missing column\(s\): role/);
  });
});

describe("signup rows", () => {
  const base = Object.fromEntries(SIGNUP_COLUMNS.map((c) => [c, ""])) as Record<string, string>;

  it("maps Google Form answers onto the app's values", () => {
    const row = signupRowSchema.parse({
      ...base,
      email: " MP101@Cornell.edu ",
      name: "Maya Patel",
      role: "I have an idea",
      intents: "hackathon partner; co-founder",
      sentence: "An app for nurses to swap shifts",
      events: "Cornell Tech Fall Hack; Health AI Buildathon",
    });
    expect(row).toEqual({
      email: "mp101@cornell.edu",
      name: "Maya Patel",
      role: "idea",
      intents: ["hackathon", "cofounder"],
      sentence: "An app for nurses to swap shifts",
      github_url: null,
      linkedin_url: null,
      events: ["Cornell Tech Fall Hack", "Health AI Buildathon"],
    });
  });

  it("defaults intents to hackathon and reports bad rows with spreadsheet line numbers", () => {
    const { valid, errors } = validateRows(
      [
        { ...base, email: "a@cornell.edu", role: "Both", sentence: "I build and have ideas" },
        { ...base, email: "not-an-email", role: "builder", sentence: "I build iOS apps" },
        { ...base, email: "c@cornell.edu", role: "investor", sentence: "I fund things" },
      ],
      signupRowSchema,
    );
    expect(valid.map((v) => v.row.intents)).toEqual([["hackathon"]]);
    expect(errors).toEqual([
      { line: 3, message: "email: not an email address" },
      { line: 4, message: "role: role must be idea, builder or both" },
    ]);
  });
});

describe("seed idea and match rows", () => {
  it("parses a seed idea", () => {
    expect(
      seedIdeaRowSchema.parse({
        owner_email: "Founder@cornell.edu",
        sentence: "A study-group finder app",
        event: "",
      }),
    ).toEqual({
      owner_email: "founder@cornell.edu",
      sentence: "A study-group finder app",
      event: null,
    });
  });

  it("parses manual matches, including 1/2 replies and teamed_up", () => {
    const row = matchRowSchema.parse({
      email_a: "a@cornell.edu",
      email_b: "b@cornell.edu",
      idea_sentence: "",
      reason: "Both like health",
      a_response: "1",
      b_response: "interested",
      teamed_up: "Yes",
      event: "cornell-tech-fall-hack",
    });
    expect(row).toMatchObject({
      a_response: "interested",
      b_response: "interested",
      teamed_up: true,
    });
    expect(
      matchRowSchema.safeParse({
        ...row,
        email_b: "a@cornell.edu",
        a_response: "",
        b_response: "",
        teamed_up: "",
      }).success,
    ).toBe(false);
  });
});

describe("helpers", () => {
  it("splits lists on ; or ,", () => {
    expect(splitList(" a; b ,c ;; ")).toEqual(["a", "b", "c"]);
  });

  it("finds events by slug or name, ignoring case", () => {
    const events = [{ slug: "cornell-tech-fall-hack", name: "Cornell Tech Fall Hack" }];
    expect(findEvent(events, "CORNELL TECH FALL HACK")).toBe(events[0]);
    expect(findEvent(events, "cornell-tech-fall-hack")).toBe(events[0]);
    expect(findEvent(events, "Spring Sprint")).toBeNull();
  });
});
