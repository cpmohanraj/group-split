"use client";
import { useTransition } from "react";
import type { FormState } from "@/app/actions";

/** A button that runs a server action, optionally after a confirm() prompt. */
export function ConfirmAction({
  run,
  label,
  confirm: question,
  className = "danger sm",
}: {
  run: () => Promise<FormState>;
  label: string;
  confirm?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (question && !window.confirm(question)) return;
        start(async () => {
          const r = await run();
          if (r?.error) window.alert(r.error);
        });
      }}
    >
      {pending ? "…" : label}
    </button>
  );
}
