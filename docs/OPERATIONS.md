# Operations log

Settings that live outside Git (Vercel, Google Cloud, Neon) and every deployment-affecting action.
Newest first. Each entry: **what**, **why**, **how to reverse**. Values of secrets are never recorded here.

## How changes are made

- **Code:** branch → pull request → CI (typecheck, tests, build, `npm audit`) → Vercel preview build →
  owner approves **in the Claude chat** ("approve #N") → Claude merges, and the merge commit records
  `Approved-by: owner (chat)`. No direct pushes to `main`, and no merge without explicit approval of that PR number.
  (GitHub does not let the PR author approve their own PR, and Claude's GitHub access acts as the owner, so the
  approval lives in the merge commit rather than as a GitHub review.)
- **Settings:** changed via the Vercel API or dashboard, and recorded here in the same PR as any related code
  (or in a docs-only PR).
- **Secrets** (`GOOGLE_CLIENT_SECRET`, database credentials) are entered by the owner directly in Vercel as
  *Sensitive* and never pass through chat or Git.

## Log

### 2026-11-15 — Process (this PR)
- Added CI workflow, PR template and this log. Proposed branch protection for `main`.
- *Reverse:* delete `.github/` and this file.

### 2026-11-15 — Production redeploy (via Vercel API)
- Redeployed production to pick up `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- *Reverse:* Vercel → Deployments → promote a previous deployment.

### 2026-11-15 — Google OAuth client (owner, Google Cloud Console)
- Project `group-split`; Google Auth Platform, audience External, published. Web client
  `712565177351-t386sfuov9ftpvr1eb8d7i5tjqsnrpio.apps.googleusercontent.com` (client ids are public).
- Authorised redirect URI: `https://group-split-seven.vercel.app/auth/google/callback`.
- *Reverse:* delete or disable the client in Google Cloud (this blocks all sign-ins).

### 2026-11-15 — Vercel environment variables
| Variable | Change | By | Reverse |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Added (plain, Production) | Claude via API | Delete variable |
| `GOOGLE_CLIENT_SECRET` | Added (Sensitive, Production) | Owner | Delete / rotate in Google Cloud |
| `APP_URL` | Added `https://group-split-seven.vercel.app` (Production) | Claude via API | Delete (app falls back to the production domain) |
| `SMTP_HOST`, `SMTP_PORT` | Deleted (email sign-in removed) | Claude via API | n/a |
| All 18 Neon variables (`DATABASE_URL`, `POSTGRES_*`, `PG*`, `NEON_*`, `VITE_NEON_AUTH_URL`) | Removed **Preview** target, now Production only, so preview builds hold no database credentials | Claude via API | Re-tick *Preview* on each variable |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `GROUP_NAME`, `NEXT_PUBLIC_CURRENCY`, `TIMEZONE` | Added | Owner | Delete / edit |

**Open item:** a Preview deployment of branch `google-sign-in` built *before* the Neon change still carries
database credentials. Owner to delete it (Vercel → Deployments → ⋯ → Delete).

### 2026-11-15 — Code reached `main` without pull requests (process gap, now closed)
- `d0f6759` initial app (empty repo, no PR possible).
- `4cb626e` Google sign-in + security hardening — branch `google-sign-in` fast-forwarded into `main` without a PR.
- `f99d234` friendly "not configured" message — committed directly to `main`.
- From this PR onwards all code changes go through pull requests, merged only after the owner's explicit approval.

### 2026-11-15 — Initial setup
- Owner: Vercel project `group-split` imported from GitHub; Neon Postgres connected via Vercel Storage.
- Claude: personal cloud environment `group-split` with network access to `api.vercel.com` and
  `group-split-seven.vercel.app`; a Vercel API token stored there (injected by proxy, never visible to Claude).
  *Reverse:* revoke the token in Vercel → Account Settings → Tokens.
