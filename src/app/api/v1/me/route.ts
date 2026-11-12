import { after } from "next/server";
import { track } from "@/lib/analytics";
import { requireApiMember, requireApiUser } from "@/lib/api/auth";
import { apiError, apiJson, readBody } from "@/lib/api/http";
import { mePatchInput, meSchema, okSchema } from "@/lib/api/schemas";
import { joinName } from "@/lib/display-name";
import { pausedUntilFor } from "@/lib/pause";
import { splitSkills } from "@/lib/signup";
import { meView } from "@/server/api-views";
import {
  deleteAccount,
  embedUserAndIdeas,
  saveEditedTags,
  setPausedUntil,
  updateName,
} from "@/server/profiles";

/** The caller's own profile. Works before sign-up is finished (`onboarded: false`). */
export async function GET(request: Request) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  return apiJson(meSchema, await meView(user.id));
}

/** Changes the name, the areas and skills, or the pause; the same rules as the web's `/me`. */
export async function PATCH(request: Request) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const body = await readBody(request, mePatchInput);
  if (!body.ok) return body.response;
  const { name, tags, pause } = body.data;

  if (name) await updateName(user.id, joinName(name.firstName, name.lastName));
  if (tags) {
    const changed = await saveEditedTags(user.id, {
      ...splitSkills(tags.skills),
      domains: tags.areas,
    });
    if (changed) after(() => embedUserAndIdeas(user.id));
  }
  if (pause) {
    const pausedUntil = pausedUntilFor(pause);
    await setPausedUntil(user.id, pausedUntil);
    if (pausedUntil) await track("paused", { choice: pause }, user.id);
  }
  return apiJson(meSchema, await meView(user.id));
}

/**
 * Deletes the account and everything that cascades from it. Open to anyone
 * signed in, joined or not. `?confirm=delete` mirrors typing "delete" on the web.
 */
export async function DELETE(request: Request) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  if (new URL(request.url).searchParams.get("confirm") !== "delete") {
    return apiError("bad_request", 'Type "delete" to confirm');
  }
  await deleteAccount(user.id);
  return apiJson(okSchema, { ok: true });
}
