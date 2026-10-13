/** `document` for stored profiles and ideas, `query` for text searched against them. */
export type EmbeddingKind = "document" | "query";

export interface Embedder {
  /** One vector of `EMBEDDING_DIM` numbers per text, in the same order. */
  embed(texts: string[], kind: EmbeddingKind): Promise<number[][]>;
}

/** The only error `embed` throws: provider failure, timeout or a malformed response. */
export class EmbeddingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EmbeddingError";
  }
}
