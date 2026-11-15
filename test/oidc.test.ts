import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIdTokenClaims, type IdTokenClaims } from "../lib/oidc.ts";

const now = 1_800_000_000;
const good: IdTokenClaims = {
  iss: "https://accounts.google.com", aud: "cid", exp: now + 3600, iat: now - 5,
  nonce: "n1", sub: "123", email: "a@b.com", email_verified: true,
};
const opts = { clientId: "cid", nonce: "n1", now };

test("accepts a valid token", () => assert.doesNotThrow(() => checkIdTokenClaims(good, opts)));

for (const [why, patch] of [
  ["wrong issuer", { iss: "https://evil.example" }],
  ["wrong audience", { aud: "other" }],
  ["multiple audiences", { aud: ["cid", "other"] }],
  ["expired", { exp: now - 1000 }],
  ["future iat", { iat: now + 1000 }],
  ["nonce mismatch", { nonce: "n2" }],
  ["missing nonce", { nonce: undefined }],
  ["missing sub", { sub: undefined }],
  ["unverified email", { email_verified: false }],
  ["missing email", { email: undefined }],
] as const) {
  test(`rejects: ${why}`, () => assert.throws(() => checkIdTokenClaims({ ...good, ...patch } as IdTokenClaims, opts)));
}
