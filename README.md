# Group Split

A tiny, single-page app for a small group (≲10 people) to share the cost of a recurring activity — e.g. a weekly pickleball court booking — when attendance varies, some weeks are skipped, and different people pay different costs each time.

**Who played, who paid, who owes.**

## How it works

- **Session** = one get-together (date, who played, one or more costs).
- **Cost** = description, amount, who paid, and how it's split:
  - *Split among players* (default) — everyone ticked as playing that day, or
  - *Split among…* — a hand-picked set of people (e.g. only paddle hirers, or the regulars when a booking was paid for but cancelled).
- **Balances** = what each person has paid minus their share, plus/minus payments between people. They always sum to zero.
- **Settle up** suggests the fewest transfers (at most n−1); "Mark paid" records it.
- New sessions pre-fill from last session's costs, so a normal week is: tick who played → Save.
- Money is stored as integer cents; leftover cents rotate so nobody always pays the extra cent.

## Security

**Sign-in: Google (OpenID Connect), invite-only.**
- Only emails an admin has added under *People* can get in. Anyone else gets "not in the group".
- Authorization-code flow with **PKCE (S256)**, a random **state** (bound to the browser by a 10-minute `__Host-` HttpOnly cookie, which stops login CSRF) and a **nonce**.
- The ID token's **RS256 signature is verified** against Google's published keys. This isn't strictly required for a token received directly over TLS, but it's done as defence in depth.
- The token's `iss`, `aud` (exactly our client id), `exp`/`iat`, `nonce` and `email_verified` claims are all checked. These checks are unit-tested in `test/oidc.test.ts`.
- **Account pinning:** on first sign-in a member is bound to Google's stable account id (`sub`). After that, only that exact Google account can sign in as them, even if the email address is later recycled or transferred. Admins can *Reset Google link* if someone legitimately changes account.
- No passwords and no mail credentials are stored. The Google client secret only identifies this app to Google; it gives no access to anyone's Google account.

**Sessions**
- Random 256-bit id, stored only as a SHA-256 hash.
- Cookie is `__Host-sid`, with `HttpOnly`, `Secure` and `SameSite=Lax` set. Sessions last 30 days.
- Deactivating someone, changing their email or resetting their Google link signs them out everywhere.

**Application**
- Every server action re-checks the session, and admin-only actions also check the role.
- All input is validated on the server and backed by database constraints (`CHECK`, foreign keys).
- Queries are parameterised throughout (postgres.js tagged templates).
- Money is stored as integer cents.
- Next.js server actions reject cross-origin requests (Origin/Host check).
- Every change and every sign-in is written to `audit_log` with who did it.

**Browser hardening**
- **Strict nonce-based CSP**, with a fresh nonce on every request (`proxy.ts`):
  - `script-src 'nonce-…' 'strict-dynamic'`
  - `style-src 'self' 'nonce-…'` (no inline styles anywhere)
  - `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'self'`
- Other headers:
  - HSTS (2 years, preload)
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - COOP/CORP `same-origin`
  - a restrictive `Permissions-Policy`
  - `noindex`
- No third-party scripts, fonts or trackers.

**Supply chain:** five runtime dependencies (next, react, react-dom, postgres, server-only), with exact versions pinned and a lockfile.

**Trust model:** any signed-in member can add or edit sessions and payments (it's a group of friends). Everything is in the audit log. Only admins manage people.

**Known limitations**
- Sign-in only works on the production URL, because Google redirect URIs must match exactly. Preview deployments are additionally behind Vercel Authentication.
- With the Neon integration's defaults, preview deployments share the production database.

## Data model (Postgres)

`members` (incl. `google_sub`) · `events` (sessions) · `attendance` · `expenses` · `expense_shares` · `payments` · `audit_log` · `login_sessions`

The schema is created automatically on first request (`lib/db.ts`); there are no migration steps to run. `ADMIN_EMAIL` is upserted as an admin on each cold start.

## Deploy to Vercel (free tiers)

1. **Import the repo:** in Vercel go to *Add New → Project* and import this repo (Next.js defaults).
2. **Add a database:** project → *Storage* → *Create* → **Neon**, then connect it to the project. This sets `DATABASE_URL`.
3. **Create the Google OAuth client** in [Google Cloud Console](https://console.cloud.google.com/):
   1. Create a project, e.g. `group-split`.
   2. Go to *Google Auth Platform → Branding*. Set the app name and support email.
   3. Go to *Audience*. Choose **External**, then **Publish app**. Only the basic `openid email profile` scopes are used, so Google doesn't require app verification.
   4. Go to *Clients → Create client → Web application*.
   5. Under *Authorised redirect URIs* add `https://<your-domain>/auth/google/callback`.
4. **Set environment variables** under *Settings → Environment Variables*:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`, marked **Sensitive**
   - `APP_URL`, e.g. `https://<your-domain>`
   - `ADMIN_EMAIL`: your Google account email
   - `ADMIN_NAME`
   - `GROUP_NAME`
   - `NEXT_PUBLIC_CURRENCY`, e.g. `AUD`
   - `TIMEZONE`, e.g. `Australia/Perth`
5. **Redeploy**, then open the site and choose *Sign in with Google*.
6. Add your group under *People*. Use each person's **Google account email**. People without an email can still be tracked; they just can't sign in.

## Making changes

All code changes go through a pull request: CI must pass and nothing merges without the owner's explicit approval. Settings changed outside Git (Vercel, Google, Neon) are recorded in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## Local development

```bash
cp .env.example .env.local   # set DATABASE_URL to a local or Neon dev database
npm install
DEV_LOGIN=1 npm run dev      # then open /auth/dev?email=<a member's email> (dev only)
npm test                     # ledger unit tests
```
