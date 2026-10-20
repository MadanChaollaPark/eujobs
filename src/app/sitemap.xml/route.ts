import { sitemapIndexXml } from '@/lib/sitemaps';
export const dynamic = 'force-dynamic';
export function GET() {
  return new Response(sitemapIndexXml(), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
