import { currentMember } from "@/lib/auth";
import { loadState, type EventRow } from "@/lib/data";
import { todayISO } from "@/lib/config";
import { signOut, deleteEvent, deletePayment, setMemberActive } from "./actions";
import { LoginForm } from "@/components/LoginForm";
import { EventForm, type EventDraft } from "@/components/EventForm";
import { PaymentForm } from "@/components/PaymentForm";
import { SettleButton } from "@/components/SettleButton";
import { MemberForm } from "@/components/MemberForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { money, dollars, niceDate } from "@/components/format";

export const dynamic = "force-dynamic";

const groupName = process.env.GROUP_NAME || "Pickleball";

export default async function Home() {
  const me = await currentMember();
  if (!me) {
    return (
      <main className="wrap center">
        <div className="card">
          <h1>{groupName}</h1>
          <p className="muted" style={{ marginTop: 0 }}>Who played, who paid, who owes.</p>
          <LoginForm />
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
            <h2 style={{ marginTop: 18 }}>To settle up</h2>
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
        <details className="disclose" style={{ marginTop: 14 }}>
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
                <p className="small" style={{ margin: "10px 0 0" }}>
                  {Object.entries(ev.shares).map(([id, c]) => `${name.get(Number(id))} ${money(c)}`).join(" · ")}
                </p>
                {mine !== undefined && <p className="small muted" style={{ margin: "4px 0 0" }}>Your share: {money(mine)}</p>}
                <p className="small muted" style={{ margin: "4px 0 0" }}>
                  Added by {who(ev.createdBy)}{ev.updatedBy && ev.updatedBy !== ev.createdBy ? `, edited by ${who(ev.updatedBy)}` : ""}
                </p>
                <details className="disclose" style={{ marginTop: 10 }}>
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
            <li key={m.id} style={{ display: "block" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span className={m.active ? "" : "muted"}>
                  {m.name}
                  {m.is_admin && <span className="badge">admin</span>}
                  {!m.active && <span className="small"> (inactive)</span>}
                  {me.is_admin && <span className="muted small"> · {m.email ?? "no email"}</span>}
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
                </details>
              )}
            </li>
          ))}
        </ul>
        {me.is_admin && (
          <details className="disclose" style={{ marginTop: 10 }}>
            <summary>+ Add person</summary>
            <MemberForm />
          </details>
        )}
      </section>
    </main>
  );
}
