import { allPublicListings, blogPosts, siteOrigin } from '@/lib/resources';
import { escapeXml } from '@/lib/xml';
export const dynamic = 'force-dynamic';
export function GET() {
  try {
    const base = siteOrigin();
    const entries = [
      ...allPublicListings('job').map((job) => ({
        title: `${job.title} — ${job.organization}`,
        url: `${base}/jobs/${job.slug}`,
        description: job.summary,
        date: job.publishedAt || job.createdAt,
      })),
      ...blogPosts().map((post) => ({
        title: post.name,
        url: `${base}/blog/${encodeURIComponent(post.slug)}`,
        description: post.summary,
        date: post.date || '',
      })),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 100);
    const items = entries
      .map(
        (item) =>
          `<item><title>${escapeXml(item.title)}</title><link>${escapeXml(item.url)}</link><guid isPermaLink="true">${escapeXml(item.url)}</guid><description>${escapeXml(item.description)}</description>${item.date && Number.isFinite(Date.parse(item.date)) ? `<pubDate>${new Date(item.date).toUTCString()}</pubDate>` : ''}</item>`,
      )
      .join('\n');
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>EUJobs</title><link>${escapeXml(base)}</link><description>European careers and career advice</description>${items}</channel></rss>`,
      {
        headers: {
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      },
    );
  } catch {
    return new Response('Feed temporarily unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
