import type { Listing } from '@/lib/types';

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}
export function foldIcsLine(value: string): string {
  const lines: string[] = [];
  let line = '';
  let bytes = 0;
  for (const char of value) {
    const width = Buffer.byteLength(char, 'utf8');
    if (bytes + width > 75) {
      lines.push(line);
      line = ' ';
      bytes = 1;
    }
    line += char;
    bytes += width;
  }
  lines.push(line);
  return lines.join('\r\n');
}
function utc(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid event date.');
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}
function localCalendarDate(value: string, timezone: string) {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid event date.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}`;
}
export function eventCalendar(event: Listing, origin: string): string {
  if (event.kind !== 'event' || !event.startsAt || !event.endsAt)
    throw new Error('An event must have a start and end.');
  const pageUrl = new URL(`/events/${encodeURIComponent(event.slug)}`, origin).href;
  const description = `${event.isSample ? 'SAMPLE EVENT — demonstration only.\n\n' : ''}${event.description}\n\n${pageUrl}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EUJobs//Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@eujobs`,
    `DTSTAMP:${utc(event.updatedAt)}`,
    ...(event.eventDateOnly
      ? [
          `DTSTART;VALUE=DATE:${localCalendarDate(event.startsAt, event.timezone)}`,
          `DTEND;VALUE=DATE:${localCalendarDate(event.endsAt, event.timezone)}`,
        ]
      : [`DTSTART:${utc(event.startsAt)}`, `DTEND:${utc(event.endsAt)}`]),
    `SUMMARY:${escapeIcsText(`${event.isSample ? '[Sample] ' : ''}${event.title}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText([event.venue, event.location].filter(Boolean).join(', '))}`,
    `URL:${pageUrl}`,
    `STATUS:${event.status === 'closed' ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${event.version}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
