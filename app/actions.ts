"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, db } from "@/lib/db";
import { consumeLoginToken, endAllSessionsFor, endSession, issueLoginToken, requireMember } from "@/lib/auth";
import { sendLoginEmail } from "@/lib/mail";
import { appUrl } from "@/lib/config";
import { parseAmount, type SplitMode } from "@/lib/ledger";

export type FormState = { error?: string; ok?: string } | null;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);
const int = (v: unknown) => (typeof v === "number" ? v : Number(v));
const isId = (v: unknown) => Number.isInteger(int(v)) && int(v) > 0;
const validDate = (d: string) => DATE_RE.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z"));

/* ---------- Sign in / out ---------- */

export async function requestLogin(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd.get("email"), 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address." };
  try {
    const issued = await issueLoginToken(email);
    if (issued) {
      const link = `${appUrl()}/auth/verify?token=${issued.token}`;
      await sendLoginEmail(email, issued.name, link);
    }
  } catch (e) {
    console.error("login request failed", e);
    return { error: "Couldn't send the email just now. Please try again shortly." };
  }
  // Same answer either way: don't reveal who is in the group.
  return { ok: "If that email is in the group, a sign-in link is on its way. Check your inbox." };
}

export async function confirmLogin(_: FormState, fd: FormData): Promise<FormState> {
  const ok = await consumeLoginToken(str(fd.get("token"), 100));
  if (!ok) return { error: "That link has expired or was already used. Request a new one." };
  redirect("/");
}

export async function signOut() {
  await endSession();
  redirect("/");
}

/* ---------- Sessions (events) ---------- */

export type EventInput = {
  id?: number;
  heldOn: string;
  note: string;
  attendees: number[];
  expenses: { description: string; amount: string; paidBy: number; splitMode: SplitMode; sharers: number[] }[];
};

export async function saveEvent(input: EventInput): Promise<FormState> {
  const me = await requireMember();
  const sql = await db();

  // ---- validate (never trust the client) ----
  if (!input || typeof input !== "object") return { error: "Invalid request." };
  const heldOn = String(input.heldOn ?? "");
  if (!validDate(heldOn)) return { error: "Pick a valid date." };
  const note = String(input.note ?? "").trim().slice(0, 200);
  const attendees = [...new Set((Array.isArray(input.attendees) ? input.attendees : []).map(int))];
  if (!attendees.every(isId)) return { error: "Invalid attendee." };
  const rawExp = Array.isArray(input.expenses) ? input.expenses.slice(0, 20) : [];
  if (rawExp.length === 0) return { error: "Add at least one cost (e.g. the court)." };

  const exps: { description: string; amountCents: number; paidBy: number; splitMode: SplitMode; sharers: number[] }[] = [];
  for (const [i, e] of rawExp.entries()) {
    const description = String(e?.description ?? "").trim().slice(0, 60);
    const amountCents = parseAmount(String(e?.amount ?? ""));
    const paidBy = int(e?.paidBy);
    const splitMode: SplitMode = e?.splitMode === "selected" ? "selected" : "attendees";
    const sharers = [...new Set((Array.isArray(e?.sharers) ? e.sharers : []).map(int))];
    const label = description || `Cost ${i + 1}`;
    if (!description) return { error: `Give cost ${i + 1} a description.` };
    if (!amountCents) return { error: `"${label}" needs an amount like 42 or 42.50.` };
    if (!isId(paidBy)) return { error: `Who paid for "${label}"?` };
    if (!sharers.every(isId)) return { error: "Invalid person in split." };
    if (splitMode === "attendees" && attendees.length === 0)
      return { error: `Nobody is marked as playing, so "${label}" can't be split among players. Choose who shares it instead.` };
    if (splitMode === "selected" && sharers.length === 0) return { error: `Choose who shares "${label}".` };
    exps.push({ description, amountCents, paidBy, splitMode, sharers: splitMode === "selected" ? sharers : [] });
  }

  const referenced = [...new Set([...attendees, ...exps.flatMap((e) => [e.paidBy, ...e.sharers])])];
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int n from members where id = any(${referenced})`;
  if (n !== referenced.length) return { error: "Someone in this session isn't in the group." };

  const editId = input.id === undefined ? null : int(input.id);
  if (editId !== null && !isId(editId)) return { error: "Invalid session." };

  // ---- write atomically ----
  const result = await sql.begin(async (tx) => {
    let id: number;
    if (editId !== null) {
      const rows = await tx`
        update events set held_on = ${heldOn}, note = ${note}, updated_by = ${me.id}, updated_at = now()
        where id = ${editId} returning id`;
      if (rows.length === 0) return null;
      id = editId;
      await tx`delete from attendance where event_id = ${id}`;
      await tx`delete from expenses where event_id = ${id}`;
    } else {
      [{ id }] = await tx<{ id: number }[]>`
        insert into events (held_on, note, created_by, updated_by) values (${heldOn}, ${note}, ${me.id}, ${me.id})
        returning id`;
    }
    if (attendees.length) {
      await tx`insert into attendance ${tx(attendees.map((m) => ({ event_id: id, member_id: m })))}`;
    }
    for (const [position, e] of exps.entries()) {
      const [{ id: expenseId }] = await tx<{ id: number }[]>`
        insert into expenses (event_id, position, description, amount_cents, paid_by, split_mode)
        values (${id}, ${position}, ${e.description}, ${e.amountCents}, ${e.paidBy}, ${e.splitMode}) returning id`;
      if (e.sharers.length) {
        await tx`insert into expense_shares ${tx(e.sharers.map((m) => ({ expense_id: expenseId, member_id: m })))}`;
      }
    }
    await audit(tx, me.id, editId !== null ? "event.update" : "event.create", { id, heldOn, note, attendees, exps });
    return id;
  });
  if (result === null) return { error: "That session no longer exists." };

  revalidatePath("/");
  return { ok: "Saved" };
}

export async function deleteEvent(id: number): Promise<FormState> {
  const me = await requireMember();
  if (!isId(id)) return { error: "Invalid session." };
  const sql = await db();
  await sql.begin(async (tx) => {
    const [ev] = await tx`select held_on::text, note from events where id = ${id}`;
    await tx`delete from events where id = ${id}`;
    if (ev) await audit(tx, me.id, "event.delete", { id, ...ev });
  });
  revalidatePath("/");
  return { ok: "Deleted" };
}

/* ---------- Payments between people ---------- */

export async function addPayment(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMember();
  const from = int(fd.get("from"));
  const to = int(fd.get("to"));
  const amountCents = parseAmount(str(fd.get("amount"), 20));
  const paidOn = str(fd.get("paidOn"), 10);
  const note = str(fd.get("note"), 200);
  if (!isId(from) || !isId(to)) return { error: "Choose who paid whom." };
  if (from === to) return { error: "Payer and recipient must be different people." };
  if (!amountCents) return { error: "Enter an amount like 15 or 15.50." };
  if (!validDate(paidOn)) return { error: "Pick a valid date." };

  const sql = await db();
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int n from members where id in (${from}, ${to})`;
  if (n !== 2) return { error: "Unknown person." };
  await sql.begin(async (tx) => {
    const [{ id }] = await tx<{ id: number }[]>`
      insert into payments (from_member, to_member, amount_cents, paid_on, note, created_by)
      values (${from}, ${to}, ${amountCents}, ${paidOn}, ${note}, ${me.id}) returning id`;
    await audit(tx, me.id, "payment.create", { id, from, to, amountCents, paidOn, note });
  });
  revalidatePath("/");
  return { ok: "Payment recorded" };
}

export async function deletePayment(id: number): Promise<FormState> {
  const me = await requireMember();
  if (!isId(id)) return { error: "Invalid payment." };
  const sql = await db();
  await sql.begin(async (tx) => {
    const [p] = await tx`delete from payments where id = ${id} returning *`;
    if (p) await audit(tx, me.id, "payment.delete", p);
  });
  revalidatePath("/");
  return { ok: "Deleted" };
}

/* ---------- Members (admins only) ---------- */

export async function saveMember(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMember();
  if (!me.is_admin) return { error: "Only admins can manage people." };
  const idRaw = fd.get("id");
  const id = idRaw ? int(idRaw) : null;
  const name = str(fd.get("name"), 60);
  const email = str(fd.get("email"), 254).toLowerCase() || null;
  const isAdmin = fd.get("isAdmin") === "on";
  if (!name) return { error: "Name is required." };
  if (email && !EMAIL_RE.test(email)) return { error: "That email doesn't look right." };
  if (id !== null && !isId(id)) return { error: "Invalid person." };
  if (id === me.id && !isAdmin) return { error: "You can't remove your own admin rights." };

  const sql = await db();
  try {
    await sql.begin(async (tx) => {
      if (id === null) {
        const [{ id: newId }] = await tx<{ id: number }[]>`
          insert into members (name, email, is_admin) values (${name}, ${email}, ${isAdmin}) returning id`;
        await audit(tx, me.id, "member.create", { id: newId, name, email, isAdmin });
      } else {
        const [before] = await tx<{ email: string | null }[]>`select email from members where id = ${id}`;
        await tx`update members set name = ${name}, email = ${email}, is_admin = ${isAdmin} where id = ${id}`;
        // Changing someone's email signs them out everywhere.
        if (before && before.email !== email) await tx`delete from login_sessions where member_id = ${id}`;
        await audit(tx, me.id, "member.update", { id, name, email, isAdmin });
      }
    });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23505") return { error: "Someone already has that email." };
    throw e;
  }
  revalidatePath("/");
  return { ok: id === null ? `${name} added` : "Saved" };
}

export async function setMemberActive(id: number, active: boolean): Promise<FormState> {
  const me = await requireMember();
  if (!me.is_admin) return { error: "Only admins can manage people." };
  if (!isId(id)) return { error: "Invalid person." };
  if (id === me.id && !active) return { error: "You can't deactivate yourself." };
  const sql = await db();
  await sql`update members set active = ${active} where id = ${id}`;
  if (!active) await endAllSessionsFor(id);
  await audit(sql, me.id, active ? "member.activate" : "member.deactivate", { id });
  revalidatePath("/");
  return { ok: active ? "Reactivated" : "Deactivated" };
}
