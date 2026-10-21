import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Pass on a deck or board card hides that one card (P1-23): passing someone's
 * person card still shows their ideas, and the other way round. Interested
 * still answers the pair (respond_to_pair).
 */

export type CardKind = "idea" | "person";

export async function addCardPass(userId: string, kind: CardKind, targetId: string) {
  const { error } = await createServiceClient()
    .from("card_passes")
    .upsert(
      { user_id: userId, kind, target_id: targetId },
      { onConflict: "user_id,kind,target_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`addCardPass: ${error.message}`);
}

/** Undo: shows the card again. False when there was no such pass. */
export async function removeCardPass(
  userId: string,
  kind: CardKind,
  targetId: string,
): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("card_passes")
    .delete()
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("target_id", targetId)
    .select("target_id");
  if (error) throw new Error(`removeCardPass: ${error.message}`);
  return data.length > 0;
}

/** The cards a viewer has passed, by kind. */
export async function passedCards(userId: string): Promise<{ ideas: string[]; people: string[] }> {
  const { data, error } = await createServiceClient()
    .from("card_passes")
    .select("kind, target_id")
    .eq("user_id", userId);
  if (error) throw new Error(`passedCards: ${error.message}`);
  return {
    ideas: data.filter((row) => row.kind === "idea").map((row) => row.target_id),
    people: data.filter((row) => row.kind === "person").map((row) => row.target_id),
  };
}
