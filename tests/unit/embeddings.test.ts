import { describe, expect, it, vi } from "vitest";
import { createFakeEmbedder, fakeEmbedding } from "@/lib/embeddings/fake";
import { EmbeddingError } from "@/lib/embeddings/types";
import { createVoyageEmbedder } from "@/lib/embeddings/voyage";

const DIM = 1024;

function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((sum, value, i) => sum + value * (b[i] ?? 0), 0);
  return dot / (Math.hypot(...a) * Math.hypot(...b));
}

describe("fake embedder", () => {
  it("returns one unit vector of the configured size per text", async () => {
    const vectors = await createFakeEmbedder(DIM).embed(["react health app", ""], "document");
    expect(vectors).toHaveLength(2);
    for (const vector of vectors) {
      expect(vector).toHaveLength(DIM);
      expect(Math.hypot(...vector)).toBeCloseTo(1);
    }
  });

  it("is deterministic and ignores case and punctuation", () => {
    expect(fakeEmbedding("React, health app!", DIM)).toEqual(
      fakeEmbedding("react health app", DIM),
    );
  });

  it("puts texts that share words close together", () => {
    const a = fakeEmbedding("react health app", DIM);
    const b = fakeEmbedding("health app built in react", DIM);
    expect(cosine(a, b)).toBeGreaterThan(0.7);
  });

  it("puts unrelated texts far apart", () => {
    const a = fakeEmbedding("react health app", DIM);
    const b = fakeEmbedding("hardware climate sensor", DIM);
    expect(cosine(a, b)).toBeLessThan(0.3);
  });
});

describe("Voyage embedder", () => {
  const vector = (fill: number, dim = 4) => new Array<number>(dim).fill(fill);

  function setup(respond: (input: string[]) => unknown, status = 200) {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string) as { input: string[] };
      return new Response(JSON.stringify(respond(body.input)), { status });
    });
    const embedder = createVoyageEmbedder({
      apiKey: "test-key",
      model: "voyage-4-lite",
      dim: 4,
      fetch: fetchMock as typeof fetch,
    });
    return { fetchMock, embedder };
  }

  const echo = (input: string[]) => ({
    data: input.map((text, index) => ({ index, embedding: vector(Number(text)) })),
  });

  it("sends model, input type and dimension, and returns the vectors", async () => {
    const { fetchMock, embedder } = setup(echo);

    await expect(embedder.embed(["1", "2"], "query")).resolves.toEqual([vector(1), vector(2)]);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init!.body as string)).toEqual({
      input: ["1", "2"],
      model: "voyage-4-lite",
      input_type: "query",
      output_dimension: 4,
    });
  });

  it("sends at most 64 texts per request and keeps the order", async () => {
    const { fetchMock, embedder } = setup(echo);
    const texts = Array.from({ length: 130 }, (_, i) => String(i));

    const vectors = await embedder.embed(texts, "document");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vectors).toHaveLength(130);
    expect(vectors.map((v) => v[0])).toEqual(texts.map(Number));
  });

  it("orders vectors by the index the API returns", async () => {
    const { embedder } = setup((input) => ({ data: echo(input).data.reverse() }));
    await expect(embedder.embed(["1", "2"], "document")).resolves.toEqual([vector(1), vector(2)]);
  });

  it("makes no request for an empty list", async () => {
    const { fetchMock, embedder } = setup(echo);
    await expect(embedder.embed([], "document")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects vectors of the wrong size", async () => {
    const { embedder } = setup(() => ({ data: [{ index: 0, embedding: vector(1, 3) }] }));
    await expect(embedder.embed(["1"], "document")).rejects.toBeInstanceOf(EmbeddingError);
  });

  it("rejects a response with the wrong number of vectors", async () => {
    const { embedder } = setup(() => ({ data: [] }));
    await expect(embedder.embed(["1"], "document")).rejects.toBeInstanceOf(EmbeddingError);
  });

  it("wraps HTTP and network failures", async () => {
    const { embedder } = setup(() => ({ detail: "rate limited" }), 429);
    await expect(embedder.embed(["1"], "document")).rejects.toThrow(/429/);

    const failing = createVoyageEmbedder({
      apiKey: "k",
      model: "m",
      dim: 4,
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    await expect(failing.embed(["1"], "document")).rejects.toBeInstanceOf(EmbeddingError);
  });
});
