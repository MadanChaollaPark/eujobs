/** Owner rule: EUJobs never links to these job boards. */
export const COMPETITOR_HOSTS = [
  'eurobrussels.com',
  'brusselsjobs.com',
  'jobsin.brussels',
] as const;
export function isCompetitorUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/\.$/, '');
    return COMPETITOR_HOSTS.some((c) => host === c || host.endsWith(`.${c}`));
  } catch {
    return /eurobrussels\.com|brusselsjobs\.com|jobsin\.brussels/i.test(value);
  }
}
/** Removes markdown/HTML links and bare URLs that point to competitor boards. */
export function stripCompetitorLinks(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (m, label, href) =>
      isCompetitorUrl(href) ? label : m,
    )
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis, (m, href, label) =>
      isCompetitorUrl(href) ? label : m,
    )
    .replace(/https?:\/\/[^\s)<>"']+/g, (u) => (isCompetitorUrl(u) ? '' : u));
}
