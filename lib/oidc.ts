// Pure ID-token claim checks (unit-tested).

export type IdTokenClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nonce?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
};

const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export function checkIdTokenClaims(c: IdTokenClaims, opts: { clientId: string; nonce: string; now: number }): void {
  const skew = 120;
  if (!c.iss || !ISSUERS.has(c.iss)) throw new Error("bad iss");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (aud.length !== 1 || aud[0] !== opts.clientId) throw new Error("bad aud");
  if (typeof c.exp !== "number" || c.exp + skew < opts.now) throw new Error("expired");
  if (typeof c.iat !== "number" || c.iat - skew > opts.now) throw new Error("issued in future");
  if (!c.nonce || c.nonce !== opts.nonce) throw new Error("bad nonce");
  if (!c.sub) throw new Error("no sub");
  if (!c.email || !(c.email_verified === true || c.email_verified === "true")) throw new Error("email not verified");
}
