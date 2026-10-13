import { EmbeddingError, type Embedder, type EmbeddingKind } from "./types";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
/** Texts per request. */
const BATCH_SIZE = 64;
const TIMEOUT_MS = 15_000;

interface VoyageResponse {
  data?: { index: number; embedding: number[] }[];
}

export interface VoyageOptions {
  apiKey: string;
  model: string;
  dim: number;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

/**
 * Voyage AI embeddings over the regular (non-batch) endpoint; see
 * docs/IMPLEMENTATION_PLAN.md §1 for why.
 */
export function createVoyageEmbedder(options: VoyageOptions): Embedder {
  const send = options.fetch ?? fetch;

  async function embedBatch(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
    let response: Response;
    try {
      response = await send(VOYAGE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: texts,
          model: options.model,
          input_type: kind,
          output_dimension: options.dim,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new EmbeddingError("Embeddings request failed", { cause: error });
    }
    if (!response.ok) {
      throw new EmbeddingError(`Embeddings request failed (${response.status})`);
    }

    const body = (await response.json().catch(() => null)) as VoyageResponse | null;
    const data = body?.data;
    if (!Array.isArray(data) || data.length !== texts.length) {
      throw new EmbeddingError(
        `Expected ${texts.length} embeddings, got ${Array.isArray(data) ? data.length : "none"}`,
      );
    }

    const vectors = [...data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
    for (const vector of vectors) {
      if (!Array.isArray(vector) || vector.length !== options.dim) {
        throw new EmbeddingError(
          `Expected ${options.dim}-dimension embeddings, got ${Array.isArray(vector) ? vector.length : "none"}`,
        );
      }
    }
    return vectors;
  }

  return {
    async embed(texts, kind) {
      const vectors: number[][] = [];
      for (let start = 0; start < texts.length; start += BATCH_SIZE) {
        vectors.push(...(await embedBatch(texts.slice(start, start + BATCH_SIZE), kind)));
      }
      return vectors;
    },
  };
}
