import "server-only";
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify, type JsonWebKeyInput } from "node:crypto";

type Jwk = JsonWebKeyInput["key"] & { kid: string };
import { appUrl } from "./config";
import { checkIdTokenClaims, type IdTokenClaims } from "./oidc";

// OpenID Connect "authorization code" flow with PKCE, state and nonce.
// https://developers.google.com/identity/openid-connect/openid-connect

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const b64url = (b: Buffer) => b.toString("base64url");
export const randomToken = () => b64url(randomBytes(32));

function clientId() {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID is not set");
  return id;
}
export const redirectUri = () => `${appUrl()}/auth/google/callback`;

export type Pending = { state: string; nonce: string; verifier: string };

export function newPending(): Pending {
  return { state: randomToken(), nonce: randomToken(), verifier: randomToken() };
}

export function authorizationUrl(p: Pending): string {
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: p.state,
    nonce: p.nonce,
    code_challenge: b64url(createHash("sha256").update(p.verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return u.toString();
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Exchanges the code and returns verified ID-token claims, or throws. */
export async function exchangeCode(code: string, p: Pending): Promise<IdTokenClaims> {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: secret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: p.verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("no id_token");
  // Belt and braces: the token came straight from Google over TLS, but verify the signature anyway.
  const claims = await verifySignature(id_token);
  checkIdTokenClaims(claims, { clientId: clientId(), nonce: p.nonce, now: Date.now() / 1000 });
  return claims;
}

let jwks: { keys: Jwk[]; at: number } | undefined;

async function getKey(kid: string) {
  const fresh = jwks && Date.now() - jwks.at < 3600_000;
  if (!fresh || !jwks!.keys.some((k) => k.kid === kid)) {
    const r = await fetch(JWKS_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error("jwks fetch failed");
    jwks = { keys: (await r.json()).keys, at: Date.now() };
  }
  const jwk = jwks!.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error("unknown signing key");
  return createPublicKey({ key: jwk, format: "jwk" });
}

async function verifySignature(jwt: string): Promise<IdTokenClaims> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("malformed id_token");
  const [h, p, s] = parts;
  const header = JSON.parse(Buffer.from(h, "base64url").toString()) as { alg?: string; kid?: string };
  if (header.alg !== "RS256" || !header.kid) throw new Error("unexpected id_token alg");
  const ok = verify("RSA-SHA256", Buffer.from(`${h}.${p}`), await getKey(header.kid), Buffer.from(s, "base64url"));
  if (!ok) throw new Error("bad id_token signature");
  return JSON.parse(Buffer.from(p, "base64url").toString());
}
