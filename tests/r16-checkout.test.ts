import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JOB_PLANS, formatJobPrice } from '../src/lib/plans';

// r16: fixes from checkout_retest_2026-10-18.md. Source-level checks only.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('generic Post a job links preselect Basic', () => {
  const files = [
    'src/components/Header.tsx',
    'src/components/Footer.tsx',
    'src/components/GuestJobManager.tsx',
    'src/app/jobs/brussels/[segment]/page.tsx',
    'src/app/lobbying-entities/[[...path]]/page.tsx',
    'src/app/help/page.tsx',
    'src/app/cities/page.tsx',
    'src/lib/seo-landings.ts',
    'src/app/page.tsx',
    'src/app/about/page.tsx',
    'src/components/AccountPanel.tsx',
    'next.config.ts',
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /\/submit\?kind=job["']/, f);
    assert.doesNotMatch(src, /href="\/submit"/, f);
  }
  assert.equal(
    (read('src/components/Header.tsx').match(/\/submit\?kind=job&plan=basic/g) || []).length,
    2,
  );
  assert.match(read('src/lib/seo-landings.ts'), /\/submit\?kind=job&amp;plan=basic/);
  assert.equal(
    (read('next.config.ts').match(/destination: '\/submit\?kind=job&plan=basic'/g) || []).length,
    3,
  );
  // plan-specific links keep their own plan
  assert.match(read('src/app/pricing/page.tsx'), /\/submit\?kind=job&plan=\$\{id\}/);
  assert.match(read('src/app/employers/page.tsx'), /\/submit\?kind=job&plan=\$\{id\}/);
});

test('pay button shows the configured list price when no offer applies (Recruiter)', () => {
  const form = read('src/components/SubmissionForm.tsx');
  assert.match(form, /`Continue to payment — \$\{formatJobPrice\(JOB_PLANS\[plan\]\.amount\)\}`/);
  assert.doesNotMatch(form, /: 'Continue to payment'/);
  assert.equal(formatJobPrice(JOB_PLANS.recruiter.amount), '€500.00');
});

test('event copy matches the code: free, sign-in required', () => {
  const submit = read('src/app/submit/page.tsx');
  assert.match(submit, /kind === 'event' && !user\)\s*redirect\(`\/auth\/login/);
  assert.match(
    read('src/lib/billing.ts'),
    /listing\.kind !== 'job'\) throw new StoreError\('Events are free to submit\.'\)/,
  );
  assert.match(submit, /Events are free to submit; sign in first\./);
  assert.match(
    read('src/components/SubmissionForm.tsx'),
    /Sharing an event\? Events are free to submit; sign in first\./,
  );
  assert.match(
    read('src/app/pricing/page.tsx'),
    /Community events are free to submit; sign in first\./,
  );
  assert.match(read('src/app/help/page.tsx'), /Events are free to submit; sign in first/);
  assert.match(
    read('src/components/BillingPanel.tsx'),
    /Events are free to submit \(sign-in required\)/,
  );
  for (const f of [
    'src/app/pricing/page.tsx',
    'src/components/SubmissionForm.tsx',
    'src/app/help/page.tsx',
  ]) {
    assert.doesNotMatch(read(f), /Sign in to submit it for free|free review/, f);
  }
});
