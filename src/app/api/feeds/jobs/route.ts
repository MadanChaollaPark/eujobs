import { allPublicListings, siteOrigin } from '@/lib/resources';
import { escapeXml, cdata } from '@/lib/xml';
export const dynamic = 'force-dynamic';
export function GET() {
  try {
    const jobs = allPublicListings('job').slice(0, 500),
      base = siteOrigin();
    const entries = jobs
      .map(
        (job) =>
          `<job><id>${escapeXml(job.id)}</id><title>${escapeXml(job.title)}</title><link>${escapeXml(`${base}/jobs/${job.slug}`)}</link><company>${escapeXml(job.organization)}</company><city>${escapeXml(job.location)}</city><country>${escapeXml(job.country)}</country><date>${escapeXml(job.publishedAt || job.createdAt)}</date>${job.deadline ? `<expire>${escapeXml(job.deadline)}</expire>` : ''}<description>${cdata(job.description)}</description><jobtype>${escapeXml(job.employmentType)}</jobtype></job>`,
      )
      .join('\n');
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<jobs>${entries}</jobs>\n`, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new Response('Job feed temporarily unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
    });
  }
}
