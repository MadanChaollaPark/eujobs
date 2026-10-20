# EUJobs platform behavior contract

This document defines the current implementation's required behavior. It replaces the earlier agent ownership notes and free-submission preview contract.

## Inventory and discovery

1. Missing configuration must never seed fictional jobs or events. `EUJOBS_SEED=1` is the only opt-in to sample generation; production uses `0`.
2. No job imports, scraped job publication, or old job/account migration runs automatically. A fresh database remains empty. Curated imports from EuroBrussels and Jobs in Brussels are explicitly authorized through the administrator CLI; no crawl or publication runs automatically.
3. Public search, totals, facets, feeds, and company listings include eligible published inventory only. Draft/pending/rejected listings remain private. Expired jobs and ended events disappear from discovery; existing published/closed detail URLs remain readable with inactive application controls.
4. Apply filters to the entire inventory before sorting and pagination. Organization categories and policy tags use the submitted values; never infer an organization category from its name.
5. Database failures must remain visible failures. Never replace a failed database read with a plausible empty list.

## Accounts and authorization

- No built-in users, passwords, or administrator credentials. Passwords use scrypt; session tokens are random, stored hashed, and expire.
- Only an owner edits or changes their employer submission. Only an administrator approves or rejects it. Editorial source records cannot be edited or submitted through that workflow; actual administrators may close them. Roles are read from the database, never trusted from an HTTP body.
- Listing mutations require the current `version`; stale updates return 409.
- State-changing browser requests enforce the canonical origin, authentication where needed, bounded inputs, and rate limits. Webhooks instead require Stripe's raw-body signature.
- Password reset and verification tokens are hashed, purpose-scoped, expiring, and single-use. Password reset invalidates all sessions. Alert management requires verified control of the account email.

## Guest posting

- No sign-in, password or account registration is required to create and pay for a job. Events retain account authentication.
- Contact email never grants access to an existing account. Guest owners are isolated bookkeeping records excluded from normal authentication, sessions and account recovery.
- Draft creation is atomic and retry-safe with stable request ID, secret and input. Tokens are hashed, job-scoped and expiring; cookie permissions and management actions apply to exactly one listing.
- Private links carry secrets in fragments. Neither Stripe return URLs, session IDs nor request-supplied owner IDs can authorize job management.
- Verified payment alone extends management lifetime and queues one private management email. Repeated events/access cannot indefinitely extend links.

## Employer job payment and publication

| Plan      | Server amount (EUR cents) | Posting entitlement                |
| --------- | ------------------------: | ---------------------------------- |
| Basic     |                      9999 | One standard job                   |
| Pro       |                     29999 | One featured, priority job         |
| Recruiter |                     50000 | One featured, highest-priority job |

- Every plan is a one-time purchase for one job for 30 days after editorial approval. No subscription, automatic renewal, or unlimited posting is implied.
- Unpaid employer-submitted jobs cannot be submitted or approved. Enforce this inside the store boundary, not only in the UI or API route. Production must never set `EUJOBS_REQUIRE_PAYMENT=0`.
- Events remain free but require moderation. Editorial imports use the separate, server-only authority defined below; they do not create fake payments or weaken the employer payment gates.
- Job creation is public; checkout requires a valid saved job and either an authenticated owner or its scoped guest capability. Price/currency are server-controlled. A durable per-job reservation and Stripe idempotency key prevent concurrent duplicate sessions.
- Payment validation matches order, owner, job, plan, version, currency, amount, mode, and session. A browser redirect never grants an entitlement. A server-retrieved session or signed webhook must prove payment.
- Payment leads to moderation, not publication. If a listing changed during checkout, retain its purchased entitlement and require explicit submission of the edited draft.
- Initial approval starts the 30-day period. Edits revoke approval and preserve expiry. Expired or closed-and-edited postings require another purchase to renew.
- Duplicate webhooks and event ordering must be safe. Refund-before-completion persists terminal state; expanded refunded Stripe charges independently prevent grants. Old refunds cannot revoke a newer order's entitlement. Delayed failure events recheck Stripe before releasing a checkout reservation.
- Tax ID/billing address collection and invoices are enabled. No automatic tax calculation, refund execution, or payment success simulation is claimed.

## Email and contact

- Contact messages persist in the administrator inbox before acknowledging receipt. Optional notification enqueueing is distinct from provider delivery.
- Job alerts/newsletters require consent and a confirmation POST. GET requests cannot activate or cancel them. Older unsubscribe tokens cannot affect a newly confirmed revision.
- A durable outbox supports deduplication, leases, expiry, suppression, and eligibility checks. Newly published live non-sample jobs are matched after subscription confirmation.
- Retry definite rate-limit rejection; quarantine ambiguous provider outcomes and interrupted sends. Never automatically replay a possibly accepted send after an uncertain result.
- Cancelling a digest because a job became stale must allow still-eligible jobs to be queued again without duplicate delivery.
- Email remains disabled when explicitly configured with `EMAIL_DELIVERY_ENABLED=0`. UI acknowledgments accurately distinguish unavailable delivery, queued messages, and completed actions.

## Resources and ingestion

- External resource collections live outside Git. Render only allowed public fields, retain provenance where supplied, reject executable URLs, and treat input as data.
- No directory record is proof of ownership, demand, employer verification, or contact permission.
- Manual import defaults to validation without listing inserts. `--apply` creates editorial drafts; only `--apply --publish` publishes under explicit administrator authority. `--publish` alone is still a dry run. Both `--admin` and the compatibility `--owner` option must resolve to an actual administrator in the database.
- Accept only `eurobrussels.com` and `jobsin.brussels`, with an HTTPS job page on the selected source, an application URL, a stable `sourceId`, and a recent explicit `checkedAt` timestamp. Reject unknown sources, stale checks, expired deadlines, and client-supplied protected fields.
- Preserve source identity and provenance through server-owned `publicationOrigin`, `externalSource`, `sourceIdentity`, and `sourceCheckedAt` fields. Never accept editorial origin through ordinary listing APIs.
- Use original factual summaries instead of full copied vacancy descriptions. Import only advertised salary facts, not source estimates. Preserve unknown contract/seniority/work-mode values as null for editorial records; do not fabricate facts to satisfy employer form requirements.
- Editorial jobs are visibly sourced. Set no paid plan, payment timestamp, featured flag, or paid placement. Expiry is at most 30 days after publication, shortened by an earlier advertised deadline. Replaying a published import must not extend it.
- Commit the batch, audit, source reservations, and run ledger atomically. Deduplicate by source identity or exact normalized title, organization, location, and country across sources. A shared application URL alone is insufficient. Preserve punctuation; do not merge merely similar names. Do not modify or convert matching employer listings.
- Only administrator import code grants editorial publication. Ordinary edit/submit/approve/checkout paths reject source records; administrator close is permitted. A legacy uncertain source reservation is surfaced for inspection.
- Public companies derive from actual published jobs. Empty inventory produces honest empty company/category job results.
- Personally written application preferences are advisory. No applicant tracking, CV storage, or AI detection is implied.

## Deployment and recovery

- Release code lives in versioned directories; `current` selects the active release. SQLite, catalogs, and credentials remain outside disposable code releases.
- Apply additive schema changes without deleting existing data. Back up before release switching and preserve the prior code target.
- Use SQLite online backups, independent integrity verification, private permissions, and a manifest. A local backup is not an off-VM disaster-recovery copy.
- Roll back code only when compatible with the database. Restore a database separately with all writers stopped, the original directory preserved, and no stale WAL/SHM files attached.
- Production acceptance requires observed health, external routes, provider configuration, and the actual authorized inventory count. The initial empty-site cutover and a later approved source import must have separate recorded counts. Unit tests and a GitHub repository alone cannot establish those facts.
