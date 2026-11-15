import "server-only";
import postgres from "postgres";

type Sql = postgres.Sql;

const g = globalThis as unknown as { __sql?: Sql; __ready?: Promise<Sql> };

function client(): Sql {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  // prepare:false keeps us compatible with poolers (Neon's pooled URL / PgBouncer).
  g.__sql ??= postgres(process.env.DATABASE_URL, { prepare: false, max: 5, idle_timeout: 20 });
  return g.__sql;
}

/** Returns a ready-to-use client; creates the schema on first use. */
export function db(): Promise<Sql> {
  g.__ready ??= migrate(client()).catch((err) => {
    g.__ready = undefined; // retry on next request
    throw err;
  });
  return g.__ready;
}

const SCHEMA = /* sql */ `
create table if not exists members (
  id          serial primary key,
  name        text not null check (length(name) between 1 and 60),
  email       text unique check (email = lower(email)),
  is_admin    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Stable Google account id, bound on first sign-in.
alter table members add column if not exists google_sub text unique;
drop table if exists login_tokens;

create table if not exists login_sessions (
  token_hash  text primary key,
  member_id   int not null references members(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table if not exists events (
  id          serial primary key,
  held_on     date not null,
  note        text not null default '' check (length(note) <= 200),
  created_by  int references members(id),
  created_at  timestamptz not null default now(),
  updated_by  int references members(id),
  updated_at  timestamptz not null default now()
);

create table if not exists attendance (
  event_id    int not null references events(id) on delete cascade,
  member_id   int not null references members(id),
  primary key (event_id, member_id)
);

create table if not exists expenses (
  id            serial primary key,
  event_id      int not null references events(id) on delete cascade,
  position      int not null default 0,
  description   text not null check (length(description) between 1 and 60),
  amount_cents  int not null check (amount_cents > 0),
  paid_by       int not null references members(id),
  split_mode    text not null check (split_mode in ('attendees', 'selected'))
);

create table if not exists expense_shares (
  expense_id  int not null references expenses(id) on delete cascade,
  member_id   int not null references members(id),
  primary key (expense_id, member_id)
);

create table if not exists payments (
  id            serial primary key,
  from_member   int not null references members(id),
  to_member     int not null references members(id),
  amount_cents  int not null check (amount_cents > 0),
  paid_on       date not null,
  note          text not null default '' check (length(note) <= 200),
  created_by    int references members(id),
  created_at    timestamptz not null default now(),
  check (from_member <> to_member)
);

create table if not exists audit_log (
  id          bigserial primary key,
  member_id   int references members(id),
  action      text not null,
  detail      jsonb,
  at          timestamptz not null default now()
);
`;

async function migrate(sql: Sql): Promise<Sql> {
  await sql.begin(async (tx) => {
    // Serialise concurrent cold starts.
    await tx`select pg_advisory_xact_lock(727274)`;
    await tx.unsafe(SCHEMA);
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (email) {
      const name = (process.env.ADMIN_NAME?.trim() || email.split("@")[0]).slice(0, 60);
      await tx`
        insert into members (name, email, is_admin) values (${name}, ${email}, true)
        on conflict (email) do update set is_admin = true, active = true`;
    }
  });
  return sql;
}

export async function audit(sql: Sql | postgres.TransactionSql, memberId: number, action: string, detail: unknown) {
  await sql`insert into audit_log (member_id, action, detail) values (${memberId}, ${action}, ${sql.json(detail as postgres.JSONValue)})`;
}
