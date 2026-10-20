import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// r15: employer copy merged from seo/post_a_job_copy.md. Source-level checks only.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('city CTA heading leads with the free first listing while FIRSTFREE runs', () => {
  const src = read('src/components/CityLandingPage.tsx');
  assert.match(
    src,
    /Hiring in \{city\.name\}\?\{' '\}\s*\{firstFreeActive\(\) \? 'Post your first job free' : `Post a job from \$\{fromPrice\}`\}/,
  );
  assert.match(src, /applied\s+for you at checkout\)/);
  assert.doesNotMatch(src, /with code <code>LAUNCH149<\/code> at checkout until/);
});

test('pricing FAQ states NGO pricing the same way as /employers', () => {
  const pricing = read('src/app/pricing/page.tsx');
  const employers = read('src/app/employers/page.tsx');
  assert.match(pricing, /Do you offer NGO pricing\?/);
  assert.match(
    pricing,
    /Charitable NGOs can <Link href="\/contact">contact us<\/Link> for 40% off any plan\./,
  );
  assert.match(
    employers,
    /Charitable NGOs can <Link href="\/contact">contact us<\/Link> for 40% off any plan\./,
  );
});

test('submit page has job/event titles and stays noindex', () => {
  const src = read('src/app/submit/page.tsx');
  assert.match(src, /generateMetadata/);
  assert.match(src, /'Post a job'|"Post a job"/);
  assert.match(src, /index: false, follow: false/);
});

test('no hire guarantee, audience numbers or competitor links in r15 copy', () => {
  for (const p of [
    'src/components/CityLandingPage.tsx',
    'src/app/pricing/page.tsx',
    'src/app/submit/page.tsx',
  ]) {
    const src = read(p);
    assert.doesNotMatch(src, /guarantee(d)? (a )?hire|guaranteed hire/i, p);
    assert.doesNotMatch(src, /eurobrussels\.com|jobsin\.brussels/i, p);
    assert.doesNotMatch(
      src,
      /\b\d[\d,.]*\s*(visitors|readers|subscribers|followers|users) (a|per) month/i,
      p,
    );
  }
});
