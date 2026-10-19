"use client";

import { useActionState } from "react";
import { requestMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm({ next, notice }: { next: string | null; notice: string | null }) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Check your inbox</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          We sent a sign-in link to <span className="font-medium break-all">{state.email}</span>. It
          works on any device and expires in an hour.
        </p>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : notice;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium">
          Cornell email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          inputMode="email"
          placeholder="netid@cornell.edu"
          defaultValue={state.status === "error" ? state.email : ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-base outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
        />
        {error ? (
          <p id="login-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
