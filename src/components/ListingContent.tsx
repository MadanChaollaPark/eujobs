import { isCompetitorUrl } from '@/lib/competitors';
import type { ReactNode } from 'react';
import { z } from 'zod';

/** Vacancy content supports paragraphs, level-two headings and unordered lists only. */
export function ListingContent({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push(<p key={blocks.length}>{paragraph.join('\n')}</p>);
      paragraph = [];
    }
    if (bullets.length) {
      blocks.push(
        <ul key={blocks.length}>
          {bullets.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    const heading = /^##\s+(.+)$/.exec(line.trim());
    const bullet = /^-\s+(.+)$/.exec(line.trim());
    if (!line.trim()) {
      flush();
    } else if (heading) {
      flush();
      blocks.push(
        <h2 className="detail-section-title" key={blocks.length}>
          {heading[1]}
        </h2>,
      );
    } else if (bullet) {
      if (paragraph.length) flush();
      bullets.push(bullet[1]);
    } else {
      if (bullets.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return <div className="detail-description detail-content">{blocks}</div>;
}

export function safeWebHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function competitorHref(value: string): boolean {
  return isCompetitorUrl(value);
}

function safeEmailHref(value: string | null): string | null {
  if (!value || !/^mailto:/i.test(value) || /[\r\n]|%0[ad]/i.test(value)) return null;
  try {
    const url = new URL(value);
    const recipients = decodeURIComponent(url.pathname).split(',');
    if (
      value.includes('#') ||
      recipients.length > 5 ||
      !recipients.every((recipient) => z.email().safeParse(recipient.trim()).success)
    )
      return null;
    for (const [key, content] of url.searchParams) {
      if (!['subject', 'body'].includes(key.toLowerCase())) return null;
      if (key.toLowerCase() === 'subject' && /[\r\n]/.test(content)) return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function applicationTarget({
  href,
  kind,
  editorial = false,
  organizerEvent = false,
  method,
}: {
  href: string | null;
  kind: 'job' | 'event';
  editorial?: boolean;
  organizerEvent?: boolean;
  method?: 'url' | 'email' | 'instructions' | null;
}): { href: string; label: string; email: boolean } | null {
  if (editorial && kind === 'job') {
    if (method === 'email') {
      const email = safeEmailHref(href);
      return email ? { href: email, label: 'Email application', email: true } : null;
    }
    const url = safeWebHref(href);
    if (!url || competitorHref(url) || (method !== 'url' && method !== 'instructions')) return null;
    return {
      href: url,
      label: method === 'instructions' ? 'View application instructions' : 'Apply on employer site',
      email: false,
    };
  }
  const url = safeWebHref(href);
  return url
    ? {
        href: url,
        label:
          kind === 'job'
            ? 'Apply for this role'
            : organizerEvent
              ? 'Event details & registration'
              : 'Visit registration',
        email: false,
      }
    : null;
}
