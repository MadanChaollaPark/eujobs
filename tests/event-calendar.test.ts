import test from 'node:test';
import assert from 'node:assert/strict';
import { eventCalendar } from '../src/app/api/events/[slug]/calendar/ics';
import { eventOccursOn } from '../src/components/EventCalendar';
import type { Listing } from '../src/lib/types';

test('event calendar uses published local date-only ranges and spans every inclusive day', () => {
  const event = {
    startsAt: '2026-10-23T21:00:00.000Z',
    endsAt: '2026-10-25T22:00:00.000Z',
    timezone: 'Europe/Vilnius',
    eventDateOnly: true,
  };
  assert.equal(eventOccursOn(event, '2026-10-23'), false);
  assert.equal(eventOccursOn(event, '2026-10-24'), true);
  assert.equal(eventOccursOn(event, '2026-10-25'), true);
  assert.equal(eventOccursOn(event, '2026-10-26'), false);
});

test('timed calendar events retain Brussels dates and exclude an exact midnight end day', () => {
  const event = {
    startsAt: '2026-10-23T21:30:00.000Z',
    endsAt: '2026-10-23T22:00:00.000Z',
    timezone: 'Europe/Vilnius',
    eventDateOnly: false,
  };
  assert.equal(eventOccursOn(event, '2026-10-23'), true);
  assert.equal(eventOccursOn(event, '2026-10-24'), false);
});

test('date-only event calendars retain local dates across the spring DST boundary', () => {
  const event = {
    id: 'event_dst',
    slug: 'event-dst',
    kind: 'event',
    title: 'Policy forum',
    organization: 'Policy Association',
    organizationId: 'policy-association',
    initials: 'PA',
    color: '#123456',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'A policy forum.',
    description: 'A policy forum.',
    status: 'published',
    ownerId: null,
    version: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    publishedAt: '2024-01-01T00:00:00.000Z',
    isSample: false,
    featured: false,
    sourceUrl: 'https://organizer.example/events/policy-forum',
    sourceCheckedAt: null,
    url: 'https://organizer.example/events/policy-forum',
    employmentType: null,
    seniority: null,
    workMode: null,
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: null,
    deadline: null,
    startsAt: '2024-03-30T23:00:00.000Z',
    endsAt: '2024-04-01T22:00:00.000Z',
    timezone: 'Europe/Brussels',
    eventType: 'Conference',
    venue: 'Brussels',
    price: null,
    rejectionReason: null,
    eventDateOnly: true,
  } as Listing;

  const calendar = eventCalendar(event, 'https://eujobs.example');
  assert.match(calendar, /DTSTART;VALUE=DATE:20240331\r\n/);
  assert.match(calendar, /DTEND;VALUE=DATE:20240402\r\n/);
  assert.doesNotMatch(calendar, /DTSTART:/);
  assert.doesNotMatch(calendar, /DTEND:/);
});

test('timed event calendars keep UTC date-time fields', () => {
  const event = {
    id: 'timed_event',
    slug: 'timed-event',
    kind: 'event',
    title: 'Timed policy forum',
    organization: 'Policy Association',
    organizationId: 'policy-association',
    initials: 'PA',
    color: '#123456',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'A timed policy forum.',
    description: 'A timed policy forum.',
    status: 'published',
    ownerId: null,
    version: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    publishedAt: '2024-01-01T00:00:00.000Z',
    isSample: false,
    featured: false,
    sourceUrl: null,
    sourceCheckedAt: null,
    url: 'https://organizer.example/events/timed-forum',
    employmentType: null,
    seniority: null,
    workMode: null,
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: null,
    deadline: null,
    startsAt: '2024-03-31T08:30:00.000Z',
    endsAt: '2024-03-31T10:30:00.000Z',
    timezone: 'Europe/Brussels',
    eventType: 'Conference',
    venue: 'Brussels',
    price: null,
    rejectionReason: null,
    eventDateOnly: false,
  } as Listing;

  const calendar = eventCalendar(event, 'https://eujobs.example');
  assert.match(calendar, /DTSTART:20240331T083000Z\r\n/);
  assert.match(calendar, /DTEND:20240331T103000Z\r\n/);
});
