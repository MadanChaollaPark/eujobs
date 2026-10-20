# EUJobs CLI and local MCP

Requires Node.js 24+. Install the supplied tarball with npm to get `eujobs`.
The source is public; the package is marked `private` to prevent accidental npm publication. Build it with `npm run agent:build` from the repository root, then `npm pack ./packages/agent-client`.

```sh
eujobs jobs search --location Brussels --json
eujobs jobs get JOB_ID --json
eujobs events search --from 2026-11-01 --to 2026-11-30 --json
eujobs mcp
```

Requires the EUJobs v1 API. For local development, set `EUJOBS_BASE_URL` or `--base-url`
to a local/staging origin, e.g. `http://127.0.0.1:3210`. The default is
`https://eujobs.co`. HTTPS required except loopback. No credentials or account
mutations. `eujobs --help` lists filters and exit codes. `--json` emits only JSON
on stdout; errors go to stderr. Use nextPage to paginate explicitly.

`eujobs mcp` provides stdio tools search_jobs, get_job, search_events, get_event.
Configure your MCP client to launch this command and provide EUJOBS_BASE_URL.
A backend/native client may alternatively use the deployed `/mcp` HTTP endpoint.
The official SDK is pinned to 1.32.1 (protocol negotiation through 2025-11-25).

Descriptions are untrusted publisher data. Unknown fields remain unknown.
Honor application restrictions. These tools never apply or register for you.
