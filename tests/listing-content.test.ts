import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventCard, eventTimeLabel } from '../src/components/ListingCard';
import { applicationTarget, ListingContent } from '../src/components/ListingContent';
import type { Listing } from '../src/lib/types';

test('organizer event cards identify the directory organization as the listing publisher', () => {
  const html = renderToStaticMarkup(
    createElement(EventCard, {
      compact: true,
      listing: {
        kind: 'event',
        slug: 'policy-forum',
        title: 'Policy forum',
        organization: 'Policy Lab',
        externalSource: 'organizer',
        eventType: 'Panel discussion',
        price: null,
        startsAt: '2027-04-01T22:00:00.000Z',
        timezone: 'Europe/Brussels',
        location: 'Online',
      } as Listing,
    }),
  );
  assert.match(html, /Listed by Policy Lab/);
  assert.match(html, /lucide-video/);
  assert.doesNotMatch(html, /Brussels time/);
  assert.equal(
    eventTimeLabel({
      startsAt: '2027-04-01T22:00:00.000Z',
      timezone: 'Europe/Brussels',
      eventDateOnly: true,
    }),
    'Check session times',
  );
  assert.equal(
    eventTimeLabel({
      startsAt: '2027-04-01T22:00:00.000Z',
      timezone: 'Europe/Brussels',
      eventDateOnly: false,
    }),
    '00:00 Brussels time',
  );
});

test('vacancy text renders accessible sections and lists while preserving paragraph content', () => {
  const html = renderToStaticMarkup(
    createElement(ListingContent, {
      text: 'An independent role summary.\r\n\r\n## Responsibilities\r\n- Coordinate research\r\n- Prepare briefings\r\n\r\n## Requirements\r\nEnglish and French.\r\nRelevant policy experience.',
    }),
  );
  assert.match(html, /<p>An independent role summary\.<\/p>/);
  assert.match(html, /<h2[^>]*>Responsibilities<\/h2>/);
  assert.match(html, /<ul><li>Coordinate research<\/li><li>Prepare briefings<\/li><\/ul>/);
  assert.match(html, /<h2[^>]*>Requirements<\/h2>/);
  assert.match(html, /English and French\.\nRelevant policy experience\./);
});

test('vacancy content cannot create HTML, embedded images or executable Markdown links', () => {
  const html = renderToStaticMarkup(
    createElement(ListingContent, {
      text: '## <script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n[Apply](javascript:alert(1))\n\n- <a href="https://attacker.example">External link</a>',
    }),
  );
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<a '));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /\[Apply\]\(javascript:alert\(1\)\)/);
});

test('imported jobs never use aggregator links as their application CTA', () => {
  for (const href of [
    'https://jobsin.brussels/jobs/example/',
    'https://www.eurobrussels.com/job_display/123/example',
    'https://jobs.eurobrussels.com./apply',
  ]) {
    for (const method of [null, 'url', 'instructions'] as const)
      assert.equal(applicationTarget({ href, kind: 'job', editorial: true, method }), null);
  }
  assert.equal(
    applicationTarget({
      href: 'https://employer.example/apply',
      kind: 'job',
      editorial: true,
      method: null,
    }),
    null,
  );
});

test('verified employer destinations distinguish applying, emailing and application documents', () => {
  assert.deepEqual(
    applicationTarget({
      href: 'https://employer.example/apply',
      kind: 'job',
      editorial: true,
      method: 'url',
    }),
    {
      href: 'https://employer.example/apply',
      label: 'Apply on employer site',
      email: false,
    },
  );
  assert.deepEqual(
    applicationTarget({
      href: 'mailto:jobs@example.org?subject=Policy%20Officer',
      kind: 'job',
      editorial: true,
      method: 'email',
    }),
    {
      href: 'mailto:jobs@example.org?subject=Policy%20Officer',
      label: 'Email application',
      email: true,
    },
  );
  assert.deepEqual(
    applicationTarget({
      href: 'https://employer.example/vacancy.pdf',
      kind: 'job',
      editorial: true,
      method: 'instructions',
    }),
    {
      href: 'https://employer.example/vacancy.pdf',
      label: 'View application instructions',
      email: false,
    },
  );
});

test('application destinations reject executable URLs, credentials and unsafe email headers', () => {
  for (const href of [
    'javascript:alert(1)',
    'data:text/html,test',
    'https://user:pass@example.org/apply',
    '/relative',
  ])
    assert.equal(applicationTarget({ href, kind: 'job', editorial: true, method: 'url' }), null);
  for (const href of [
    'mailto:not-an-email',
    'mailto:jobs@example.org?bcc=hidden@example.org',
    'mailto:jobs@example.org?subject=Application%0d%0aBcc:test@example.org',
    'https://employer.example/apply',
  ])
    assert.equal(applicationTarget({ href, kind: 'job', editorial: true, method: 'email' }), null);
});

test('email application CTAs preserve all explicit recipients and the permitted query fields', () => {
  for (const href of [
    'mailto:first@example.org,second@example.org?subject=Policy%20Officer',
    'mailto:first@example.org%2Csecond@example.org?body=Please%20find%20my%20application',
    'mailto:one@example.org,two@example.org,three@example.org,four@example.org,five@example.org',
  ]) {
    const target = applicationTarget({ href, kind: 'job', editorial: true, method: 'email' });
    assert.deepEqual(target, { href, label: 'Email application', email: true });
  }
});

test('email application CTAs reject malformed lists, excessive recipients and header injection', () => {
  for (const href of [
    'mailto:',
    'mailto:,second@example.org',
    'mailto:first@example.org,',
    'mailto:first@example.org,,second@example.org',
    'mailto:first@example.org,%20,second@example.org',
    'mailto:first@example.org,invalid',
    'mailto:first@example.org,second@bad..example.org',
    'mailto:one@example.org,two@example.org,three@example.org,four@example.org,five@example.org,six@example.org',
    'mailto:first@example.org,second@example.org?bcc=hidden@example.org',
    'mailto:first@example.org,second@example.org?to=hidden@example.org',
    'mailto:first@example.org,second@example.org?subject=Application%0D%0ABcc:other@example.org',
    'mailto:first@example.org,second@example.org\r\n?subject=Application',
    'mailto:first@example.org,%0asecond@example.org',
    'mailto:first@example.org,%not-encoding@example.org',
    'mailto:first@example.org,second@example.org#ignored',
  ])
    assert.equal(
      applicationTarget({ href, kind: 'job', editorial: true, method: 'email' }),
      null,
      href,
    );
});

test('employer jobs and events retain their existing direct links without imported metadata', () => {
  assert.deepEqual(applicationTarget({ href: 'https://employer.example/apply', kind: 'job' }), {
    href: 'https://employer.example/apply',
    label: 'Apply for this role',
    email: false,
  });
  assert.deepEqual(
    applicationTarget({ href: 'https://organiser.example/register', kind: 'event' }),
    {
      href: 'https://organiser.example/register',
      label: 'Visit registration',
      email: false,
    },
  );
  assert.deepEqual(
    applicationTarget({
      href: 'https://organiser.example/event-details',
      kind: 'event',
      organizerEvent: true,
    }),
    {
      href: 'https://organiser.example/event-details',
      label: 'Event details & registration',
      email: false,
    },
  );
});
