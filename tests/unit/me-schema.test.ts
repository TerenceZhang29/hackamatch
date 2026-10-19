import { describe, expect, it } from "vitest";
import { nameSchema } from "@/app/(app)/me/schema";

describe("nameSchema", () => {
  it("trims the name", () => {
    expect(nameSchema.parse({ name: "  Maya Patel  " })).toEqual({ name: "Maya Patel" });
  });

  it("treats a blank name as no name", () => {
    expect(nameSchema.parse({ name: "   " })).toEqual({ name: null });
    expect(nameSchema.parse({})).toEqual({ name: null });
  });

  it("caps the name at 80 characters", () => {
    expect(nameSchema.safeParse({ name: "x".repeat(80) }).success).toBe(true);
    const result = nameSchema.safeParse({ name: "x".repeat(81) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Keep it under 80 characters");
  });

  it("rejects a name that isn't text", () => {
    expect(nameSchema.safeParse({ name: 42 }).success).toBe(false);
  });
});
