import type { Embedder } from "./types";

/**
 * Deterministic stand-in for Voyage (`EMBEDDINGS_PROVIDER=fake`): bag-of-words
 * hashing, no network. Each word is hashed to one dimension, so texts that
 * share words get similar vectors and unrelated texts get near-orthogonal
 * ones. Good enough for matching to behave sensibly in tests and local dev.
 */

/** Words too common to say anything about a text. */
const STOP_WORDS = new Set(
  "a an and are as at be built by for from i in is it my of on or that the to with".split(" "),
);

/** 32-bit FNV-1a. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function fakeEmbedding(text: string, dim: number): number[] {
  const vector = new Array<number>(dim).fill(0);
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((word) => word && !STOP_WORDS.has(word));

  for (const word of words) {
    const i = hash(word) % dim;
    vector[i] = (vector[i] ?? 0) + 1;
  }

  const length = Math.hypot(...vector);
  // A text with no usable words still needs a unit vector: cosine distance
  // against a zero vector is undefined.
  if (length === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((value) => value / length);
}

export function createFakeEmbedder(dim: number): Embedder {
  return {
    async embed(texts) {
      return texts.map((text) => fakeEmbedding(text, dim));
    },
  };
}
