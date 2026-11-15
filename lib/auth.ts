import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { audit, db } from "./db";
import type { IdTokenClaims } from "./oidc";

const SESSION_DAYS = 30;
const PROD = process.env.NODE_ENV === "production";
// __Host- prefix: browser enforces Secure, Path=/ and no Domain, so subdomains can't plant or read it.
export const SESSION_COOKIE = PROD ? "__Host-sid" : "sid";

export type Member = { id: number; name: string; email: string | null; is_admin: boolean };

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export type SignInResult = "ok" | "not_member" | "account_mismatch";

/**
 * Admits a Google-verified identity only if its email is on the member list.
 * On first sign-in the member is bound to Google's stable account id (`sub`); from then on
 * only that exact Google account can sign in as them, even if the email is later recycled.
 */
export async function signInWithGoogle(c: IdTokenClaims): Promise<SignInResult> {
  const email = c.email!.toLowerCase();
  const sql = await db();
  const [m] = await sql<{ id: number; google_sub: string | null }[]>`
    select id, google_sub from members where email = ${email} and active`;
  if (!m) {
    console.warn("sign-in refused: not a member");
    return "not_member";
  }
  if (m.google_sub && m.google_sub !== c.sub) {
    await audit(sql, m.id, "signin.refused", { reason: "google account mismatch" });
    return "account_mismatch";
  }
  if (!m.google_sub) {
    // Conditional update avoids a race between two first sign-ins.
    const bound = await sql`update members set google_sub = ${c.sub!} where id = ${m.id} and google_sub is null returning id`;
    if (bound.length === 0) return "account_mismatch";
  }
  await startSession(m.id);
  await audit(sql, m.id, "signin", {});
  return "ok";
}

async function startSession(memberId: number) {
  const sql = await db();
  const sid = randomBytes(32).toString("base64url");
  await sql`delete from login_sessions where expires_at < now()`;
  await sql`
    insert into login_sessions (token_hash, member_id, expires_at)
    values (${hash(sid)}, ${memberId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  (await cookies()).set(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: PROD,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

/** Development only: sign in without Google. Never active in production builds. */
export async function devSignIn(email: string): Promise<boolean> {
  if (process.env.NODE_ENV !== "development" || process.env.DEV_LOGIN !== "1") return false;
  const sql = await db();
  const [m] = await sql<{ id: number }[]>`select id from members where email = ${email.toLowerCase()} and active`;
  if (!m) return false;
  await startSession(m.id);
  return true;
}

export async function currentMember(): Promise<Member | null> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sid || sid.length > 100) return null;
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
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) {
    const sql = await db();
    await sql`delete from login_sessions where token_hash = ${hash(sid)}`;
  }
  jar.delete(SESSION_COOKIE);
}

export async function endAllSessionsFor(memberId: number) {
  const sql = await db();
  await sql`delete from login_sessions where member_id = ${memberId}`;
}
