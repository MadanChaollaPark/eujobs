# Local development and operations

## Start locally

Requires Node.js 24 or newer and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3210`, matching the `APP_ORIGIN` in `.env.example`. The server listens on loopback. If using `http://127.0.0.1:3210` instead, set `APP_ORIGIN` to that exact origin; mutation requests enforce the configured origin.

SQLite is created in `DATA_DIR` (default `./data`). **The default inventory is empty.** No jobs, events, accounts, or automatic imports are installed. `EUJOBS_SEED=0` is the production setting; fictional sample generation only runs when `EUJOBS_SEED=1` is explicitly set. `npm run seed` initializes the database and preserves existing records; its name does not override that setting.

```sh
npm test
npm run typecheck
npm run build
npm start
```

Stop the development server before starting the production server on the same port. Tests use temporary databases and mocked payment/email providers.

## Implemented workflows

- Jobs and events: full-inventory filtering before pagination, categories, policy tags, location, contract, seniority, work arrangement, salary disclosure, sorting, and niche job pages. Events include list/calendar views and individual iCalendar downloads.
- Employer workflow: post and pay without signing in, using a private job management link; signed-in employers can also use their accounts. Drafts, Stripe payment, editorial review, changes, closing and renewal are supported. Editing revokes approval. Stale listing versions return HTTP 409 instead of overwriting changes.
- Accounts: registration, login/logout, saved opportunities, saved searches, payment history, password recovery, and email verification. There are no default credentials.
- Consented email: confirmed job alerts, a confirmed weekly newsletter, unsubscribe links, and verified-account subscription management. Transactional messages and alerts use a durable outbox.
- Resources: company/category pages, career guides, blog, lobbying entities, lobbying-related event discovery, Brussels Best directories, and a Fair Pay calculator. Company pages derive from published jobs and remain empty when there are no jobs.
- Operations: administrator moderation, contact inbox, provider/configuration status, manual editorial imports with explicit publication authorization, and online SQLite backups. Public job feeds, a sitemap, metadata, and job structured data use eligible published inventory.

The application links to employers' application destinations. It does not host CV uploads or an applicant tracking system. A preference for personally written applications is advisory; no AI-detection or blocking claim is made. Directory/source records retain their provenance and are not independently verified employers or current commercial offers.

## Employer job prices and payment lifecycle

These are the original EUJobs checkout amounts for employer-submitted jobs, charged once in EUR:

| Plan      |  Amount | Included placement                                         |
| --------- | ------: | ---------------------------------------------------------- |
| Basic     |  €99.99 | One standard job listing                                   |
| Pro       | €299.99 | One featured job; priority in default job results          |
| Recruiter | €500.00 | One featured job; highest placement in default job results |

Every employer purchase covers **one job for 30 days after approval**. A job's application deadline can end visibility sooner. There are no recurring subscriptions, automatic renewals, or unlimited-posting entitlements. Events are free.

The server chooses the amount; the browser submits only the owned job ID and selected plan. Stripe Checkout collects billing addresses and tax IDs and creates invoices. A durable local order and Stripe idempotency key prevent duplicate checkouts across concurrent requests. Checkout sessions expire within 24 hours; an older uncertain checkout requires reconciliation before another attempt.

A verified paid session grants review eligibility and normally sends the saved version to moderation. The success-page URL is not proof of payment. Publication requires administrator approval, which starts the 30-day period. Edits require another review and preserve the original expiry. Closing and then editing a job creates a draft requiring a new purchase to renew. Expired paid jobs also require renewal.

Webhooks verify the raw-body Stripe signature. Payment amount, currency, owner, job, plan, order, and session references are checked. Duplicate delivery is idempotent. Full refunds revoke only the entitlement bought by that order; an old refund cannot close a newer paid renewal. Refund-before-completion ordering and refunded expanded charge objects are handled. Refund execution itself remains an operator action in Stripe.

Administrator-curated external listings use a separate editorial origin. They do not create purchases, paid plans, featured placement, or a claim that the employer posted on EUJobs. Ordinary employer submission, approval, ownership, and payment gates remain unchanged. The public API cannot grant editorial status; sourced jobs cannot enter employer checkout.

## Posting without an account

`/submit?kind=job` is public. Employers enter job details and a private billing contact email, then continue to Stripe without registration or a password. Events still require an account. Links from the former job-posting sign-in screen redirect to the public form.

A guest draft has an isolated internal bookkeeping owner, never an account found by the entered email. That owner cannot log in, reset a password, verify an account email or receive a normal account session. The contact email stays in a separate private record and supplies Stripe billing and the transactional management email.

The browser saves a random request ID and 256-bit secret before creating the draft. An identical retry returns the same job; conflicting credentials or input are rejected. The private management link carries its secret in a URL fragment, outside HTTP request URLs, and exchanges it for an HttpOnly, secure, same-site cookie limited to that job's API path. The management page removes the fragment after access. Only token hashes are stored in access tables; email content is private outbox data.

Management supports editing, payment status, available invoice/receipt links, closing and renewal. Access initially lasts 120 days. A newly verified payment extends access to at least another 120 days and queues one secondary private-link email; repeat webhook events and ordinary access do not extend it. Email delivery failure never converts an unpaid job to paid or removes its confirmed entitlement. A checkout return/session ID alone grants neither access nor payment status.

Guest jobs use the same prices, payment verification, moderation and expiry rules as account-owned jobs. Runtime request data and access links must stay outside Git and logs.

## Configuration

Copy `.env.example`; keep all real values in a private environment file.

| Variable                                                   | Purpose                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DATA_DIR`                                                 | Persistent SQLite directory; never place it inside a disposable release                                       |
| `EUJOBS_SEED=0`                                            | Empty default; set `1` only for deliberate isolated sample data                                               |
| `EUJOBS_REQUIRE_PAYMENT=1`                                 | Require payment at both employer submission and administrator approval; payment is also required when omitted |
| `APP_ORIGIN`                                               | Exact external origin, `https://eujobs.co` for the intended production site                                   |
| `TRUST_PROXY`                                              | Set `1` only when the trusted proxy replaces incoming forwarded addresses                                     |
| `RELEASE_SHA`                                              | Release identity shown to administrators                                                                      |
| `EUJOBS_RESOURCES_FILE`                                    | Optional external catalog path; otherwise `DATA_DIR/resources.json`                                           |
| `STRIPE_SECRET_KEY`                                        | Existing Stripe account secret; server only                                                                   |
| `STRIPE_WEBHOOK_SECRET`                                    | Signing secret for this deployment's registered webhook endpoint                                              |
| `EMAIL_DELIVERY_ENABLED`                                   | `.env.example` disables delivery with `0`; use `1` after provider/sender verification                         |
| `EMAIL_PROVIDER`                                           | `resend` for the deployment configuration; `brevo` is also supported                                          |
| `RESEND_API_KEY`, `EMAIL_FROM`                             | Resend credentials and verified sender                                                                        |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | Alternative Brevo configuration                                                                               |
| `CONTACT_INBOX_EMAIL`                                      | Optional operator notification recipient; messages always remain in the admin inbox                           |

Hosted Checkout does not require a browser publishable key. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is retained only for compatibility; do not put the secret key in it. Configuration flags confirm presence, not provider connectivity or successful delivery.

Register `https://eujobs.co/api/stripe/webhook` with Stripe for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`

Legacy navigation redirects `/post-job` to job submission, `/employer-dashboard` to the account, and `/auth/forgot-password` to password recovery.

The legacy `/api/webhooks/stripe` alias is also available. Use the signing secret for the exact registered endpoint. `/api/create-checkout-session` aliases the authenticated checkout API; it does not accept old unauthenticated job IDs or import old purchases.

## Email operation

Password reset and verification tokens are expiring, single-use, and hashed in the token table. Resetting a password revokes every existing session. Alert subscriptions require an explicit confirmation action; opening a GET link alone cannot subscribe or unsubscribe. Managing subscriptions by account requires verification of that account's email address.

```sh
npm run email:worker -- --dry-run
npm run email:worker -- --run
```

The dry run reports matching/queue state without sending. `--run` processes due matches and the outbox only when delivery is configured and enabled. The provided timer runs once a minute; instant alerts check approximately every 15 minutes, with daily and weekly options. Only newly published, live, non-sample jobs after confirmation qualify.

The queue deduplicates messages and checks unsubscribe, expiry, and listing eligibility before delivery. Rate-limit rejections can retry. Ambiguous outcomes, HTTP 5xx responses, and interrupted sends are quarantined as `uncertain`; inspect provider logs before operator retry. A successful queue insert is not a delivery receipt. A cancelled multi-job digest releases the remaining eligible jobs for a fresh digest.

## Administrator access

Register an account, then promote its exact email using the same environment and database as the server:

```sh
npm run admin -- --email you@example.org --promote
```

Alternatively use `--email`, `--name`, and an explicitly supplied `EUJOBS_ADMIN_PASSWORD` to create an administrator. Never put a password in Git or shell examples. Moderation and contacts are in `/account`; `/admin/operations` and `/api/health/operations` require an administrator. `/api/health` exposes database readiness without private counts or credentials.

## Manual imports and external resources

Automatic crawling and scheduled job ingestion remain disabled. The authorized editorial sources are **`eurobrussels.com` and `jobsin.brussels`**. An existing administrator must review the source records and explicitly publish them through the CLI.

Each JSON row has this shape:

```json
{
  "sourceId": "stable-source-id",
  "checkedAt": "2026-10-09T12:00:00.000Z",
  "listing": {
    "kind": "job",
    "title": "Advertised job title",
    "organization": "Advertised employer",
    "location": "Brussels",
    "country": "Belgium",
    "topic": "EU policy",
    "summary": "An original, concise factual summary of the opportunity.",
    "description": "An original factual overview of the role and its advertised requirements, with the source page providing the full vacancy notice.",
    "employmentType": null,
    "seniority": null,
    "workMode": null,
    "sourceUrl": "https://www.eurobrussels.com/jobs/source-id",
    "url": "https://employer.example/jobs/source-id"
  }
}
```

This is a format example, not a real job or a source-verified record. Use the actual job page, application destination, stable source ID, and check time. `checkedAt` must be an explicit ISO timestamp within the last 72 hours. `sourceUrl` must be an HTTPS job page on the selected source's hostname or its `www` hostname. Both source and application URLs are required; unknown sources, stale checks, and elapsed deadlines fail validation.

Write original factual summaries and link to the source for the full notice; do not import full copied descriptions. Do not import salary estimates as advertised salaries. Unknown contract type, seniority, work arrangement, salary, or deadline must remain unknown rather than being invented. Missing employment/seniority/work-mode values are permitted for editorial imports; employer form requirements are unchanged.

```sh
npm run import:listings -- --file /private/input.json --source eurobrussels.com --admin admin@example.org
npm run import:listings -- --file /private/input.json --source eurobrussels.com --admin admin@example.org --apply
npm run import:listings -- --file /private/input.json --source eurobrussels.com --admin admin@example.org --apply --publish
```

The first command is a dry run. `--apply` creates editorial **drafts only**. Both `--apply --publish` are required to publish checked source records or their existing editorial drafts; `--publish` without `--apply` remains a dry run. `--owner` is retained as a compatibility alias but still requires an actual administrator. The CLI never charges or sends mail itself.

Editorial listings carry a sourced-listing label, source link, and check timestamp. Their visibility expires no later than 30 days after publication or at the advertised deadline, whichever comes first. They have no paid plan, payment timestamp, featured badge, or paid placement. Only an administrator can close them through the dashboard; ordinary editing, submission, approval, and checkout cannot repurpose the exemption.

The entire batch commits atomically, including new listings, source identities, audits, and its import-run record. Repeated source IDs are idempotent. Cross-source duplicates require the same normalized title, organization, location, and country. A shared application URL alone never merges vacancies; normalization preserves punctuation and does not merge merely similar names. Existing employer listings are never converted or modified. Repeating an already published import does not extend its expiry. An uncertain legacy source reservation fails for operator inspection.

Existing editorial listings can be enriched separately with `npm run enrich:listings -- --file /private/reviewed-enrichment.json --admin admin@example.org`. It defaults to a dry run; `--apply` requires reviewed source identities and expected listing versions. Updates are transactional and preserve previous content in versioned revision records without restarting publication or creating paid entitlements. Direct application routes use employer pages, recruitment systems, verified email recipients or application documents; unresolved routes show instructions without a misleading Apply button.

No production import count is established by these commands or their automated tests. Record actual staged and production results after running an authorized import.

## Reviewed organisation events

The operator-only event importer accepts an array of `{sourceId, organizationSlug, checkedAt, datePrecision, listing}` records. The slug and exact organisation name bind each event to an existing lobbying-directory entry. The HTTPS source page must belong to that entry's website; registration may use the verified external ticket platform. Keep public source evidence outside the runtime database and never infer an admission fee or access eligibility.

```sh
npm run import:events -- --file /private/reviewed-events.json --admin admin@example.org --publish
npm run import:events -- --file /private/reviewed-events.json --admin admin@example.org --apply --publish
```

The first command is a dry run. Applying without `--publish` creates drafts; publishing requires both flags. The existing administrator, source identity, recent check (within 72 hours), directory binding, future schedule, URLs and strict listing fields are validated before the transactional import. Source IDs and reviewed identities prevent duplicate publication; conflicting identities fail for review. Replaying an import leaves previously published or closed listings unchanged. Event imports never create charges, paid placement or emails.

Use `datePrecision: "datetime"` only for verified start/end timestamps with explicit offsets. For dates without confirmed hours use `"date"`, `YYYY-MM-DD` start and inclusive final date, and the venue's IANA timezone. These become date-only calendar entries with exclusive end boundaries, including across daylight-saving changes. Event searches include events continuing into the selected range; the calendar shows multi-day events on each applicable day. Unknown or conditional admission prices use `null`, with the conditions in the Attendance section; zero means explicitly free.

Imported event pages show original factual summaries, attendance conditions, source/check provenance and an event-details or registration link. They say **Listed by** because a directory organisation can publish a partner's event. The structured data does not identify that calendar publisher as the host. This is an operator-reviewed, one-time workflow, with no scheduled scraping or automatic source refresh.

External directory/editorial inventory belongs in `DATA_DIR/resources.json` or `EUJOBS_RESOURCES_FILE`, outside Git. Collections are `lobbyingEntities`, `careerGuides`, `blog`, and `brusselsBest` (with sections such as `consultancies`, `consultants`, `law-firms`, `intelligence-systems`, `digital-tools`, `trainers`, `specialists`, `articles`, and `guides`). Resource objects need stable `slug` and `name`/`title` fields; source URLs/dates, content, and relationships are preserved where supported. Explicit display-field selection excludes private contact fields. Replace the file atomically; the reader invalidates its cache on change. Database backup does not include this file, uploaded inventories, or environment secrets.

## Example Linux deployment and rollback

The checked-in systemd units are generic templates for this example layout:

```text
/srv/eujobs/releases/<release-id>/   source, dependencies, production build
/srv/eujobs/current                 symlink to the active release
/srv/eujobs/shared/runtime.env      private runtime settings
/srv/eujobs/db/eujobs.sqlite         persistent application data
/srv/backups/eujobs/                private SQLite backups and manifests
```

Set production `DATA_DIR=/srv/eujobs/db`, `APP_ORIGIN=https://eujobs.co`, `EUJOBS_SEED=0`, and `EUJOBS_REQUIRE_PAYMENT=1`. Restrict the runtime environment file to the service owner. The units use `eujobs` and `/usr/bin/node`; adapt these deliberately for another host. The web server binds to `127.0.0.1:3210`; existing HTTPS proxy/tunnel routing must forward to that address.

Prepare a new release directory, run `npm ci`, tests, typecheck, and the production build, then take a verified database backup. Record the current symlink target. Switch `current` atomically to the new release and restart `eujobs.service`; check local readiness and external HTTPS before accepting the release. Runtime data and credentials remain outside the release. Install/update the `deploy/` units with systemd and reload unit definitions; enable the web service and backup timer. Enable the email timer only after the sender and provider are configured for real delivery.

For a code rollback, point `current` atomically back to the recorded compatible release, restart the web service, and recheck readiness. Database migrations are additive, but compatibility with an arbitrary older application is not guaranteed. A database restore is a separate operation and loses writes made after the selected backup: stop the web service, email worker/timer, and imports; preserve the whole current database directory; create a clean replacement directory; restore the chosen backup as `eujobs.sqlite`; restore ownership; and restart only after validation. Do not combine a restored database with old `-wal` or `-shm` files.

## Backups and checks

```sh
python3 scripts/backup.py /srv/eujobs/db /srv/backups/eujobs
```

This uses SQLite's online backup API, independently reopens the copy for `PRAGMA integrity_check`, and writes a SHA-256/count manifest. The timer schedules a daily backup at **03:15 UTC**, with up to five minutes of random delay. Backups contain private data. Retention, off-VM copies, resource catalog backups, and restore drills require an operator policy; the script does not supply them.

Use a single application instance with persistent storage. Rate limiting is process-local; horizontal scaling requires a shared limiter and an explicit database/concurrency design. See the [behavior contract](../BUILD_CONTRACT.md) for invariants and [publication provenance](PROVENANCE.md) for validation of this snapshot.


## Consumer monthly calendar pass

Events remain publicly readable, and the existing individual `.ics` downloads remain free. The optional consumer product is **€10 once for one selected calendar month**, not a recurring subscription. The events page previews the exact month and current count before checkout, and refuses empty months. Month boundaries use Europe/Brussels; date-only events retain their published local dates. A pass covers the complete month's inventory, independently of browse filters, including earlier dates and overlapping events.

Verified Stripe payment grants a saved `.ics` snapshot and a private subscription feed. The feed adds new entries and preserves stable IDs and cancellation records for that purchased month; clients control refresh intervals. Google feed setup requires its desktop website; Apple/Outlook subscription instructions and a file-import fallback are on the private purchase page. Admission and organizer registration are separate. Guest purchases use a private recovery link, scoped HttpOnly cookie, emailed recovery capability, and at least one year of access. Full refunds revoke subsequent downloads/feed access; previously imported copies cannot be recalled.

The optional Google direct connection is **disabled until separately configured and verified**. Set the variables documented in `.env.example` only for EUJobs' own approved OAuth application. Register `https://eujobs.co/api/calendar/google/callback`, enable the Calendar API, and configure consent for `openid` and `https://www.googleapis.com/auth/calendar.app.created`. An independent 32-byte base64 `CALENDAR_TOKEN_KEY` encrypts tokens; preserve it with private backups. Do not reuse another app's OAuth credentials. Keep `GOOGLE_CALENDAR_ENABLED=0` until real consent/import/reconnect testing is complete. A connected user grants permission to create a dedicated EUJobs calendar, never broad primary-calendar access. Online credentials expire; future requested updates require reconnecting. There is no scheduled Google API sync; use the private feed for calendar-client polling.

New storage is additive: `calendar_orders`, `calendar_stripe_events`, `calendar_access_tokens`, `calendar_feed_events`, and optional `google_calendar_*` tables. Job billing, free event downloads, source importers and catalog data retain their existing behavior. The existing Stripe webhook handles both products, with separate identifiers and verified order/amount/currency/month/snapshot metadata. Payments require current provider verification; provider outages fail closed. When calendar creation has an unknown Google outcome, inspect the user's dedicated calendar before any operator reset of `createState`, to avoid duplicates.
