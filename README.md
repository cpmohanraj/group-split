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

- **Sign-in by email magic link.** Only emails an admin has added can sign in. The login screen gives the same response for any email, so it doesn't reveal who's in the group.
- Tokens are 256-bit random, stored **hashed** (SHA-256), single-use, and expire after 15 minutes. Opening the link shows a *Continue* button (POST), so email link-scanners can't use up the token.
- Rate limits: 3 links per person and 30 in total per 15 minutes.
- Session cookie: `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Lax`, 60 days, stored hashed server-side. Deactivating someone or changing their email signs them out everywhere.
- Every server action checks the session. All input is validated on the server, and database constraints back that up.
- Links are built from `APP_URL`, never from the request's Host header, so a forged Host header can't redirect them.
- Security headers: CSP, HSTS, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer` (so the token can't leak through the Referer header). Pages are `noindex`.
- **Trust model:** any signed-in member can add or edit sessions and payments (it's a group of friends), and every change is written to `audit_log` with who made it. Only admins can manage people.

## Data model (Postgres)

`members` · `events` (sessions) · `attendance` · `expenses` · `expense_shares` · `payments` · `audit_log` · `login_tokens` · `login_sessions`

The schema is created automatically on first request (`lib/db.ts`); there are no migration steps to run. `ADMIN_EMAIL` is upserted as an admin on each cold start.

## Deploy to Vercel (≈10 minutes, free tiers)

1. **Import the repo:** vercel.com → *Add New… → Project* → import this GitHub repo. Accept the defaults (Next.js).
2. **Add a database:** in the project → *Storage* → *Create Database* → **Neon (Postgres)** → connect it to the project. This sets `DATABASE_URL` for you.
3. **Set environment variables** (*Settings → Environment Variables*):

   | Name | Example | Notes |
   |---|---|---|
   | `ADMIN_EMAIL` | `you@gmail.com` | You, the first admin |
   | `ADMIN_NAME` | `Raj` | |
   | `APP_URL` | `https://your-app.vercel.app` | Your production URL |
   | `GROUP_NAME` | `Pickleball` | Shown in header & emails |
   | `NEXT_PUBLIC_CURRENCY` | `AUD` | |
   | `TIMEZONE` | `Australia/Perth` | Used for "today" |
   | `SMTP_HOST` | `smtp.gmail.com` | |
   | `SMTP_PORT` | `465` | |
   | `SMTP_USER` | `you@gmail.com` | |
   | `SMTP_PASS` | *Gmail App Password* | Google Account → Security → 2-Step Verification → App passwords |
   | `MAIL_FROM` | `Pickleball <you@gmail.com>` | |

   > Why SMTP rather than Resend? Resend's free tier only sends to *your own* address until you verify a domain you own. A Gmail App Password works for anyone, for free. If you own a domain, Resend's SMTP (`smtp.resend.com`, user `resend`, pass = API key) also works with the same variables.

4. **Redeploy** so the variables take effect, then open the URL, enter your admin email and click the link.
5. **Add your group** under *People* (name + email). People without an email can still be tracked; they just can't sign in.

## Local development

```bash
cp .env.example .env.local   # set DATABASE_URL to a local or Neon dev database
npm install
npm run dev                  # with no SMTP_HOST, sign-in links are printed to the console
npm test                     # ledger unit tests
```
