import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

const SESSION_DAYS = 60;
const TOKEN_MINUTES = 15;
const PROD = process.env.NODE_ENV === "production";
// __Host- prefix: browser enforces Secure, Path=/ and no Domain, so subdomains can't set it.
const COOKIE = PROD ? "__Host-sid" : "sid";

export type Member = { id: number; name: string; email: string | null; is_admin: boolean };

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

/**
 * Issues a one-time login token for an active member. Returns null (silently) when the
 * email isn't on the list or rate limits are hit, so the response never reveals membership.
 */
export async function issueLoginToken(email: string): Promise<{ token: string; name: string } | null> {
  const sql = await db();
  const [m] = await sql<{ id: number; name: string }[]>`
    select id, name from members where email = ${email} and active`;
  if (!m) return null;

  const [{ mine, all }] = await sql<{ mine: number; all: number }[]>`
    select count(*) filter (where member_id = ${m.id})::int as mine, count(*)::int as all
    from login_tokens where created_at > now() - interval '15 minutes'`;
  if (mine >= 3 || all >= 30) return null;

  await sql`delete from login_tokens where expires_at < now() - interval '1 day'`;
  const token = newToken();
  await sql`
    insert into login_tokens (token_hash, member_id, expires_at)
    values (${hash(token)}, ${m.id}, now() + make_interval(mins => ${TOKEN_MINUTES}))`;
  return { token, name: m.name };
}

/** Atomically consumes a token and starts a session. */
export async function consumeLoginToken(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const sql = await db();
  const [row] = await sql<{ member_id: number }[]>`
    update login_tokens t set used_at = now()
    from members m
    where t.token_hash = ${hash(token)} and t.used_at is null and t.expires_at > now()
      and m.id = t.member_id and m.active
    returning t.member_id`;
  if (!row) return false;

  const sid = newToken();
  await sql`delete from login_sessions where expires_at < now()`;
  await sql`
    insert into login_sessions (token_hash, member_id, expires_at)
    values (${hash(sid)}, ${row.member_id}, now() + make_interval(days => ${SESSION_DAYS}))`;
  (await cookies()).set(COOKIE, sid, {
    httpOnly: true,
    secure: PROD,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return true;
}

export async function currentMember(): Promise<Member | null> {
  const sid = (await cookies()).get(COOKIE)?.value;
  if (!sid) return null;
  const sql = await db();
  const [m] = await sql<Member[]>`
    select m.id, m.name, m.email, m.is_admin
    from login_sessions s join members m on m.id = s.member_id
    where s.token_hash = ${hash(sid)} and s.expires_at > now() and m.active`;
  return m ?? null;
}

export async function requireMember(): Promise<Member> {
  const m = await currentMember();
  if (!m) throw new Error("Not signed in");
  return m;
}

export async function endSession() {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (sid) {
    const sql = await db();
    await sql`delete from login_sessions where token_hash = ${hash(sid)}`;
  }
  jar.delete(COOKIE);
}

export async function endAllSessionsFor(memberId: number) {
  const sql = await db();
  await sql`delete from login_sessions where member_id = ${memberId}`;
}
