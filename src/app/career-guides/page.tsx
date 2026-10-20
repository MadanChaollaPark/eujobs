import { pageMetadata } from '@/lib/page-metadata';
import { resourceList } from '@/lib/resources';
import {
  ResourceCards,
  ResourcePage,
  ResourcePager,
  EmptyResources,
} from '@/components/ResourceUI';
export const metadata = pageMetadata(
  'Organization career guides',
  'Explore the EUJobs archive of organization career guides and recruitment information.',
  '/career-guides',
);
export default async function CareerGuides({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams,
    q = query.q?.trim() || '',
    items = resourceList('careerGuides').filter((item) =>
      `${item.name} ${item.summary}`.toLowerCase().includes(q.toLowerCase()),
    ),
    pages = Math.ceil(items.length / 12),
    page = Math.min(Math.max(1, Number(query.page) || 1), Math.max(1, pages));
  return (
    <ResourcePage
      title="Know the organization. Find your path."
      eyebrow="CAREER GUIDES"
      intro="Explore how European organizations work and the routes into a career with them."
    >
      <form className="resource-filter" role="search">
        <label>
          Find an organization
          <input name="q" defaultValue={q} />
        </label>
        <button className="button">Search</button>
      </form>
      {items.length ? (
        <>
          <p>{items.length} guides</p>
          <ResourceCards items={items.slice((page - 1) * 12, page * 12)} base="/career-guides" />
          <ResourcePager page={page} pages={pages} base="/career-guides" query={{ q }} />
        </>
      ) : (
        <EmptyResources title="No organization guides are published yet.">
          Browse our career advice archive while this collection is being restored.
        </EmptyResources>
      )}
    </ResourcePage>
  );
}
