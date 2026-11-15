// Pure money logic. All amounts are integer cents — never floats.

export type SplitMode = "attendees" | "selected";

export type LedgerExpense = {
  id: number;
  amountCents: number;
  paidBy: number;
  splitMode: SplitMode;
  /** Used when splitMode === "selected" */
  sharers: number[];
};

export type LedgerEvent = {
  id: number;
  attendees: number[];
  expenses: LedgerExpense[];
};

export type LedgerPayment = { from: number; to: number; amountCents: number };
export type Transfer = { from: number; to: number; amountCents: number };

/**
 * Split an amount across people. Leftover cents go one each to a rotating
 * starting person (seeded by `seed`, e.g. the expense id) so nobody is
 * systematically charged the extra cent.
 */
export function splitCents(amountCents: number, people: number[], seed = 0): Map<number, number> {
  const ids = [...new Set(people)].sort((a, b) => a - b);
  const out = new Map<number, number>();
  if (ids.length === 0) return out;
  const base = Math.floor(amountCents / ids.length);
  const remainder = amountCents - base * ids.length;
  const start = Math.abs(seed) % ids.length;
  ids.forEach((id, i) => {
    const pos = (i - start + ids.length) % ids.length;
    out.set(id, base + (pos < remainder ? 1 : 0));
  });
  return out;
}

export function expenseSharers(expense: LedgerExpense, attendees: number[]): number[] {
  return expense.splitMode === "attendees" ? attendees : expense.sharers;
}

/** What each person owes for one event (sum of their shares of every expense). */
export function eventShares(event: LedgerEvent): Map<number, number> {
  const owed = new Map<number, number>();
  for (const e of event.expenses) {
    for (const [id, c] of splitCents(e.amountCents, expenseSharers(e, event.attendees), e.id)) {
      owed.set(id, (owed.get(id) ?? 0) + c);
    }
  }
  return owed;
}

/**
 * Net position per person. Positive = the group owes them; negative = they owe.
 * The sum over everyone is always exactly zero.
 */
export function balances(events: LedgerEvent[], payments: LedgerPayment[]): Map<number, number> {
  const net = new Map<number, number>();
  const add = (id: number, c: number) => net.set(id, (net.get(id) ?? 0) + c);
  for (const ev of events) {
    for (const e of ev.expenses) add(e.paidBy, e.amountCents);
    for (const [id, c] of eventShares(ev)) add(id, -c);
  }
  for (const p of payments) {
    add(p.from, p.amountCents);
    add(p.to, -p.amountCents);
  }
  return net;
}

/** Greedy settle-up: at most n-1 transfers, largest debts cleared first. */
export function settleUp(net: Map<number, number>): Transfer[] {
  const debtors = [...net].filter(([, c]) => c < 0).map(([id, c]) => ({ id, c: -c }));
  const creditors = [...net].filter(([, c]) => c > 0).map(([id, c]) => ({ id, c }));
  const byAmount = (a: { id: number; c: number }, b: { id: number; c: number }) => b.c - a.c || a.id - b.id;
  debtors.sort(byAmount);
  creditors.sort(byAmount);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].c, creditors[j].c);
    out.push({ from: debtors[i].id, to: creditors[j].id, amountCents: amt });
    debtors[i].c -= amt;
    creditors[j].c -= amt;
    if (debtors[i].c === 0) i++;
    if (creditors[j].c === 0) j++;
  }
  return out;
}

/** "12", "12.5", "12.50", "$12.50" → 1250. Returns null if invalid or not positive. */
export function parseAmount(input: string): number | null {
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return cents > 0 ? cents : null;
}
