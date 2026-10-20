import { pageMetadata } from '@/lib/page-metadata';
import { blogPosts } from '@/lib/resources';
import { ResourceCards, ResourcePage, ResourcePager } from '@/components/ResourceUI';
export const metadata = pageMetadata(
  'Career advice',
  'Explore the EUJobs archive of advice on European careers, applications and life in Brussels.',
  '/blog',
);
export default async function Blog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams,
    q = params.q?.trim() || '';
  const posts = blogPosts().filter(
    (post) => !q || `${post.name} ${post.summary}`.toLowerCase().includes(q.toLowerCase()),
  );
  const pages = Math.ceil(posts.length / 12),
    page = Math.min(Math.max(1, Number(params.page) || 1), Math.max(1, pages));
  return (
    <ResourcePage
      title="A little guidance for what’s next."
      eyebrow="CAREER ADVICE"
      intro="Ideas, practical guides and perspectives from the EUJobs archive."
    >
      <form className="resource-filter" role="search">
        <label>
          Search articles
          <input name="q" defaultValue={q} placeholder="Applications, Brussels, careers…" />
        </label>
        <button className="button">Search</button>
      </form>
      <p>{posts.length} articles</p>
      <ResourceCards items={posts.slice((page - 1) * 12, page * 12)} base="/blog" />
      <ResourcePager page={page} pages={pages} base="/blog" query={{ q }} />
    </ResourcePage>
  );
}
