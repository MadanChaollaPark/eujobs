import test from 'node:test';
import assert from 'node:assert/strict';
import { countryFromLocation, deriveSummary } from '../src/lib/form-helpers';
import { planOffer } from '../src/lib/offers';
import { autoPromotionCode } from '../src/lib/billing';

test('country is derived from the location', () => {
  assert.equal(countryFromLocation('Brussels'), 'Belgium');
  assert.equal(countryFromLocation('The Hague'), 'Netherlands');
  assert.equal(countryFromLocation('Brussels or Lyon'), 'Belgium');
  assert.equal(countryFromLocation('Remote'), 'Not specified');
  assert.equal(countryFromLocation('Somewhere', 'Belgium'), 'Belgium');
});

test('summary falls back to the description and meets the 20-300 limit', () => {
  const description = 'We are hiring a policy officer to follow EU climate files. '.repeat(10);
  assert.equal(
    deriveSummary('A long enough introduction here.', description),
    'A long enough introduction here.',
  );
  const derived = deriveSummary('', description);
  assert.ok(derived.length >= 20 && derived.length <= 300);
  assert.ok(deriveSummary('Short', description).startsWith('Short — '));
});

test('offers are shown and auto-applied only while active', () => {
  const oct20 = Date.parse('2026-10-20T12:00:00+02:00');
  const nov15 = Date.parse('2026-11-15T12:00:00+01:00');
  const dec5 = Date.parse('2026-12-05T12:00:00+01:00');
  assert.equal(planOffer('basic', oct20)?.amount, 0);
  assert.equal(planOffer('pro', oct20)?.amount, 14900);
  assert.equal(planOffer('pro', nov15), null);
  assert.equal(planOffer('basic', dec5), null);
  assert.equal(planOffer('recruiter', oct20), null);
  assert.equal(autoPromotionCode('basic', oct20), 'FIRSTFREE');
  assert.equal(autoPromotionCode('pro', oct20), 'LAUNCH149');
  assert.equal(autoPromotionCode('pro', nov15), null);
  assert.equal(autoPromotionCode('recruiter', oct20), null);
});
