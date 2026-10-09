import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const createServiceClient = vi.fn(() => ({ from: () => ({ insert }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient }));

const { track } = await import("@/lib/analytics");

describe("track", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    insert.mockReset();
  });

  it("inserts the event with props and user id", async () => {
    insert.mockResolvedValue({ error: null });
    await track("magic_link_clicked", { source: "email" }, "user-1");
    expect(insert).toHaveBeenCalledWith({
      name: "magic_link_clicked",
      props: { source: "email" },
      user_id: "user-1",
    });
  });

  it("swallows an error returned by the database", async () => {
    insert.mockResolvedValue({ error: { message: "insert failed" } });
    await expect(track("magic_link_requested")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("swallows a thrown error", async () => {
    createServiceClient.mockImplementationOnce(() => {
      throw new Error("missing service key");
    });
    await expect(track("magic_link_requested")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
