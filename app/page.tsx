import { currentMember } from "@/lib/auth";
import { loadState, type EventRow } from "@/lib/data";
import { todayISO } from "@/lib/config";
import { signOut, deleteEvent, deletePayment, setMemberActive, resetGoogleLink } from "./actions";
import { EventForm, type EventDraft } from "@/components/EventForm";
import { PaymentForm } from "@/components/PaymentForm";
import { SettleButton } from "@/components/SettleButton";
import { MemberForm } from "@/components/MemberForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { money, dollars, niceDate } from "@/components/format";

export const dynamic = "force-dynamic";

const groupName = process.env.GROUP_NAME || "Pickleball";

const SIGNIN_ERRORS: Record<string, string> = {
  not_member: "That Google account's email isn't in the group. Ask an admin to add it, then try again.",
  account_mismatch: "This email is already linked to a different Google account. Ask an admin to reset it.",
  expired: "That sign-in attempt expired. Please try again.",
  cancelled: "Sign-in was cancelled.",
  failed: "Sign-in failed. Please try again.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await currentMember();
  if (!me) {
    const { error } = await searchParams;
    const message = error ? SIGNIN_ERRORS[error] : undefined;
    return (
      <main className="wrap center">
        <div className="card">
          <h1>{groupName}</h1>
          <p className="muted mt0">Who played, who paid, who owes.</p>
          {/* A plain link (not next/link): full-page navigation to start the Google flow. */}
          <a className="btn-google" href="/auth/google">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Sign in with Google
          </a>
          {message && <p className="msg err">{message}</p>}
        </div>
      </main>
    );
  }

  const s = await loadState();
  const today = todayISO();
  const name = new Map(s.members.map((m) => [m.id, m.name]));
  const who = (id: number | null) => (id === me.id ? "you" : (id && name.get(id)) || "someone");
  const active = s.members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name }));
  const myNet = s.net[me.id] ?? 0;
  const everyone = s.members.filter((m) => m.active || s.net[m.id] !== 0);

  // New sessions start from last session's costs, so a weekly booking is two taps.
  const last = s.events[0];
  const template: EventDraft = {
    heldOn: today,
    note: "",
    attendees: [],
    expenses: last
      ? last.expenses.map((e) => ({ description: e.description, amount: dollars(e.amountCents), paidBy: e.paidBy, splitMode: e.splitMode, sharers: [] }))
      : [{ description: "Court", amount: "", paidBy: me.id, splitMode: "attendees", sharers: [] }],
  };
  const draftOf = (ev: EventRow): EventDraft => ({
    id: ev.id,
    heldOn: ev.heldOn,
    note: ev.note,
    attendees: ev.attendees,
    expenses: ev.expenses.map((e) => ({ description: e.description, amount: dollars(e.amountCents), paidBy: e.paidBy, splitMode: e.splitMode, sharers: e.sharers })),
  });
  // Editing an old session may involve people who've since left — keep them selectable there.
  const peopleFor = (ev: EventRow) => {
    const ids = new Set([...ev.attendees, ...ev.expenses.flatMap((e) => [e.paidBy, ...e.sharers])]);
    return s.members.filter((m) => m.active || ids.has(m.id)).map((m) => ({ id: m.id, name: m.name }));
  };

  return (
    <main className="wrap">
      <header className="top">
        <h1>{groupName}</h1>
        <div className="who">
          <span>{me.name}</span>
          <form action={signOut}>
            <button className="link" type="submit">Sign out</button>
          </form>
        </div>
      </header>

      {/* ---------- Balances ---------- */}
      <section className="card" aria-labelledby="bal">
        <h2 id="bal">Balances</h2>
        <p className="hero">
          {myNet > 0 ? "You're owed" : myNet < 0 ? "You owe" : "You're"}
          <strong className={myNet > 0 ? "pos" : myNet < 0 ? "neg" : ""}>{myNet === 0 ? "All square" : money(Math.abs(myNet))}</strong>
        </p>
        <ul className="rows">
          {everyone.map((m) => {
            const c = s.net[m.id] ?? 0;
            return (
              <li key={m.id}>
                <span className="grow">{m.name}{m.id === me.id && <span className="muted"> (you)</span>}</span>
                <span className={`amt ${c > 0 ? "pos" : c < 0 ? "neg" : "muted"}`}>
                  {c === 0 ? "—" : `${c > 0 ? "+" : "−"}${money(Math.abs(c))}`}
                </span>
              </li>
            );
          })}
        </ul>
        {s.transfers.length > 0 && (
          <>
            <h2 className="mt18">To settle up</h2>
            <ul className="rows">
              {s.transfers.map((t) => (
                <li key={`${t.from}-${t.to}`} className="transfer">
                  <span className="grow">
                    <b>{name.get(t.from)}</b> pays <b>{name.get(t.to)}</b> <span className="amt">{money(t.amountCents)}</span>
                  </span>
                  <SettleButton from={t.from} to={t.to} cents={t.amountCents} today={today} />
                </li>
              ))}
            </ul>
          </>
        )}
        <details className="disclose mt14">
          <summary>Record a payment</summary>
          <PaymentForm people={active} meId={me.id} today={today} />
        </details>
      </section>

      {/* ---------- New session ---------- */}
      <section className="card" aria-labelledby="new">
        <h2 id="new">New session</h2>
        <EventForm key={`new-${s.events.length}`} people={active} draft={template} meId={me.id} />
      </section>

      {/* ---------- History ---------- */}
      <section className="card" aria-labelledby="hist">
        <h2 id="hist">Sessions</h2>
        {s.events.length === 0 && <p className="muted">No sessions yet. Add your first one above.</p>}
        {s.events.map((ev) => {
          const mine = ev.shares[me.id];
          return (
            <details className="session" key={ev.id}>
              <summary>
                <span className="grow">
                  <b>{niceDate(ev.heldOn)}</b>
                  <span className="muted small"> · {ev.attendees.length} played{ev.note && ` · ${ev.note}`}</span>
                </span>
                <span className="amt">{money(ev.totalCents)}</span>
              </summary>
              <div className="body">
                <ul className="rows small">
                  {ev.expenses.map((e) => (
                    <li key={e.id}>
                      <span className="grow">
                        {e.description}
                        <span className="muted">
                          {" "}· paid by {who(e.paidBy)} · split{" "}
                          {e.splitMode === "attendees" ? `among ${ev.attendees.length} players` : `among ${e.sharers.map((id) => name.get(id)).join(", ")}`}
                        </span>
                      </span>
                      <span className="amt">{money(e.amountCents)}</span>
                    </li>
                  ))}
                </ul>
                <p className="small line10">
                  {Object.entries(ev.shares).map(([id, c]) => `${name.get(Number(id))} ${money(c)}`).join(" · ")}
                </p>
                {mine !== undefined && <p className="small muted line4">Your share: {money(mine)}</p>}
                <p className="small muted line4">
                  Added by {who(ev.createdBy)}{ev.updatedBy && ev.updatedBy !== ev.createdBy ? `, edited by ${who(ev.updatedBy)}` : ""}
                </p>
                <details className="disclose mt10">
                  <summary>Edit</summary>
                  <EventForm people={peopleFor(ev)} draft={draftOf(ev)} meId={me.id} />
                </details>
                <div className="actions">
                  <ConfirmAction run={deleteEvent.bind(null, ev.id)} label="Delete session" confirm={`Delete the session on ${niceDate(ev.heldOn)}?`} />
                </div>
              </div>
            </details>
          );
        })}
      </section>

      {/* ---------- Payments ---------- */}
      {s.payments.length > 0 && (
        <section className="card" aria-labelledby="pay">
          <h2 id="pay">Payments</h2>
          <ul className="rows small">
            {s.payments.slice(0, 30).map((p) => (
              <li key={p.id}>
                <span className="grow">
                  {name.get(p.from)} → {name.get(p.to)}
                  <span className="muted"> · {niceDate(p.paidOn)}{p.note && ` · ${p.note}`}</span>
                </span>
                <span className="amt">{money(p.amountCents)}</span>
                <ConfirmAction run={deletePayment.bind(null, p.id)} label="✕" confirm="Delete this payment?" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- People ---------- */}
      <section className="card" aria-labelledby="ppl">
        <h2 id="ppl">People</h2>
        <ul className="rows">
          {s.members.map((m) => (
            <li key={m.id} className="block">
              <div className="spread">
                <span className={m.active ? "" : "muted"}>
                  {m.name}
                  {m.is_admin && <span className="badge">admin</span>}
                  {!m.active && <span className="small"> (inactive)</span>}
                  {me.is_admin && <span className="muted small"> · {m.email ?? "no email (can\u2019t sign in)"}</span>}
                </span>
                {me.is_admin && m.id !== me.id && (
                  <ConfirmAction
                    run={setMemberActive.bind(null, m.id, !m.active)}
                    label={m.active ? "Deactivate" : "Reactivate"}
                    className="ghost sm"
                    confirm={m.active ? `Deactivate ${m.name}? They'll be signed out but their history stays.` : undefined}
                  />
                )}
              </div>
              {me.is_admin && (
                <details className="disclose small">
                  <summary>Edit</summary>
                  <MemberForm member={m} />
                  {m.linked && m.id !== me.id && (
                    <div className="mt10">
                      <ConfirmAction
                        run={resetGoogleLink.bind(null, m.id)}
                        label="Reset Google link"
                        className="ghost sm"
                        confirm={`Unlink ${m.name}'s Google account? They'll be signed out and their next Google sign-in with ${m.email} will be linked instead.`}
                      />
                    </div>
                  )}
                </details>
              )}
            </li>
          ))}
        </ul>
        {me.is_admin && (
          <details className="disclose mt10">
            <summary>+ Add person</summary>
            <MemberForm />
          </details>
        )}
      </section>
    </main>
  );
}
