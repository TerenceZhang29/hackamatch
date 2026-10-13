import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createGeminiLlm, toGeminiSchema } from "@/lib/llm/gemini";
import { rawProfileSchema } from "@/lib/llm/extract-profile";
import { LlmError } from "@/lib/llm/types";

vi.mock("@/lib/config", () => ({ getConfig: () => ({ LLM_PROVIDER: "fake" }) }));

const schema = z.object({ pitch: z.string(), scope: z.enum(["weekend", "ongoing"]) });

const request = {
  system: "system prompt",
  user: "user prompt",
  schema,
  toolName: "record_idea",
};

function completed(output: unknown) {
  const text = typeof output === "string" ? output : JSON.stringify(output);
  return {
    status: "completed",
    steps: [{ type: "model_output", content: [{ type: "text", text }] }],
  };
}

function setup(...responses: { body: unknown; status?: number }[]) {
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  });
  const llm = createGeminiLlm({
    apiKey: "test-key",
    model: "gemini-3.5-flash-lite",
    fetch: fetchMock as typeof fetch,
  });
  const bodyOf = (call: number) =>
    JSON.parse(fetchMock.mock.calls[call]![1]!.body as string) as Record<string, unknown>;
  return { fetchMock, llm, bodyOf };
}

describe("toGeminiSchema", () => {
  it("turns nullable values into type lists and drops unsupported keywords", () => {
    const converted = toGeminiSchema(
      z.toJSONSchema(
        z.object({
          name: z.string().min(1),
          domain: z.string().nullable(),
          idea: z.object({ pitch: z.string() }).nullable(),
          tags: z.array(z.string()),
        }),
      ),
    );
    expect(converted).toEqual({
      type: "object",
      properties: {
        name: { type: "string" },
        domain: { type: ["string", "null"] },
        idea: {
          type: ["object", "null"],
          properties: { pitch: { type: "string" } },
          required: ["pitch"],
          additionalProperties: false,
        },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["name", "domain", "idea", "tags"],
      additionalProperties: false,
    });
  });

  it("converts the real profile schema without anyOf", () => {
    const converted = JSON.stringify(toGeminiSchema(z.toJSONSchema(rawProfileSchema)));
    expect(converted).not.toContain("anyOf");
    expect(converted).not.toContain("minLength");
    expect(converted).toContain('"experience_level"');
  });

  it("rejects a union it cannot express", () => {
    const union = z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]);
    expect(() => toGeminiSchema(z.toJSONSchema(union))).toThrow(LlmError);
  });
});

describe("Gemini llm.structured", () => {
  it("sends a stateless JSON-schema request and returns the parsed output", async () => {
    const { fetchMock, llm, bodyOf } = setup({
      body: completed({ pitch: "Shift swaps", scope: "weekend" }),
    });

    await expect(llm.structured(request)).resolves.toEqual({
      pitch: "Shift swaps",
      scope: "weekend",
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(bodyOf(0)).toMatchObject({
      model: "gemini-3.5-flash-lite",
      system_instruction: "system prompt",
      input: "user prompt",
      store: false,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: { type: "object", required: ["pitch", "scope"] },
      },
    });
  });

  it("ignores steps that are not model output", async () => {
    const { llm } = setup({
      body: {
        status: "completed",
        steps: [
          { type: "thought", content: [{ type: "text", text: "thinking" }] },
          {
            type: "model_output",
            content: [{ type: "text", text: '{"pitch":"Shift swaps","scope":"ongoing"}' }],
          },
        ],
      },
    });
    await expect(llm.structured(request)).resolves.toMatchObject({ scope: "ongoing" });
  });

  it("retries once with the validation error appended, then succeeds", async () => {
    const { fetchMock, llm, bodyOf } = setup(
      { body: completed({ pitch: "Shift swaps", scope: "forever" }) },
      { body: completed({ pitch: "Shift swaps", scope: "ongoing" }) },
    );

    await expect(llm.structured(request)).resolves.toMatchObject({ scope: "ongoing" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryInput = bodyOf(1).input as string;
    expect(retryInput).toContain("user prompt");
    expect(retryInput).toContain('"scope":"forever"');
    expect(retryInput).toMatch(/scope: /);
  });

  it("throws LlmError when the retry is malformed too", async () => {
    const { fetchMock, llm } = setup(
      { body: completed({ pitch: 1 }) },
      { body: completed("not json") },
    );

    await expect(llm.structured(request)).rejects.toBeInstanceOf(LlmError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries an incomplete response with the same input", async () => {
    const { llm, bodyOf } = setup(
      { body: { status: "incomplete", steps: [] } },
      { body: completed({ pitch: "Shift swaps", scope: "weekend" }) },
    );

    await expect(llm.structured(request)).resolves.toMatchObject({ scope: "weekend" });
    expect(bodyOf(1).input).toBe("user prompt");
  });

  it("does not retry a failed interaction", async () => {
    const { fetchMock, llm } = setup({ body: { status: "failed" } });

    await expect(llm.structured(request)).rejects.toThrow(/failed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("wraps HTTP errors, such as a rate limit, without retrying", async () => {
    const { fetchMock, llm } = setup({ body: { error: { message: "quota" } }, status: 429 });

    const error = await llm.structured(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as Error).message).toContain("429");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up when the deadline passes", async () => {
    const hanging = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch;
    const llm = createGeminiLlm({ apiKey: "k", model: "m", fetch: hanging });

    await expect(llm.structured({ ...request, timeoutMs: 20 })).rejects.toThrow(/timed out/);
  });
});
