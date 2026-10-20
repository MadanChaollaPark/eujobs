import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MonthlyCalendarOffer, {
  calendarCheckoutUrl,
  calendarRequestKey,
  getCalendarRequest,
} from '../src/components/MonthlyCalendarOffer';

test('the monthly offer begins compact and explains that individual events remain free', () => {
  const html = renderToStaticMarkup(
    createElement(MonthlyCalendarOffer, {
      months: [
        {
          month: '2026-10',
          monthStart: '2026-10-01',
          monthEnd: '2026-10-31',
          label: 'October 2026',
          count: 0,
        },
        {
          month: '2026-11',
          monthStart: '2026-11-01',
          monthEnd: '2026-11-30',
          label: 'November 2026',
          count: 18,
        },
      ],
    }),
  );
  assert.match(html, /id="monthly-calendar"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Choose a month · €10\.00/);
  assert.match(html, /Reading events and adding them individually stay free/);
  assert.doesNotMatch(html, /name="email"/);
  assert.doesNotMatch(html, /<select/);
});

test('checkout intent is persisted and reused after a lost response, independently for each month', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
  const first = getCalendarRequest(storage, '2026-10');
  assert.deepEqual(JSON.parse(data.get(calendarRequestKey('2026-10'))!), first);
  assert.equal(Buffer.from(first.requestToken, 'base64url').length, 32);
  assert.equal(
    Buffer.from(first.requestToken, 'base64url').toString('base64url'),
    first.requestToken,
  );
  assert.deepEqual(getCalendarRequest(storage, '2026-10'), first);
  storage.setItem(
    calendarRequestKey('2026-10'),
    JSON.stringify({ ...first, purchaseId: 'saved-paid-or-open-purchase' }),
  );
  const resumed = getCalendarRequest(storage, '2026-10');
  assert.equal(resumed.requestId, first.requestId);
  assert.equal(resumed.requestToken, first.requestToken);
  assert.equal(resumed.purchaseId, 'saved-paid-or-open-purchase');
  const secondMonth = getCalendarRequest(storage, '2026-11');
  assert.notEqual(secondMonth.requestId, first.requestId);
  assert.notEqual(secondMonth.requestToken, first.requestToken);
});

test('broken browser storage and invalid saved credentials cannot silently create replacement checkouts', () => {
  assert.throws(
    () => getCalendarRequest({ getItem: () => null, setItem: () => {} }, '2026-10'),
    /Allow browser storage/,
  );
  for (const saved of [
    'not-json',
    'null',
    '{}',
    JSON.stringify({ requestId: 'bad', requestToken: 'bad' }),
  ]) {
    let writes = 0;
    assert.throws(
      () =>
        getCalendarRequest(
          {
            getItem: () => saved,
            setItem: () => {
              writes++;
            },
          },
          '2026-10',
        ),
      /saved checkout could not be read/,
    );
    assert.equal(writes, 0);
  }
});

test('payment redirects are restricted to the secure Stripe checkout host', () => {
  assert.equal(
    calendarCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123'),
    'https://checkout.stripe.com/c/pay/cs_test_123',
  );
  for (const url of [
    'http://checkout.stripe.com/c/pay/x',
    'https://checkout.stripe.com.attacker.example/x',
    'https://attacker.example/x',
    'javascript:alert(1)',
    'https://user:password@checkout.stripe.com/x',
    'https://checkout.stripe.com:444/x',
  ])
    assert.throws(() => calendarCheckoutUrl(url));
});
