# Source map

| Location | Responsibility |
| --- | --- |
| `src/app/` | Pages, account flows, admin views, HTTP routes, API v1 and remote MCP |
| `src/components/` | Search, filters, checkout, management and calendar interfaces |
| `src/lib/store.ts` | Persistent SQLite state and application invariants |
| `src/lib/auth.ts`, `account-tokens.ts` | Authentication, recovery and verification |
| `src/lib/billing.ts`, `guest-posting.ts` | Job purchases and scoped guest management |
| `src/lib/calendar-billing.ts`, `google-calendar.ts` | Calendar purchases and optional Google connection |
| `src/lib/email.ts`, `alerts.ts` | Messaging and consented alerts |
| `src/lib/agents/` | Public schemas, service, HTTP client and MCP tools |
| `src/content/`, `src/data/` | Shipped editorial content and city copy |
| `scripts/` | Administrative imports, email worker, backup, CLI and build utilities |
| `packages/agent-client/` | Standalone CLI and local MCP package |
| `tests/` | Isolated fixture tests |
| `deploy/` | Generic Linux service and timer examples |
| `.github/workflows/ci.yml` | Validation only; no deployment |

## Where to start

Read [the case study](CASE_STUDY.md), then [the architecture](ARCHITECTURE.md).
Use [the development guide](DEVELOPMENT.md) to run the application.
The [behavior contract](../BUILD_CONTRACT.md) explains the invariants tested by the suite.

The Python ingestion utilities are operator tools, not required to boot the app. Their example paths assume a dedicated Linux layout; configure your own reviewed inputs and administrator before using them. They are not run by the development server or CI.
