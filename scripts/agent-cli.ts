import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAgentClient } from '../src/lib/agents/client';
import { createAgentMcp } from '../src/lib/agents/mcp';
import { AgentError, parseQuery, publicError } from '../src/lib/agents/contract';

const help = `EUJobs — read-only jobs and events

  eujobs jobs search [filters] [--json]
  eujobs jobs get ID [--json]
  eujobs events search [filters] [--json]
  eujobs events get ID [--json]
  eujobs mcp [--base-url URL]             Start a local stdio MCP server

Common filters: --q TEXT --location TEXT --topic TEXT --from YYYY-MM-DD
  --to YYYY-MM-DD --published-after ISO_TIMESTAMP --sort ORDER --page N --page-size N
Job filters: --work-mode MODE --employment-type TYPE --seniority LEVEL
  --category-slug SLUG --policy-tag TAG --salary-only true|false
Event filters: --event-type TYPE
Sort: jobs recent|salary|deadline; events recent|soonest
Dates: job deadline or event overlap, Europe/Brussels calendar days.
Global: --base-url URL (or EUJOBS_BASE_URL; default https://eujobs.co), --json, --help
Exit: 0 success (including empty search), 2 invalid arguments, 3 not found,
  4 rate limited, 1 network/server/other failure. Diagnostics go to stderr.
Requires EUJobs agent API v1 at the selected origin.
`;
const flags: Record<string, string> = {
  q: 'q',
  location: 'location',
  topic: 'topic',
  from: 'from',
  to: 'to',
  sort: 'sort',
  page: 'page',
  'page-size': 'pageSize',
  'published-after': 'publishedAfter',
  'work-mode': 'workMode',
  'employment-type': 'employmentType',
  seniority: 'seniority',
  'category-slug': 'categorySlug',
  'policy-tag': 'policyTag',
  'salary-only': 'salaryOnly',
  'event-type': 'eventType',
};
// Publisher text is data. Never let terminal control characters execute in human output.
const terminalText = (v: string) => v.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(help);
    return;
  }
  const positional: string[] = [],
    params = new URLSearchParams(),
    seen = new Set<string>();
  let baseUrl: string | undefined,
    json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (!arg.startsWith('--') || seen.has(key))
      throw new AgentError('INVALID_ARGUMENT', `Unknown or duplicate option: ${arg}`);
    seen.add(key);
    if (key === 'json') {
      json = true;
      continue;
    }
    if (key !== 'base-url' && !Object.hasOwn(flags, key))
      throw new AgentError('INVALID_ARGUMENT', `Unknown option: ${arg}`);
    const value = argv[++i];
    if (!value || value.startsWith('--'))
      throw new AgentError('INVALID_ARGUMENT', `${arg} needs a value`);
    if (key === 'base-url') baseUrl = value;
    else params.set(flags[key], value);
  }
  const client = createAgentClient(baseUrl);
  if (positional[0] === 'mcp' && positional.length === 1 && !params.size && !json) {
    await createAgentMcp(client).connect(new StdioServerTransport());
    return;
  }
  const [collection, action, id] = positional;
  if (
    !['jobs', 'events'].includes(collection) ||
    !['search', 'get'].includes(action) ||
    (action === 'search' ? positional.length !== 2 : positional.length !== 3 || params.size > 0)
  )
    throw new AgentError(
      'INVALID_ARGUMENT',
      'Use jobs|events search, jobs|events get ID, or mcp. See --help.',
    );
  const kind = collection === 'jobs' ? 'job' : 'event';
  const result =
    action === 'search'
      ? await client.search(kind, parseQuery(params, kind))
      : await client.get(kind, id);
  if (json) {
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }
  if ('items' in result) {
    process.stdout.write(`${result.total} results; page ${result.page} of ${result.pages}\n`);
    for (const item of result.items)
      process.stdout.write(
        terminalText(`${item.id}\t${item.title}\t${item.organization}\t${item.location}`) +
          '\n' +
          terminalText(item.canonicalUrl) +
          '\n',
      );
    if (result.nextPage) process.stdout.write(`Next page: --page ${result.nextPage}\n`);
  } else {
    const item = result.item;
    process.stdout.write(
      [
        item.title,
        item.organization,
        item.location,
        item.description,
        item.canonicalUrl,
        `Application/registration: ${item.application.url || 'See listing instructions'}`,
        `Deadline: ${item.deadline || 'Unknown'}`,
        `Source checked: ${item.sourceCheckedAt || 'Unknown'}`,
      ]
        .map(terminalText)
        .join('\n') + '\n',
    );
  }
}
main().catch((error) => {
  const e = publicError(error);
  const diagnostic = {
    error: {
      code: e.code,
      message: e.message,
      ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}),
    },
  };
  process.stderr.write(
    process.argv.includes('--json')
      ? JSON.stringify(diagnostic) + '\n'
      : `${terminalText(e.code)}: ${terminalText(e.message)}\n`,
  );
  process.exitCode =
    e.code === 'INVALID_ARGUMENT' ? 2 : e.status === 404 ? 3 : e.status === 429 ? 4 : 1;
});
