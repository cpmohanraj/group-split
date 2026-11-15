"use client";
import { useTransition } from "react";
import { addPayment } from "@/app/actions";
import { dollars } from "./format";

export function SettleButton({ from, to, cents, today }: { from: number; to: number; cents: number; today: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("from", String(from));
          fd.set("to", String(to));
          fd.set("amount", dollars(cents));
          fd.set("paidOn", today);
          fd.set("note", "Settled up");
          const r = await addPayment(null, fd);
          if (r?.error) window.alert(r.error);
        })
      }
    >
      {pending ? "…" : "Mark paid"}
    </button>
  );
}
