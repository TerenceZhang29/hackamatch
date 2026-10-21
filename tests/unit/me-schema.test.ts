import { describe, expect, it } from "vitest";
import { nameSchema } from "@/app/(app)/me/schema";

describe("nameSchema", () => {
  it("trims both parts; the last name defaults to empty", () => {
    expect(nameSchema.parse({ firstName: "  Maya ", lastName: " Patel " })).toEqual({
      firstName: "Maya",
      lastName: "Patel",
    });
    expect(nameSchema.parse({ firstName: "Maya" })).toEqual({ firstName: "Maya", lastName: "" });
  });

  it("requires a first name", () => {
    expect(nameSchema.safeParse({ firstName: "   " }).success).toBe(false);
    expect(nameSchema.safeParse({}).success).toBe(false);
  });

  it("caps each part at 40 characters", () => {
    expect(
      nameSchema.safeParse({ firstName: "x".repeat(40), lastName: "y".repeat(40) }).success,
    ).toBe(true);
    expect(nameSchema.safeParse({ firstName: "x".repeat(41) }).success).toBe(false);
    expect(nameSchema.safeParse({ firstName: "x", lastName: "y".repeat(41) }).success).toBe(false);
  });

  it("rejects a name that isn't text", () => {
    expect(nameSchema.safeParse({ firstName: 42 }).success).toBe(false);
  });
});

describe("joinName and splitName", () => {
  it("join the two fields and split a stored name back", async () => {
    const { joinName, splitName } = await import("@/lib/display-name");
    expect(joinName(" Maya ", " Patel ")).toBe("Maya Patel");
    expect(joinName("Maya", "")).toBe("Maya");
    expect(splitName("Maya van der Berg")).toEqual({ firstName: "Maya", lastName: "van der Berg" });
    expect(splitName(null)).toEqual({ firstName: "", lastName: "" });
  });
});
