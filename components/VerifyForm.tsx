"use client";
import { useActionState } from "react";
import { confirmLogin, type FormState } from "@/app/actions";

// A button (POST) instead of signing in on GET, so email link-scanners can't burn the token.
export function VerifyForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmLogin, null);
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <button type="submit" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Signing in…" : "Continue"}
      </button>
      {state?.error && (
        <p className="msg err">
          {state.error} <a href="/">Back</a>
        </p>
      )}
    </form>
  );
}
