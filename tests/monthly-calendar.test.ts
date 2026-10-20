import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calendarBoundary, createListing, createUser, getDb } from '../src/lib/store';
import {
  buildMonthlyCalendar,
  calendarMonthBounds,
  currentCalendarMonth,
  eventOverlapsCalendarMonth,
  getCalendarMonth,
  getCalendarMonths,
} from '../src/lib/monthly-calendar';
const dir = mkdtempSync(join(tmpdir(), 'eujobs-monthly-'));
process.env.DATA_DIR = dir;
process.env.EUJOBS_SEED = '0';
const db = getDb();
after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
const admin = createUser({
  name: 'Calendar Admin',
  email: 'monthly-admin@example.org',
  passwordHash: 'unused-test-only-password-hash',
  role: 'admin',
});
function published(title: string, startsAt: string, endsAt: string) {
  const event = createListing(admin.id, {
    kind: 'event',
    title,
    organization: 'Monthly Test Institute',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'A discussion about European policy and public participation.',
    description:
      'Researchers and policymakers share their work and discuss current priorities. Registration is managed by the event organiser.',
    url: 'https://example.org/register',
    startsAt,
    endsAt,
    timezone: 'Europe/Brussels',
    eventType: 'Conference',
    venue: 'Policy Hall',
    price: null,
  });
  db.prepare("UPDATE listings SET status='published' WHERE id=?").run(event.id);
  return { ...event, status: 'published' as const };
}
test('months use Brussels boundaries across DST, leap days, years and UTC midnight', () => {
  assert.equal(currentCalendarMonth(new Date('2026-10-31T23:30:00Z')), '2026-11');
  assert.equal(currentCalendarMonth(new Date('2026-10-31T22:30:00Z')), '2026-10');
  assert.equal(calendarMonthBounds('2028-02').monthEnd, '2028-02-29');
  assert.equal(calendarMonthBounds('2027-12').endsAt, '2027-12-31T23:00:00.000Z');
  for (const [month, hours] of [
    ['2027-03', 743],
    ['2027-10', 745],
  ] as const) {
    const b = calendarMonthBounds(month);
    assert.equal((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 3600000, hours);
  }
  assert.throws(() => calendarMonthBounds('2027-13'), /valid calendar/);
  assert.throws(() => calendarMonthBounds('2027-02-01'), /valid calendar/);
});
test('month overlaps include multi-day events and preserve all-day local dates', () => {
  const base = published('Boundary conference', '2027-03-31T21:00:00Z', '2027-03-31T23:00:00Z');
  assert.equal(eventOverlapsCalendarMonth(base, '2027-03'), true);
  assert.equal(eventOverlapsCalendarMonth(base, '2027-04'), true);
  assert.equal(
    eventOverlapsCalendarMonth({ ...base, endsAt: '2027-03-31T22:00:00Z' }, '2027-04'),
    false,
  );
  const allDay = {
    ...base,
    eventDateOnly: true,
    timezone: 'Europe/Vilnius',
    startsAt: calendarBoundary('2027-04-01', 'date', false, 'Europe/Vilnius'),
    endsAt: calendarBoundary('2027-04-02', 'date', false, 'Europe/Vilnius'),
  };
  assert.equal(eventOverlapsCalendarMonth(allDay, '2027-03'), false);
  assert.equal(eventOverlapsCalendarMonth(allDay, '2027-04'), true);
  assert.equal(eventOverlapsCalendarMonth({ ...base, status: 'closed' }, '2027-03'), false);
  assert.equal(eventOverlapsCalendarMonth({ ...base, isSample: true }, '2027-03'), false);
});
test('full monthly snapshot has no search pagination limit and includes already elapsed dates', () => {
  const early = published('Earlier this month', '2027-05-01T08:00:00Z', '2027-05-01T09:00:00Z');
  for (let i = 0; i < 101; i++)
    published(`Conference number ${i}`, '2027-05-20T08:00:00Z', '2027-05-20T09:00:00Z');
  const month = getCalendarMonth('2027-05', new Date('2027-05-10T12:00:00Z'));
  assert.equal(month.count, 102);
  assert.ok(month.events.some((event) => event.id === early.id));
  assert.equal(month.monthStart, '2027-05-01');
  assert.equal(month.monthEnd, '2027-05-31');
  const ics = buildMonthlyCalendar(month.events, '2027-05');
  assert.equal((ics.match(/BEGIN:VCALENDAR/g) || []).length, 1);
  assert.equal((ics.match(/END:VCALENDAR/g) || []).length, 1);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 102);
  assert.ok(ics.includes(`UID:${early.id}@eujobs`));
  assert.equal(getCalendarMonths(new Date('2027-05-10T12:00:00Z')).length, 12);
  assert.throws(() => buildMonthlyCalendar([], '2027-05'), /no events/);
  assert.throws(() => buildMonthlyCalendar([early, early], '2027-05'), /duplicate/);
  assert.throws(() => getCalendarMonth('2027-04', new Date('2027-05-10T12:00:00Z')), /this month/);
  assert.throws(() => getCalendarMonth('2028-05', new Date('2027-05-10T12:00:00Z')), /next eleven/);
});
