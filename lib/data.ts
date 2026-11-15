import "server-only";
import { db } from "./db";
import { balances, eventShares, settleUp, type LedgerEvent, type SplitMode, type Transfer } from "./ledger";

export type MemberRow = { id: number; name: string; email: string | null; is_admin: boolean; active: boolean; linked: boolean };
export type ExpenseRow = {
  id: number;
  description: string;
  amountCents: number;
  paidBy: number;
  splitMode: SplitMode;
  sharers: number[];
};
export type EventRow = {
  id: number;
  heldOn: string;
  note: string;
  attendees: number[];
  expenses: ExpenseRow[];
  shares: Record<number, number>;
  totalCents: number;
  createdBy: number | null;
  updatedBy: number | null;
};
export type PaymentRow = {
  id: number;
  from: number;
  to: number;
  amountCents: number;
  paidOn: string;
  note: string;
  createdBy: number | null;
};

export type AppState = {
  members: MemberRow[];
  events: EventRow[];
  payments: PaymentRow[];
  net: Record<number, number>;
  transfers: Transfer[];
};

/** The whole dataset is tiny (one small group), so load it in one go and compute in memory. */
export async function loadState(): Promise<AppState> {
  const sql = await db();
  const [members, events, attendance, expenses, shares, payments] = await Promise.all([
    sql<MemberRow[]>`select id, name, email, is_admin, active, google_sub is not null as linked from members order by active desc, lower(name)`,
    sql<{ id: number; held_on: string; note: string; created_by: number | null; updated_by: number | null }[]>`
      select id, held_on::text, note, created_by, updated_by from events order by held_on desc, id desc`,
    sql<{ event_id: number; member_id: number }[]>`select event_id, member_id from attendance`,
    sql<{ id: number; event_id: number; description: string; amount_cents: number; paid_by: number; split_mode: SplitMode }[]>`
      select id, event_id, description, amount_cents, paid_by, split_mode from expenses order by event_id, position, id`,
    sql<{ expense_id: number; member_id: number }[]>`select expense_id, member_id from expense_shares`,
    sql<{ id: number; from_member: number; to_member: number; amount_cents: number; paid_on: string; note: string; created_by: number | null }[]>`
      select id, from_member, to_member, amount_cents, paid_on::text, note, created_by from payments order by paid_on desc, id desc`,
  ]);

  const group = <T, K>(rows: T[], key: (r: T) => K) => {
    const m = new Map<K, T[]>();
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return m;
  };
  const attBy = group(attendance, (a) => a.event_id);
  const expBy = group(expenses, (e) => e.event_id);
  const shareBy = group(shares, (s) => s.expense_id);

  const eventRows: EventRow[] = events.map((e) => {
    const attendees = (attBy.get(e.id) ?? []).map((a) => a.member_id);
    const exps: ExpenseRow[] = (expBy.get(e.id) ?? []).map((x) => ({
      id: x.id,
      description: x.description,
      amountCents: x.amount_cents,
      paidBy: x.paid_by,
      splitMode: x.split_mode,
      sharers: (shareBy.get(x.id) ?? []).map((s) => s.member_id),
    }));
    const ledger: LedgerEvent = { id: e.id, attendees, expenses: exps };
    return {
      id: e.id,
      heldOn: e.held_on,
      note: e.note,
      attendees,
      expenses: exps,
      shares: Object.fromEntries(eventShares(ledger)),
      totalCents: exps.reduce((s, x) => s + x.amountCents, 0),
      createdBy: e.created_by,
      updatedBy: e.updated_by,
    };
  });

  const paymentRows: PaymentRow[] = payments.map((p) => ({
    id: p.id,
    from: p.from_member,
    to: p.to_member,
    amountCents: p.amount_cents,
    paidOn: p.paid_on,
    note: p.note,
    createdBy: p.created_by,
  }));

  const net = balances(eventRows, paymentRows);
  for (const m of members) if (!net.has(m.id)) net.set(m.id, 0);

  return {
    members,
    events: eventRows,
    payments: paymentRows,
    net: Object.fromEntries(net),
    transfers: settleUp(net),
  };
}
