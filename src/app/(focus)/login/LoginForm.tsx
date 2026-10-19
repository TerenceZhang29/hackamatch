"use client";

import { MailCheck } from "lucide-react";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { FieldError, inputClass, labelClass } from "@/components/ui/Field";
import { requestMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm({ next, notice }: { next: string | null; notice: string | null }) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <MailCheck aria-hidden="true" className="size-12 text-accent" strokeWidth={1.6} />
        <h1 className="text-2xl font-bold tracking-tight">Check your inbox</h1>
        <p className="text-muted">
          Link sent to <span className="font-medium break-all text-ink">{state.email}</span>
        </p>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : notice;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className={labelClass}>
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
          className={inputClass}
        />
        {error ? <FieldError id="login-error">{error}</FieldError> : null}
      </div>
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg")}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
