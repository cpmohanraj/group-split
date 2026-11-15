"use client";
import { useActionState } from "react";
import { addPayment, type FormState } from "@/app/actions";

type Person = { id: number; name: string };

export function PaymentForm({ people, meId, today }: { people: Person[]; meId: number; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addPayment, null);
  return (
    <form action={action}>
      <div className="grid2">
        <div className="field">
          <label htmlFor="pf">From</label>
          <select id="pf" name="from" defaultValue={meId} required>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pt">To</label>
          <select id="pt" name="to" defaultValue="" required>
            <option value="" disabled>Choose…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pa">Amount</label>
          <input id="pa" name="amount" inputMode="decimal" placeholder="$0.00" required />
        </div>
        <div className="field">
          <label htmlFor="pd">Date</label>
          <input id="pd" name="paidOn" type="date" defaultValue={today} required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pn">Note (optional)</label>
        <input id="pn" name="note" maxLength={200} placeholder="e.g. PayID" />
      </div>
      <button type="submit" disabled={pending}>{pending ? "Saving…" : "Record payment"}</button>
      {state?.error && <p className="msg err">{state.error}</p>}
      {state?.ok && <p className="msg ok">{state.ok}</p>}
    </form>
  );
}
