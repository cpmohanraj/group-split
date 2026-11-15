import "server-only";
import { cookies } from "next/headers";
import type { Pending } from "./google";

const PROD = process.env.NODE_ENV === "production";
const NAME = PROD ? "__Host-oauth" : "oauth";

// Short-lived, HttpOnly cookie binding the Google round-trip to this browser (stops login CSRF).
// SameSite=Lax is required: the callback is a top-level GET navigation from accounts.google.com.
export async function savePending(p: Pending) {
  (await cookies()).set(NAME, JSON.stringify(p), { httpOnly: true, secure: PROD, sameSite: "lax", path: "/", maxAge: 600 });
}

export async function takePending(): Promise<Pending | null> {
  const jar = await cookies();
  const raw = jar.get(NAME)?.value;
  jar.delete(NAME);
  if (!raw || raw.length > 500) return null;
  try {
    const p = JSON.parse(raw) as Pending;
    return typeof p.state === "string" && typeof p.nonce === "string" && typeof p.verifier === "string" ? p : null;
  } catch {
    return null;
  }
}
