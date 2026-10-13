import "server-only";
import { getConfig } from "@/lib/config";
import { createFakeEmbedder } from "./fake";
import { EmbeddingError, type Embedder, type EmbeddingKind } from "./types";
import { createVoyageEmbedder } from "./voyage";

export { EmbeddingError, type Embedder, type EmbeddingKind } from "./types";

let cached: Embedder | undefined;

function getEmbedder(): Embedder {
  if (!cached) {
    const config = getConfig();
    if (config.EMBEDDINGS_PROVIDER === "voyage") {
      // Config validation guarantees the key; this only narrows the type.
      if (!config.VOYAGE_API_KEY) throw new EmbeddingError("VOYAGE_API_KEY is not set");
      cached = createVoyageEmbedder({
        apiKey: config.VOYAGE_API_KEY,
        model: config.EMBEDDING_MODEL,
        dim: config.EMBEDDING_DIM,
      });
    } else {
      cached = createFakeEmbedder(config.EMBEDDING_DIM);
    }
  }
  return cached;
}

/**
 * Embeds texts with the provider chosen by `EMBEDDINGS_PROVIDER`. The only way
 * app code produces embeddings. Throws `EmbeddingError`.
 */
export function embed(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
  return getEmbedder().embed(texts, kind);
}
