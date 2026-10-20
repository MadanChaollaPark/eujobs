import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// r17: fixes (e), (f), (g) from checkout_open_fixes_2026-10-19.md. Source-level checks only.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('bare /submit and /submit?kind=job preselect Basic; an explicit plan still wins', () => {
  const page = read('src/app/submit/page.tsx');
  assert.match(page, /const defaultPlan = isJobPlan\(params\.plan\) \? params\.plan : 'basic';/);
  assert.doesNotMatch(page, /launchOfferActive\(\) \? 'pro'/);
});

test('/refund is linked from /terms and the footer', () => {
  assert.match(read('src/app/terms/page.tsx'), /<Link href="\/refund">refund policy<\/Link>/);
  assert.match(read('src/components/Footer.tsx'), /<Link href="\/refund">Refunds<\/Link>/);
});

test('job description minimum is 30 characters on the client; events stay at 80', () => {
  const form = read('src/components/SubmissionForm.tsx');
  assert.match(form, /minLength=\{kind === 'job' \? 30 : 80\}/);
  assert.match(form, /how to apply\. At least 30 characters\./);
  assert.match(form, /attendance details\. At least 80 characters\./);
  const store = read('src/lib/store.ts');
  assert.match(store, /export const JOB_DESCRIPTION_MIN = 30;/);
  assert.match(store, /description: z\.string\(\)\.trim\(\)\.min\(JOB_DESCRIPTION_MIN\)/);
});

test('Umami keeps respecting Do Not Track', () => {
  assert.match(read('src/app/layout.tsx'), /data-do-not-track="true"|'data-do-not-track': 'true'/);
});
