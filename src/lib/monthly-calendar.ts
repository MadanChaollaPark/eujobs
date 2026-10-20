import { z } from 'zod';
import { calendarBoundary, getDb, getListingById, StoreError } from './store';
import type { Listing } from './types';
import { CALENDAR_TIMEZONE, type CalendarMonthPreview } from './monthly-calendar-shared';
import { eventCalendar, escapeIcsText, foldIcsLine } from '../app/api/events/[slug]/calendar/ics';

export interface CalendarMonth extends CalendarMonthPreview {
  events: Listing[];
}
export function localCalendarDay(value: string | Date, timezone = CALENDAR_TIMEZONE) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}
export const currentCalendarMonth = (now = new Date()) => localCalendarDay(now).slice(0, 7);
export function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
export function calendarMonthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month) || !z.iso.date().safeParse(`${month}-01`).success)
    throw new StoreError('Choose a valid calendar month.');
  const monthStart = `${month}-01`,
    nextStart = `${shiftMonth(month, 1)}-01`;
  const monthEnd = new Date(Date.parse(`${nextStart}T12:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
  return {
    month,
    monthStart,
    monthEnd,
    startsAt: calendarBoundary(monthStart, 'monthStart'),
    endsAt: calendarBoundary(nextStart, 'monthEnd'),
  };
}
export function eventOverlapsCalendarMonth(event: Listing, month: string, includeClosed = false) {
  const bounds = calendarMonthBounds(month);
  if (
    event.kind !== 'event' ||
    (!includeClosed && event.status !== 'published') ||
    event.isSample ||
    !event.startsAt ||
    !event.endsAt
  )
    return false;
  if (event.eventDateOnly) {
    const first = localCalendarDay(event.startsAt, event.timezone);
    const last = localCalendarDay(new Date(Date.parse(event.endsAt) - 1), event.timezone);
    return first <= bounds.monthEnd && last >= bounds.monthStart;
  }
  return (
    Date.parse(event.startsAt) < Date.parse(bounds.endsAt) &&
    Date.parse(event.endsAt) > Date.parse(bounds.startsAt)
  );
}
export function getPublishedMonthEvents(month: string): Listing[] {
  calendarMonthBounds(month);
  return getDb()
    .prepare("SELECT id FROM listings WHERE kind='event' AND status='published' AND isSample=0")
    .all()
    .map((row) => getListingById(String(row.id)))
    .filter((event): event is Listing => !!event && eventOverlapsCalendarMonth(event, month))
    .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!) || a.id.localeCompare(b.id));
}
export function getCalendarMonth(month: string, now = new Date()): CalendarMonth {
  const bounds = calendarMonthBounds(month),
    first = currentCalendarMonth(now);
  if (month < first || month > shiftMonth(first, 11))
    throw new StoreError('Choose this month or one of the next eleven months.');
  const events = getPublishedMonthEvents(month);
  return {
    month,
    monthStart: bounds.monthStart,
    monthEnd: bounds.monthEnd,
    label: new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${month}-01T12:00:00Z`)),
    count: events.length,
    events,
  };
}
export function getCalendarMonths(now = new Date()): CalendarMonthPreview[] {
  const first = currentCalendarMonth(now);
  return Array.from({ length: 12 }, (_, index) => {
    const { events: _events, ...preview } = getCalendarMonth(shiftMonth(first, index), now);
    return preview;
  });
}
function calendarEnvelope(events: Listing[], month: string, feed = false) {
  calendarMonthBounds(month);
  const seen = new Set<string>(),
    origin = process.env.APP_ORIGIN || 'https://eujobs.co';
  const components = events.map((event) => {
    if (seen.has(event.id) || !eventOverlapsCalendarMonth(event, month, feed))
      throw new StoreError('The monthly calendar contains an invalid or duplicate event.', 409);
    seen.add(event.id);
    const single = eventCalendar(event, origin),
      start = single.indexOf('BEGIN:VEVENT\r\n'),
      end = single.lastIndexOf('END:VEVENT\r\n');
    return single.slice(start, end + 'END:VEVENT\r\n'.length);
  });
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EUJobs//Monthly Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(`EUJobs: ${month}`)}`,
    `X-WR-CALDESC:${escapeIcsText('Published EUJobs events for the purchased month. Event admission and registration are separate.')}`,
    ...(feed ? ['REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'] : []),
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n' + components.join('') + 'END:VCALENDAR\r\n';
}
export function buildMonthlyCalendar(events: Listing[], month: string) {
  if (!events.length) throw new StoreError('There are no events in this calendar month.', 409);
  return calendarEnvelope(events, month);
}
export function buildMonthFeed(events: Listing[], month: string) {
  return calendarEnvelope(events, month, true);
}
