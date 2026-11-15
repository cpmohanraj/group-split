"use client";
import { useActionState } from "react";
import { requestLogin, type FormState } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestLogin, null);
  if (state?.ok) return <p className="msg ok">{state.ok}</p>;
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="email">Your email</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
      </div>
      <button type="submit" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state?.error && <p className="msg err">{state.error}</p>}
    </form>
  );
}
