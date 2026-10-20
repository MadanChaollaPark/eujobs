import Link from 'next/link';
import type { ReactNode } from 'react';
import { resourceList, safeWebUrl, type Resource } from '@/lib/resources';

export function ResourcePage({
  eyebrow = 'THE EUROPEAN COMMUNITY',
  title,
  intro,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="container resource-page">
      <header className="resource-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </header>
      {children}
    </div>
  );
}
export function EmptyResources({
  title = 'There are no published records yet.',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{children || 'This directory will show records as they become available.'}</p>
      <Link href="/contact" className="text-link">
        Suggest a resource →
      </Link>
    </div>
  );
}
export function ResourceCards({ items, base }: { items: Resource[]; base: string }) {
  return (
    <div className="resource-grid">
      {items.map((item) => (
        <article className="resource-card" key={item.slug}>
          <div className="eyebrow">{item.tags[0] || item.author || 'EUJOBS RESOURCE'}</div>
          <h2>
            <Link href={`${base}/${encodeURIComponent(item.slug)}`}>{item.name}</Link>
          </h2>
          {item.summary && <p>{item.summary}</p>}
          {item.date && <p className="resource-date">{item.date.slice(0, 10)}</p>}
          <Link className="text-link" href={`${base}/${encodeURIComponent(item.slug)}`}>
            Explore →
          </Link>
        </article>
      ))}
    </div>
  );
}
function inline(value: string): ReactNode[] {
  return value.split(/(\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const url =
        safeWebUrl(link[2]) ||
        (link[2].startsWith('/') && !link[2].startsWith('//') ? link[2] : undefined);
      return url ? (
        <a key={i} href={url} rel="noopener noreferrer">
          {link[1]}
        </a>
      ) : (
        link[1]
      );
    }
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}
export function ArticleBody({ content }: { content: string }) {
  return (
    <div className="resource-prose">
      {content.split(/\n\s*\n/).map((block, i) => {
        const heading = block.match(/^(#{1,6})\s+([^\n]+)$/);
        if (heading)
          return heading[1].length < 3 ? (
            <h2 key={i}>{inline(heading[2])}</h2>
          ) : (
            <h3 key={i}>{inline(heading[2])}</h3>
          );
        if (/^[-*_]{3,}$/.test(block.trim())) return <hr key={i} />;
        if (
          /^[-*]\s/m.test(block) &&
          block.split('\n').every((l) => /^[-*]\s/.test(l) || !l.trim())
        )
          return (
            <ul key={i}>
              {block
                .split('\n')
                .filter(Boolean)
                .map((l, j) => (
                  <li key={j}>{inline(l.replace(/^[-*]\s/, ''))}</li>
                ))}
            </ul>
          );
        if (
          /^\d+\.\s/m.test(block) &&
          block.split('\n').every((l) => /^\d+\.\s/.test(l) || !l.trim())
        )
          return (
            <ol key={i}>
              {block
                .split('\n')
                .filter(Boolean)
                .map((l, j) => (
                  <li key={j}>{inline(l.replace(/^\d+\.\s/, ''))}</li>
                ))}
            </ol>
          );
        return <p key={i}>{inline(block)}</p>;
      })}
    </div>
  );
}
export function ResourceDetail({
  item,
  base,
  label,
}: {
  item: Resource;
  base: string;
  label: string;
}) {
  const related = (item.relations || []).flatMap((relation) => {
    const record = resourceList(relation.section).find((r) => r.slug === relation.slug);
    return record
      ? [
          {
            name: record.name,
            href: `${relation.section === 'lobbyingEntities' ? '/lobbying-entities' : `/brussels-best/${relation.section}`}/${encodeURIComponent(record.slug)}`,
          },
        ]
      : [];
  });
  return (
    <ResourcePage eyebrow={label.toUpperCase()} title={item.name} intro={item.summary}>
      <p>
        <Link className="text-link" href={base}>
          ← All {label.toLowerCase()}
        </Link>
      </p>
      {base === '/career-guides' && (
        <p className="resource-note">
          From the earlier EUJobs career guide collection. Recruitment details and figures may have
          changed; confirm them with the organization.
        </p>
      )}
      <div className="resource-detail">
        <article>
          <ArticleBody content={item.content} />
          {Object.keys(item.fields).length > 0 && (
            <dl className="resource-fields">
              {Object.entries(item.fields)
                .filter(([label]) => label !== 'About')
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
          )}
        </article>
        <aside className="resource-card">
          <h2>Details</h2>
          {item.tags.length > 0 && (
            <div className="resource-tags">
              {item.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`${base === '/career-guides' ? '/lobbying-entities' : base}?${base === '/lobbying-entities' || base === '/career-guides' ? 'interest' : 'specialism'}=${encodeURIComponent(tag)}`}
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}
          {item.website && (
            <p>
              <a
                className="text-link"
                href={item.website}
                target="_blank"
                rel="noopener noreferrer"
              >
                Official website ↗
              </a>
            </p>
          )}
          {item.sourceUrl && (
            <p>
              <a
                className="text-link"
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Source record ↗
              </a>
            </p>
          )}
          {item.sourceDate && <p>Source recorded: {item.sourceDate.slice(0, 10)}</p>}
          {related.length > 0 && (
            <>
              <h3>Related profiles</h3>
              {related.map((link) => (
                <p key={link.href}>
                  <Link className="text-link" href={link.href}>
                    {link.name} →
                  </Link>
                </p>
              ))}
            </>
          )}
          <p>
            Directory information may change. Check the organization’s website for current details.
          </p>
          <Link className="text-link" href="/contact">
            Suggest a correction →
          </Link>
        </aside>
      </div>
    </ResourcePage>
  );
}
export function ResourcePager({
  page,
  pages,
  base,
  query = {},
}: {
  page: number;
  pages: number;
  base: string;
  query?: Record<string, string>;
}) {
  function url(p: number) {
    return `${base}?${new URLSearchParams({ ...query, page: String(p) })}`;
  }
  return pages > 1 ? (
    <nav className="pagination" aria-label="Resource pages">
      {page > 1 && <Link href={url(page - 1)}>← Previous</Link>}
      <span>
        Page {page} of {pages}
      </span>
      {page < pages && <Link href={url(page + 1)}>Next →</Link>}
    </nav>
  ) : null;
}
