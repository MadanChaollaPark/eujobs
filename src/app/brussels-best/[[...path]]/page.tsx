import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  DIRECTORY_SECTIONS,
  findResourceBySlug,
  resourceList,
  type DirectorySection,
} from '@/lib/resources';
import { pageMetadata } from '@/lib/page-metadata';
import {
  EmptyResources,
  ResourceCards,
  ResourceDetail,
  ResourcePage,
  ResourcePager,
} from '@/components/ResourceUI';
type Props = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
};
export async function generateMetadata({ params }: Props) {
  const { path = [] } = await params;
  if (!path.length)
    return pageMetadata(
      'Brussels Best',
      'Explore the EUJobs directory of public affairs expertise, organizations and useful tools in Brussels.',
      '/brussels-best',
    );
  const section = path[0] as DirectorySection;
  if (!Object.hasOwn(DIRECTORY_SECTIONS, section) || path.length > 2) notFound();
  const label = DIRECTORY_SECTIONS[section];
  const canonical = `/brussels-best/${path.map(encodeURIComponent).join('/')}`;
  if (path.length === 1)
    return pageMetadata(
      label,
      `Explore ${label.toLowerCase()} in the European affairs community.`,
      canonical,
    );
  const item = findResourceBySlug(resourceList(section), path[1]);
  if (!item) notFound();
  return pageMetadata(
    item.name,
    item.summary || `Explore ${item.name} in the EUJobs ${label.toLowerCase()} directory.`,
    `/brussels-best/${section}/${encodeURIComponent(item.slug)}`,
  );
}
export default async function BrusselsBest({ params, searchParams }: Props) {
  const { path = [] } = await params,
    query = await searchParams;
  if (!path.length)
    return (
      <ResourcePage
        title="The people and resources behind Brussels."
        eyebrow="BRUSSELS BEST"
        intro="Explore the EUJobs directory of public affairs expertise, organizations and useful tools."
      >
        <div className="resource-grid">
          {Object.entries(DIRECTORY_SECTIONS).map(([key, title]) => (
            <article className="resource-card" key={key}>
              <p className="eyebrow">{resourceList(key as DirectorySection).length} records</p>
              <h2>
                <Link href={`/brussels-best/${key}`}>{title}</Link>
              </h2>
              <Link className="text-link" href={`/brussels-best/${key}`}>
                Browse {title.toLowerCase()} →
              </Link>
            </article>
          ))}
        </div>
        <p className="resource-note">
          Directory entries preserve their source information. Inclusion is informational and does
          not imply an endorsement or a current business relationship.
        </p>
      </ResourcePage>
    );
  const section = path[0] as DirectorySection;
  if (!Object.hasOwn(DIRECTORY_SECTIONS, section) || path.length > 2) notFound();
  const all = resourceList(section),
    label = DIRECTORY_SECTIONS[section],
    base = `/brussels-best/${section}`;
  if (path.length === 2) {
    const item = findResourceBySlug(all, path[1]);
    if (!item) notFound();
    return <ResourceDetail item={item} base={base} label={label} />;
  }
  const q = query.q?.trim() || '',
    specialism = query.specialism || '',
    letter = query.letter || '';
  const items = all.filter(
    (r) =>
      (!q ||
        `${r.name} ${r.summary} ${r.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())) &&
      (!specialism || r.tags.includes(specialism)) &&
      (!letter || r.name.toUpperCase().startsWith(letter.toUpperCase())),
  );
  const pages = Math.ceil(items.length / 24),
    page = Math.min(Math.max(1, Number(query.page) || 1), Math.max(1, pages));
  const tags = [...new Set(all.flatMap((r) => r.tags))].sort();
  return (
    <ResourcePage
      title={label}
      eyebrow="BRUSSELS BEST"
      intro={`Explore ${label.toLowerCase()} in the European affairs community.`}
    >
      <p>
        <Link className="text-link" href="/brussels-best">
          ← All Brussels Best resources
        </Link>
      </p>
      <form className="resource-filter" role="search">
        <label>
          Search
          <input name="q" defaultValue={q} placeholder={`Find ${label.toLowerCase()}…`} />
        </label>
        {tags.length > 0 && (
          <label>
            Specialism
            <select name="specialism" defaultValue={specialism}>
              <option value="">All specialisms</option>
              {tags.map((tag) => (
                <option key={tag}>{tag}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Starts with
          <select name="letter" defaultValue={letter}>
            <option value="">Any letter</option>
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <button className="button">Filter</button>
      </form>
      <p>
        {items.length} {items.length === 1 ? 'record' : 'records'}
      </p>
      {items.length ? (
        <>
          <ResourceCards items={items.slice((page - 1) * 24, page * 24)} base={base} />
          <ResourcePager page={page} pages={pages} base={base} query={{ q, specialism, letter }} />
        </>
      ) : (
        <EmptyResources
          title={
            all.length
              ? 'No records match these filters.'
              : 'This collection has no published records yet.'
          }
        />
      )}
    </ResourcePage>
  );
}
