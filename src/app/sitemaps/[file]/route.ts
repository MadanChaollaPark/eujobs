import { SITEMAP_SECTIONS, sitemapEntries, urlsetXml, type SitemapSection } from '@/lib/sitemaps';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const section = file.replace(/\.xml$/, '');
  if (!file.endsWith('.xml') || !(SITEMAP_SECTIONS as readonly string[]).includes(section))
    return new Response('Not found', { status: 404 });
  return new Response(urlsetXml(sitemapEntries(section as SitemapSection)), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
