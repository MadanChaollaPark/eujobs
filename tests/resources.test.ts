import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  blogPosts,
  findResourceBySlug,
  normalizeResource,
  plainContent,
  resourceList,
  safeWebUrl,
} from '../src/lib/resources';
import { escapeXml, cdata } from '../src/lib/xml';

test('resource routes resolve encoded punctuation and Unicode without double-decoding literal slugs', () => {
  const article = { slug: 'Competency-Based-CVs-&-Cover-Letters-for-EU-Jobs:-A-Practical-Guide' };
  const unicode = { slug: 'énergie-Europe' };
  const literalPercent = { slug: 'name%26another' };
  const ampersand = { slug: 'name&another' };
  const items = [article, unicode, literalPercent, ampersand];
  assert.equal(findResourceBySlug(items, encodeURIComponent(article.slug)), article);
  assert.equal(findResourceBySlug(items, article.slug), article);
  assert.equal(findResourceBySlug(items, encodeURIComponent(unicode.slug)), unicode);
  assert.equal(findResourceBySlug(items, literalPercent.slug), literalPercent);
  assert.equal(findResourceBySlug(items, encodeURIComponent(literalPercent.slug)), literalPercent);
  assert.equal(findResourceBySlug(items, 'bad%escape'), undefined);
  assert.equal(
    findResourceBySlug(items, encodeURIComponent(encodeURIComponent(article.slug))),
    undefined,
  );
});

test('public resources reject executable URLs and preserve source dates without exposing private fields', () => {
  const result = normalizeResource({
    slug: 'example',
    originalName: 'Example organization',
    webSiteURL: 'https://example.org',
    sourceUrl: 'javascript:alert(1)',
    contentHtml: '<script>alert(1)</script><p>Source content.</p>',
    interests: ['Climate', 'Climate', 123],
    headOffice: { city: 'Brussels', country: 'Belgium' },
    contactEmail: 'private@example.org',
    password: 'hidden',
    scrapedAt: '2025-01-01',
  });
  assert.equal(result?.name, 'Example organization');
  assert.equal(result?.website, 'https://example.org/');
  assert.equal(result?.sourceUrl, undefined);
  assert.equal(result?.content, 'Source content.');
  assert.deepEqual(result?.tags, ['Climate']);
  assert.equal(result?.fields.City, 'Brussels');
  assert.equal(result?.sourceDate, '2025-01-01');
  assert.ok(!JSON.stringify(result).includes('private@example.org'));
  assert.ok(!JSON.stringify(result).includes('hidden'));
  assert.equal(normalizeResource({ slug: '../secret', name: 'Invalid' }), null);
  assert.equal(safeWebUrl('data:text/html,x'), undefined);
});
test('resource inventory retains complete collections and invalidates file cache after atomic replacement', () => {
  const directory = mkdtempSync(join(tmpdir(), 'eujobs-resources-')),
    oldFile = process.env.EUJOBS_RESOURCES_FILE;
  try {
    process.env.EUJOBS_RESOURCES_FILE = join(directory, 'resources.json');
    writeFileSync(
      process.env.EUJOBS_RESOURCES_FILE,
      JSON.stringify({
        lobbyingEntities: Array.from({ length: 241 }, (_, i) => ({
          slug: `org-${i}`,
          name: `Organization ${i}`,
        })),
      }),
    );
    assert.equal(resourceList('lobbyingEntities').length, 241);
    assert.deepEqual(resourceList('careerGuides'), []);
    writeFileSync(
      process.env.EUJOBS_RESOURCES_FILE,
      JSON.stringify({
        lobbyingEntities: [{ slug: 'replacement', name: 'Updated source inventory' }],
      }),
    );
    assert.equal(resourceList('lobbyingEntities').length, 1);
    assert.equal(resourceList('lobbyingEntities')[0].slug, 'replacement');
    writeFileSync(process.env.EUJOBS_RESOURCES_FILE, '{');
    assert.throws(() => resourceList('lobbyingEntities'));
  } finally {
    if (oldFile === undefined) delete process.env.EUJOBS_RESOURCES_FILE;
    else process.env.EUJOBS_RESOURCES_FILE = oldFile;
    rmSync(directory, { recursive: true, force: true });
  }
});
test('legacy article and directory content remains readable and local articles retain original dates', () => {
  assert.equal(
    plainContent('<h2>Heading</h2><p>Details &amp; facts.</p>'),
    'Heading\n\nDetails & facts.',
  );
  const record = normalizeResource({
    slug: 'guide',
    title: 'Guide',
    sections: [{ title: 'How to apply', contentHtml: '<p>Apply at the source.</p>' }],
  });
  assert.match(record?.content || '', /How to apply\n\nApply at the source/);
  const posts = blogPosts();
  assert.ok(posts.length >= 15);
  assert.equal(
    posts.find((p) => p.slug === 'can-i-work-in-brussels-with-english')?.date,
    '2024-03-20',
  );
});
test('feed helpers preserve values while escaping XML markup and CDATA terminators', () => {
  assert.equal(escapeXml('A&B <role> "x"'), 'A&amp;B &lt;role&gt; &quot;x&quot;');
  assert.equal(cdata('before]]>after'), '<![CDATA[before]]]]><![CDATA[>after]]>');
});
