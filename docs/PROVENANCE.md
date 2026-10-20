# Public source snapshot

Prepared on **20 October 2026** from the EUJobs r18 application running on Azure.

## Source verification

The active release, running process directory and tracked source were inspected
over a read-only SSH session. The production checkout had no tracked
modifications. Its application tree matched the preserved private repository.

The public snapshot retains every file under `src/` and `public/` byte-for-byte,
along with the application dependencies, tests, TypeScript utilities, client
bundle and build configuration. [source-manifest.json](source-manifest.json)
records SHA-256 hashes for unchanged files.

## Publication changes

- A new public Git history avoids publishing historical author identities.
- The README and documentation are organized around the product, case study,
  architecture and local development.
- Dated private deployment, import and rollback records are omitted.
- Linux operator examples use generic service users, paths and administrator
  addresses. Python ingestion tools retain their implementation with those
  example strings generalized.
- The example email sender uses `example.org`.
- Public-page screenshots are included; they contain no signed-in account views.

No credentials, runtime environment files, databases, backups, user records,
private resource catalogs or historical Git objects are included. A new local
installation starts with an empty database.

## Validation

Before publication, the sanitized checkout passed:

- `npm ci`: dependency installation; audit reported zero vulnerabilities.
- `npm run verify`: **164 tests passed**, zero failed; TypeScript checks and
  production build passed.
- Gitleaks secret scan and a separate check for historical account identifiers.
- Source comparison against the Azure release.

The local validation used Node.js 25.9.0; GitHub Actions validates with Node.js 24.
Tests use isolated fixtures and mocked external services. They do not prove live
payments, email delivery, Google consent or customer adoption.

The sale statement is the builder's account of the product's commercial history.
This repository does not disclose transaction terms or claim that the October
2026 implementation was the version transferred at sale.

## Production boundary

Publication does not deploy anything. The GitHub workflow has read-only
repository permissions and no Azure credentials. The production server was
inspected only; source, services, configuration and data were not changed by
this publication task.
