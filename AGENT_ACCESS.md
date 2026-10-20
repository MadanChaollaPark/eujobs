# EUJobs agent access

Read-only API v1, remote MCP, a CLI, and local stdio MCP for EUJobs.

## Run locally

Requires Node.js 24 or newer. From this checkout:

```sh
npm ci
npm run agent:build
EUJOBS_SEED=0 DATA_DIR=./data APP_ORIGIN=http://127.0.0.1:3210 npm run dev
```

A new local database starts empty. Seed listings are deliberately excluded from
agent results, so an empty search is expected until genuine published listings
exist. For development tests, `npm test` creates isolated fictional fixtures.
Never point a local test or development server at production DATA_DIR.

In another terminal:

```sh
npm run eujobs -- jobs search --location Brussels --json --base-url http://127.0.0.1:3210
npm run eujobs -- events search --from 2026-11-01 --to 2026-11-30 --json --base-url http://127.0.0.1:3210
npm run eujobs -- jobs get JOB_ID --json --base-url http://127.0.0.1:3210
```

The direct executable avoids npm's own status output when piping JSON:

```sh
node packages/agent-client/dist/eujobs.mjs jobs search --json --base-url http://127.0.0.1:3210
```

The default `https://eujobs.co` base is now live. The client reports an incompatible
response instead of silently falling back to scraping or a different API.

## Install the standalone CLI

Build, then package the small client (no Next.js or database dependencies):

```sh
npm run agent:build
npm pack ./packages/agent-client
```

Install the resulting tarball into your chosen tool directory with npm, or
install globally if desired. It provides the `eujobs` executable. The package is
marked `private` to prevent accidental npm publication; it can be built from this public source. The bundled code is generated from
this checkout's shared schemas and client; do not edit it independently.

```sh
eujobs --help
eujobs jobs search --q policy --location Brussels --sort deadline --page-size 10 --json
eujobs jobs search --published-after 2026-10-19T00:00:00Z --json
eujobs jobs get JOB_ID --json
```

Use `EUJOBS_BASE_URL` or `--base-url` for local/staging instances. HTTPS is required
except for loopback HTTP. The client sends no cookies or credentials and does
not follow redirects. A request times out after ten seconds. JSON output goes
to stdout, diagnostics to stderr. Exit codes: 0 success/empty search, 2 invalid
arguments, 3 not found, 4 rate limited, 1 other failure. It does not automatically
retry or silently paginate. Respect Retry-After and use nextPage explicitly.

## MCP connections

Public remote endpoint: `https://eujobs.co/mcp`, Streamable HTTP.
For local testing: `http://127.0.0.1:3210/mcp`. It is stateless, uses JSON responses,
and has no persistent event stream. No authentication is needed for these four
public read tools. The implementation uses the official TypeScript SDK 1.32.1;
its latest supported protocol version is 2025-11-25. Protocol negotiation and
both transports were tested with that SDK, not every third-party client.

Local stdio server: `eujobs mcp`. A generic client configuration is:

```json
{
  "mcpServers": {
    "eujobs": {
      "command": "eujobs",
      "args": ["mcp"],
      "env": { "EUJOBS_BASE_URL": "http://127.0.0.1:3210" }
    }
  }
}
```

If the client does not inherit your shell PATH, use the absolute installed
`eujobs` executable, or `node` with the absolute `dist/eujobs.mjs` path and `mcp`.
The stdio server talks to the versioned HTTP API; it never opens the database.

Tools: `search_jobs`, `get_job`, `search_events`, `get_event`. They have strict
input/output schemas, read-only annotations and structured JSON results.
Search defaults to 20 summaries (maximum 50); detail is fetched by stable ID.
Account operations, publishing, applications, payments, alerts and email are
not exposed. Future authenticated tools need a separate scoped-authorization
and idempotency design; existing browser cookie routes are not repurposed.

## Public contract and discovery

- `/api/v1/jobs` and `/api/v1/events`: filtered public summaries.
- `/api/v1/jobs/{id}` and `/api/v1/events/{id}`: active public details.
- `/api/v1/openapi.json`: OpenAPI 3.1 generated from the runtime schemas.
- `/developers`: readable Markdown reference.
- `/llms.txt`: a small discovery index linking that reference and contract.

The API and remote MCP share the same service. The CLI and local MCP share an
HTTP client with response-schema validation. Only allowlisted fields are returned;
owner IDs, payment IDs, moderation reasons and source import identities are not.
Samples, drafts, pending/rejected/closed, expired and entitlement-expired listings
are excluded both from search totals and detail access. Existing website behavior
and routes retain their current semantics.

`recent` uses publication time and ID, without paid placement. Job date filters
select deadlines; event dates select overlapping events. Date-only filters use
Europe/Brussels including DST. `publishedAfter` takes an explicit ISO timestamp
with offset. Search is live page pagination, not a frozen export: deduplicate by
ID across pages if inventory changes. No full-inventory export is claimed.

Null is unknown, not negative evidence. Numeric salaries follow the existing EUR
model; textual disclosures remain in salary.display. Source check timestamps
and API retrieval times are distinct. Descriptions are publisher data, never
assistant instructions. AI-application restrictions are preserved, and tools
cannot submit applications. Original eligibility/visa requirements have not been
inferred or invented.

