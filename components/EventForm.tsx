"use client";
import { useMemo, useState, useTransition } from "react";
import { saveEvent, type EventInput } from "@/app/actions";
import { splitCents, parseAmount, type SplitMode } from "@/lib/ledger";
import { money } from "./format";

type Person = { id: number; name: string };
type Line = { key: number; description: string; amount: string; paidBy: number | ""; splitMode: SplitMode; sharers: number[] };
export type EventDraft = { id?: number; heldOn: string; note: string; attendees: number[]; expenses: Omit<Line, "key">[] };

let nextKey = 1;
const withKey = (l: Omit<Line, "key">): Line => ({ ...l, key: nextKey++ });
const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

function Chips({ people, selected, onToggle, small }: { people: Person[]; selected: number[]; onToggle: (id: number) => void; small?: boolean }) {
  return (
    <div className={`chips${small ? " sm" : ""}`}>
      {people.map((p) => (
        <button key={p.id} type="button" className="chip" aria-pressed={selected.includes(p.id)} onClick={() => onToggle(p.id)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}

export function EventForm({ people, draft, meId, onDone }: { people: Person[]; draft: EventDraft; meId: number; onDone?: () => void }) {
  const [heldOn, setHeldOn] = useState(draft.heldOn);
  const [note, setNote] = useState(draft.note);
  const [attendees, setAttendees] = useState<number[]>(draft.attendees);
  const [lines, setLines] = useState<Line[]>(() => draft.expenses.map(withKey));
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Live preview of what each person owes for this session.
  const preview = useMemo(() => {
    const owed = new Map<number, number>();
    lines.forEach((l, i) => {
      const cents = parseAmount(l.amount);
      if (!cents) return;
      for (const [id, c] of splitCents(cents, l.splitMode === "attendees" ? attendees : l.sharers, i)) owed.set(id, (owed.get(id) ?? 0) + c);
    });
    return people.filter((p) => owed.has(p.id)).map((p) => ({ ...p, cents: owed.get(p.id)! }));
  }, [lines, attendees, people]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const input: EventInput = {
      id: draft.id,
      heldOn,
      note,
      attendees,
      expenses: lines.map(({ description, amount, paidBy, splitMode, sharers }) => ({
        description,
        amount,
        paidBy: Number(paidBy),
        splitMode,
        sharers,
      })),
    };
    start(async () => {
      const r = await saveEvent(input);
      if (r?.error) return setError(r.error);
      setSaved(true);
      if (!draft.id) {
        setAttendees([]);
        setNote("");
      }
      onDone?.();
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="grid2">
        <div className="field">
          <label htmlFor={`d${draft.id ?? "new"}`}>Date</label>
          <input id={`d${draft.id ?? "new"}`} type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor={`n${draft.id ?? "new"}`}>Note (optional)</label>
          <input id={`n${draft.id ?? "new"}`} value={note} maxLength={200} placeholder="e.g. Court 3" onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>Who played?</label>
        <Chips people={people} selected={attendees} onToggle={(id) => setAttendees((a) => toggle(a, id))} />
      </div>

      <label>Costs</label>
      {lines.map((l) => (
        <div className="expense" key={l.key}>
          <div className="grid3">
            <input aria-label="Description" value={l.description} maxLength={60} placeholder="Court, paddles…" onChange={(e) => update(l.key, { description: e.target.value })} />
            <input aria-label="Amount" value={l.amount} inputMode="decimal" placeholder="$0.00" onChange={(e) => update(l.key, { amount: e.target.value })} />
            <select aria-label="Paid by" value={l.paidBy} onChange={(e) => update(l.key, { paidBy: e.target.value ? Number(e.target.value) : "" })}>
              <option value="">Paid by…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === meId ? `${p.name} (me)` : p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="foot">
            <select
              aria-label="Split"
              value={l.splitMode}
              style={{ width: "auto", minHeight: 36, padding: "6px 10px", fontSize: 14 }}
              onChange={(e) => update(l.key, { splitMode: e.target.value as SplitMode, sharers: l.sharers.length ? l.sharers : attendees })}
            >
              <option value="attendees">Split among players</option>
              <option value="selected">Split among…</option>
            </select>
            {lines.length > 1 && (
              <button type="button" className="danger sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                Remove
              </button>
            )}
          </div>
          {l.splitMode === "selected" && (
            <div style={{ marginTop: 10 }}>
              <Chips small people={people} selected={l.sharers} onToggle={(id) => update(l.key, { sharers: toggle(l.sharers, id) })} />
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        className="ghost"
        onClick={() => setLines((ls) => [...ls, withKey({ description: "", amount: "", paidBy: "", splitMode: "attendees", sharers: [] })])}
      >
        + Add cost
      </button>

      {preview.length > 0 && (
        <p className="small muted" style={{ margin: "12px 0 0" }}>
          {preview.map((p) => `${p.name} ${money(p.cents)}`).join(" · ")}
        </p>
      )}

      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : draft.id ? "Save changes" : "Save session"}
        </button>
        {saved && <span className="pos small">✓ Saved</span>}
      </div>
      {error && <p className="msg err">{error}</p>}
    </form>
  );
}
