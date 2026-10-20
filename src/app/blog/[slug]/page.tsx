import Link from 'next/link';
import { notFound } from 'next/navigation';
import { blogPosts, findResourceBySlug, siteOrigin } from '@/lib/resources';
import { ArticleBody, ResourcePage, ResourceCards } from '@/components/ResourceUI';
import { pageMetadata } from '@/lib/page-metadata';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    post = findResourceBySlug(blogPosts(), slug);
  if (!post) notFound();
  return pageMetadata(post.name, post.summary, `/blog/${encodeURIComponent(post.slug)}`, {
    article: true,
  });
}
export default async function BlogArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    posts = blogPosts(),
    post = findResourceBySlug(posts, slug);
  if (!post) notFound();
  const json = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.name,
    description: post.summary,
    ...(post.date ? { datePublished: post.date } : {}),
    author: { '@type': 'Organization', name: post.author || 'EUJobs' },
    url: `${siteOrigin()}/blog/${encodeURIComponent(post.slug)}`,
  };
  return (
    <ResourcePage title={post.name} eyebrow="CAREER ADVICE">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, '\\u003c') }}
      />
      <p>
        <Link className="text-link" href="/blog">
          ← All career advice
        </Link>
      </p>
      <p className="resource-date">
        {post.author}
        {post.date && ` · ${post.date.slice(0, 10)}`}
      </p>
      <p className="resource-note">
        From the EUJobs archive. Dates, figures and recruitment requirements reflect the original
        article; confirm current requirements with the employer or official institution.
      </p>
      <ArticleBody content={post.content} />
      <section className="resource-related">
        <h2>Keep exploring</h2>
        <ResourceCards items={posts.filter((p) => p.slug !== post.slug).slice(0, 3)} base="/blog" />
      </section>
    </ResourcePage>
  );
}
