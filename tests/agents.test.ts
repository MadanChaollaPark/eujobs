import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getDb, getListingById, searchListings } from '../src/lib/store';
import { agentService } from '../src/lib/agents/service';
import { createAgentClient } from '../src/lib/agents/client';
import { parseQuery, searchResultSchema, detailResultSchema } from '../src/lib/agents/contract';
import { agentOpenApi } from '../src/lib/agents/openapi';
import { searchResponse, detailResponse } from '../src/lib/agents/http';
import { POST as mcpPost } from '../src/app/mcp/route';
const run = promisify(execFile);
const dir = mkdtempSync(join(tmpdir(), 'eujobs-agent-tests-'));
process.env.DATA_DIR = dir;
process.env.EUJOBS_SEED = '1';
process.env.APP_ORIGIN = 'https://eujobs.example';
delete process.env.TRUST_PROXY;
const db = getDb();
const seeds = searchListings({ pageSize: 100 }).items;
const jobs = seeds.filter((l) => l.kind === 'job').slice(0, 8);
const events = seeds.filter((l) => l.kind === 'event').slice(0, 3);
const ids = jobs.map((l) => l.id);
// Isolated fictional fixtures only. Production data is neither copied nor used.
for (const l of [...jobs.slice(0, 7), ...events.slice(0, 2)])
  db.prepare('UPDATE listings SET isSample=0 WHERE id=?').run(l.id);
db.prepare("UPDATE listings SET status='draft' WHERE id=?").run(ids[3]);
db.prepare("UPDATE listings SET status='closed' WHERE id=?").run(ids[4]);
db.prepare("UPDATE listings SET deadline='2000-01-01T00:00:00.000Z' WHERE id=?").run(ids[5]);
db.prepare("UPDATE listings SET entitlementExpiresAt='2000-01-01T00:00:00.000Z' WHERE id=?").run(
  ids[6],
);
db.prepare(
  "UPDATE listings SET startsAt='1999-12-31T12:00:00.000Z', endsAt='2000-01-01T00:00:00.000Z' WHERE id=?",
).run(events[1].id);
db.prepare(
  'UPDATE listings SET publishedAt=?, placement=?, sourceUrl=?, sourceCheckedAt=?, url=?, blockAIApplications=1, applicationInstructions=?, salaryMin=NULL, salaryMax=NULL, salaryPeriod=NULL WHERE id=?',
).run(
  '2026-10-18T12:00:00.000Z',
  0,
  'https://example.org/source',
  '2026-10-18T13:00:00.000Z',
  'https://example.org/apply',
  'Apply through the official portal only.',
  ids[0],
);
db.prepare('UPDATE listings SET publishedAt=?, placement=? WHERE id=?').run(
  '2026-10-17T12:00:00.000Z',
  100,
  ids[1],
);
db.prepare('UPDATE listings SET publishedAt=? WHERE id=?').run('2026-10-16T12:00:00.000Z', ids[2]);
after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('public search excludes samples and all inactive states before counting and pagination; recent ignores placement', async () => {
  const first = searchResultSchema.parse(await agentService.search('job', { pageSize: 1 }));
  assert.equal(first.total, 3);
  assert.equal(first.pages, 3);
  assert.equal(first.nextPage, 2);
  assert.equal(first.items[0].id, ids[0]);
  const second = await agentService.search('job', { pageSize: 1, page: 2 });
  assert.equal(second.items[0].id, ids[1]);
  const beyond = await agentService.search('job', { page: 100 });
  assert.deepEqual(beyond.items, []);
  assert.equal(beyond.total, 3);
  assert.equal(beyond.nextPage, null);
  assert.equal((await agentService.search('event', {})).total, 1);
  assert.equal(
    (await agentService.search('job', { publishedAfter: '2026-10-18T14:00:00+02:00' })).total,
    1,
  );
  assert.equal((await agentService.search('job', { q: 'no-such-role-unique' })).total, 0);
});
test('detail applies the same visibility rules and an explicit public allowlist', async () => {
  const result = detailResultSchema.parse(await agentService.get('job', ids[0]));
  assert.equal(result.item.salary.min, null);
  assert.equal(result.item.salary.currency, null);
  assert.equal(result.item.application.aiApplicationsBlocked, true);
  assert.equal(result.item.sourceCheckedAt, '2026-10-18T13:00:00.000Z');
  assert.equal(result.item.application.url, 'https://example.org/apply');
  for (const field of [
    'ownerId',
    'paymentOrderId',
    'rejectionReason',
    'paidAt',
    'sourceIdentity',
    'version',
  ])
    assert(!Object.hasOwn(result.item, field));
  for (const id of ids.slice(3))
    await assert.rejects(async () => agentService.get('job', id), { code: 'NOT_FOUND' });
  await assert.rejects(async () => agentService.get('event', ids[0]), { code: 'NOT_FOUND' });
  await assert.rejects(async () => agentService.get('event', events[1].id), { code: 'NOT_FOUND' });
});
test('strict filters reject ambiguity; date ranges respect Brussels DST and job deadline semantics', async () => {
  for (const query of [
    'page=1.5',
    'page=-1',
    'page=0',
    'pageSize=51',
    'salaryOnly=1',
    'q=a&q=b',
    'status=draft',
    '__proto__=unexpected',
    'from=2026-02-30',
    'from=2026-11-02&to=2026-11-01',
    'eventType=Webinar',
  ])
    assert.throws(() => parseQuery(new URLSearchParams(query), 'job'));
  const old = getListingById(ids[0])!.deadline;
  try {
    db.prepare('UPDATE listings SET deadline=? WHERE id=?').run('2030-03-31T21:59:59.999Z', ids[0]);
    const inside = await agentService.search('job', { from: '2030-03-31', to: '2030-03-31' });
    assert.equal(inside.items[0]?.id, ids[0]);
    db.prepare('UPDATE listings SET deadline=? WHERE id=?').run('2030-03-31T22:00:00.000Z', ids[0]);
    assert.equal(
      (await agentService.search('job', { to: '2030-03-31', from: '2030-03-31' })).total,
      0,
    );
  } finally {
    db.prepare('UPDATE listings SET deadline=? WHERE id=?').run(old, ids[0]);
  }
});
test('API gives structured 400/404, preserves unknowns, and publishes a schema for every read operation', async () => {
  const bad = await searchResponse(new Request('http://localhost/api/v1/jobs?page=1.5'), 'job');
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'INVALID_ARGUMENT');
  const missing = await detailResponse(
    new Request('http://localhost/api/v1/jobs/missing'),
    'job',
    'missing',
  );
  assert.equal(missing.status, 404);
  const spec = agentOpenApi();
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(Object.keys(spec.paths).length, 4);
  assert(spec.components.schemas.SearchResult.properties);
});
test('MCP rejects foreign origins, forged hosts, and oversized bodies before tool execution', async () => {
  const request = (headers: Record<string, string>, body = '{}') =>
    new Request('https://eujobs.example/mcp', {
      method: 'POST',
      headers: {
        host: 'eujobs.example',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body,
    });
  assert.equal((await mcpPost(request({ origin: 'https://evil.example' }))).status, 403);
  assert.equal((await mcpPost(request({ host: 'evil.example' }))).status, 403);
  assert.equal(
    (await mcpPost(request({}, JSON.stringify({ junk: 'a'.repeat(66000) })))).status,
    413,
  );
});

async function fixtureServer() {
  const server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const url = new URL(req.url!, base);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      });
      let response: Response;
      const match = url.pathname.match(/^\/api\/v1\/(jobs|events)(?:\/([^/]+))?$/);
      if (url.pathname === '/mcp') response = await mcpPost(request);
      else if (match)
        response = match[2]
          ? await detailResponse(request, match[1] === 'jobs' ? 'job' : 'event', match[2])
          : await searchResponse(request, match[1] === 'jobs' ? 'job' : 'event');
      else
        response = Response.json(
          { error: { code: 'NOT_FOUND', message: 'Unknown fixture route' } },
          { status: 404 },
        );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    base,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
test('real SDK remote MCP and CLI/local stdio MCP work end to end against the API', async () => {
  const fixture = await fixtureServer(),
    previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = fixture.base;
  const cli = resolve('packages/agent-client/dist/eujobs.mjs');
  try {
    const client = createAgentClient(fixture.base);
    assert.equal((await client.search('job', {})).total, 3);
    const remote = new Client({ name: 'eujobs-test', version: '1' });
    try {
      await remote.connect(new StreamableHTTPClientTransport(new URL('/mcp', fixture.base)));
      const list = await remote.listTools();
      assert.deepEqual(
        list.tools.map((t) => t.name),
        ['search_jobs', 'get_job', 'search_events', 'get_event'],
      );
      assert(list.tools.every((t) => t.annotations?.readOnlyHint && t.outputSchema));
      const result = await remote.callTool({ name: 'search_jobs', arguments: { pageSize: 1 } });
      assert.equal(searchResultSchema.parse(result.structuredContent).total, 3);
      const unavailable = await remote.callTool({ name: 'get_job', arguments: { id: ids[3] } });
      assert.equal(unavailable.isError, true);
      const invalid = await remote.callTool({ name: 'search_jobs', arguments: { pageSize: 1000 } });
      assert.equal(invalid.isError, true);
    } finally {
      await remote.close();
    }
    const searched = await run(process.execPath, [
      cli,
      'jobs',
      'search',
      '--page-size',
      '1',
      '--json',
      '--base-url',
      fixture.base,
    ]);
    assert.equal(searched.stderr, '');
    assert.equal(JSON.parse(searched.stdout).total, 3);
    const detail = await run(process.execPath, [
      cli,
      'jobs',
      'get',
      ids[0],
      '--json',
      '--base-url',
      fixture.base,
    ]);
    assert.equal(JSON.parse(detail.stdout).item.id, ids[0]);
    await assert.rejects(
      run(process.execPath, [
        cli,
        'jobs',
        'search',
        '--page',
        '1.5',
        '--json',
        '--base-url',
        fixture.base,
      ]),
      (e: unknown) => {
        const error = e as { code: number; stdout: string; stderr: string };
        assert.equal(error.code, 2);
        assert.equal(error.stdout, '');
        assert.equal(JSON.parse(error.stderr).error.code, 'INVALID_ARGUMENT');
        return true;
      },
    );
    await assert.rejects(
      run(process.execPath, [cli, 'jobs', 'get', ids[3], '--json', '--base-url', fixture.base]),
      (e: unknown) => (e as { code: number }).code === 3,
    );
    const local = new Client({ name: 'local-test', version: '1' });
    try {
      await local.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [cli, 'mcp', '--base-url', fixture.base],
          stderr: 'pipe',
        }),
      );
      const result = await local.callTool({ name: 'get_event', arguments: { id: events[0].id } });
      assert.equal(detailResultSchema.parse(result.structuredContent).item.id, events[0].id);
    } finally {
      await local.close();
    }
  } finally {
    process.env.APP_ORIGIN = previousOrigin;
    await fixture.close();
  }
});
test('rate limit returns 429 with Retry-After and machine-readable code', async () => {
  process.env.TRUST_PROXY = '1';
  try {
    const request = new Request('http://localhost/api/v1/jobs', {
      headers: { 'x-forwarded-for': '192.0.2.55' },
    });
    for (let i = 0; i < 120; i++) assert.equal((await searchResponse(request, 'job')).status, 200);
    const limited = await searchResponse(request, 'job');
    assert.equal(limited.status, 429);
    assert(Number(limited.headers.get('Retry-After')) > 0);
    assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
  } finally {
    delete process.env.TRUST_PROXY;
  }
});
