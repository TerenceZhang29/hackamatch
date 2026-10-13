import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAnthropicLlm, LlmError } from "@/lib/llm/client";

const schema = z.object({ pitch: z.string(), scope: z.enum(["weekend", "ongoing"]) });

const request = {
  system: "system prompt",
  user: "user prompt",
  schema,
  toolName: "record_idea",
};

function toolResponse(input: unknown, id = "toolu_1") {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name: "record_idea", input }],
  };
}

function setup(...responses: unknown[]) {
  const create = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) create.mockRejectedValueOnce(response);
    else create.mockResolvedValueOnce(response);
  }
  const client = { messages: { create } } as unknown as Pick<Anthropic, "messages">;
  return { create, llm: createAnthropicLlm(client, "claude-haiku-5-5") };
}

describe("Anthropic llm.structured", () => {
  it("forces a single tool built from the schema and returns its parsed input", async () => {
    const { create, llm } = setup(toolResponse({ pitch: "Shift swaps", scope: "weekend" }));

    await expect(llm.structured(request)).resolves.toEqual({
      pitch: "Shift swaps",
      scope: "weekend",
    });

    expect(create).toHaveBeenCalledTimes(1);
    const [body, options] = create.mock.calls[0]!;
    expect(body).toMatchObject({
      model: "claude-haiku-5-5",
      system: "system prompt",
      messages: [{ role: "user", content: "user prompt" }],
      tool_choice: { type: "tool", name: "record_idea" },
    });
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe("record_idea");
    expect(body.tools[0].input_schema).toMatchObject({
      type: "object",
      required: ["pitch", "scope"],
      properties: { scope: { enum: ["weekend", "ongoing"] } },
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries once with the validation error appended, then succeeds", async () => {
    const { create, llm } = setup(
      toolResponse({ pitch: "Shift swaps", scope: "forever" }, "toolu_bad"),
      toolResponse({ pitch: "Shift swaps", scope: "ongoing" }),
    );

    await expect(llm.structured(request)).resolves.toEqual({
      pitch: "Shift swaps",
      scope: "ongoing",
    });

    expect(create).toHaveBeenCalledTimes(2);
    const retryMessages = create.mock.calls[1]![0].messages;
    expect(retryMessages).toHaveLength(3);
    expect(retryMessages[1].role).toBe("assistant");
    expect(retryMessages[2].content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "toolu_bad",
      is_error: true,
    });
    expect(retryMessages[2].content[0].content).toContain("scope");
  });

  it("throws LlmError when the retry is malformed too", async () => {
    const { create, llm } = setup(toolResponse({ pitch: 1 }), toolResponse({ scope: "weekend" }));

    await expect(llm.structured(request)).rejects.toBeInstanceOf(LlmError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries when the response has no tool call", async () => {
    const { create, llm } = setup(
      { stop_reason: "max_tokens", content: [] },
      toolResponse({ pitch: "Shift swaps", scope: "weekend" }),
    );

    await expect(llm.structured(request)).resolves.toMatchObject({ scope: "weekend" });
    expect(create.mock.calls[1]![0].messages).toHaveLength(1);
  });

  it("does not retry a refusal", async () => {
    const { create, llm } = setup({ stop_reason: "refusal", content: [] });

    await expect(llm.structured(request)).rejects.toThrow(/refused/);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("wraps SDK errors in LlmError", async () => {
    const apiError = new Anthropic.APIError(529, undefined, "overloaded", new Headers());
    const { llm } = setup(apiError);

    const error = await llm.structured(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as Error).message).toContain("529");
    expect((error as Error).cause).toBe(apiError);
  });

  it("gives up when the deadline passes", async () => {
    const create = vi.fn(
      (_body: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const client = { messages: { create } } as unknown as Pick<Anthropic, "messages">;
    const llm = createAnthropicLlm(client, "claude-haiku-5-5");

    await expect(llm.structured({ ...request, timeoutMs: 20 })).rejects.toThrow(/timed out/);
  });
});
