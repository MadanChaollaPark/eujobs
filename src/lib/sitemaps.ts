import {
  allPublicListings,
  blogPosts,
  companies,
  DIRECTORY_SECTIONS,
  resourceList,
  siteOrigin,
  type DirectorySection,
} from '@/lib/resources';
import { CATEGORIES } from '@/lib/categories';
import { BRUSSELS_LANDING_PAGES } from '@/lib/landing-pages';
import { getAllStaticNicheSlugs } from '@/lib/niches';
import { SEO_LANDINGS } from '@/lib/seo-landings';
import { CITY_PAGES } from '@/lib/city-pages';
/** Treaty-seat cities after Brussels. Priority hint only. */
const INSTITUTIONAL = new Set([
  'geneva',
  'luxembourg',
  'strasbourg',
  'the-hague',
  'paris',
  'vienna',
]);
type Entry = { url: string; lastModified?: string; priority?: number };
export const SITEMAP_SECTIONS = [
  'jobs',
  'companies',
  'categories',
  'cities',
  'pages',
  'events',
  'blog',
  'career-guides',
  'brussels-best',
  'lobbying-entities',
] as const;
export type SitemapSection = (typeof SITEMAP_SECTIONS)[number];
export function sitemapEntries(section: SitemapSection): Entry[] {
  if (process.env.EUJOBS_SEED === '1') return [];
  const base = siteOrigin();
  const out: Entry[] = [];
  if (section === 'jobs' || section === 'events') {
    if (section === 'jobs') {
      out.push({ url: `${base}/jobs` });
      for (const p of BRUSSELS_LANDING_PAGES) out.push({ url: `${base}/jobs/brussels/${p.slug}` });
    } else out.push({ url: `${base}/events` });
    for (const listing of allPublicListings())
      if ((listing.kind === 'job') === (section === 'jobs'))
        out.push({
          url: `${base}/${listing.kind === 'job' ? 'jobs' : 'events'}/${listing.slug}`,
          lastModified: listing.updatedAt,
        });
  } else if (section === 'companies') {
    out.push({ url: `${base}/companies` });
    for (const company of companies()) out.push({ url: `${base}/companies/${company.slug}` });
  } else if (section === 'categories') {
    out.push({ url: `${base}/categories` });
    for (const c of CATEGORIES) out.push({ url: `${base}/categories/${c.slug}` });
    const citySlugs = new Set(CITY_PAGES.map((c) => c.slug));
    for (const slug of getAllStaticNicheSlugs()) {
      if (citySlugs.has(slug) || slug === 'jobs-in-brussels') continue;
      out.push({ url: `${base}/${slug}` });
    }
    for (const p of SEO_LANDINGS) out.push({ url: `${base}/${p.slug}` });
  } else if (section === 'cities') {
    const priorityFor = (slug: string) =>
      slug === 'brussels' ? 0.9 : INSTITUTIONAL.has(slug) ? 0.8 : 0.6;
    const ordered = [
      ...CITY_PAGES.filter((c) => c.slug === 'brussels'),
      ...[...INSTITUTIONAL].flatMap((slug) => CITY_PAGES.filter((c) => c.slug === slug)),
      ...CITY_PAGES.filter((c) => c.slug !== 'brussels' && !INSTITUTIONAL.has(c.slug)),
    ];
    for (const c of ordered) out.push({ url: `${base}/${c.slug}`, priority: priorityFor(c.slug) });
    out.push({ url: `${base}/cities`, priority: 0.5 });
  } else if (section === 'pages') {
    for (const path of [
      '',
      '/alerts',
      '/pricing',
      '/employers',
      '/compare',
      '/eurobrussels-alternative',
      '/jobsin-brussels-alternative',
      '/about',
      '/contact',
      '/blog',
      '/career-guides',
      '/fairpay',
      '/lobbying-entities',
      '/lobbying-entities/interests',
      '/lobbying-events',
      '/brussels-best',
      '/privacy',
      '/terms',
      '/help',
    ])
      out.push({ url: base + path });
  } else if (section === 'blog') {
    for (const post of blogPosts())
      out.push({
        url: `${base}/blog/${encodeURIComponent(post.slug)}`,
        ...(post.date && Number.isFinite(Date.parse(post.date))
          ? { lastModified: new Date(post.date).toISOString() }
          : {}),
      });
  } else if (section === 'career-guides' || section === 'lobbying-entities') {
    const key = section === 'career-guides' ? 'careerGuides' : 'lobbyingEntities';
    for (const item of resourceList(key))
      if (key !== 'lobbyingEntities' || item.flags?.indexable !== false)
        out.push({ url: `${base}/${section}/${encodeURIComponent(item.slug)}` });
  } else if (section === 'brussels-best') {
    for (const s of Object.keys(DIRECTORY_SECTIONS) as DirectorySection[]) {
      out.push({ url: `${base}/brussels-best/${s}` });
      for (const item of resourceList(s))
        out.push({ url: `${base}/brussels-best/${s}/${encodeURIComponent(item.slug)}` });
    }
  }
  return [...new Map(out.map((e) => [e.url, e])).values()];
}
const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function urlsetXml(entries: Entry[]) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries
      .map(
        (e) =>
          `<url><loc>${esc(e.url)}</loc>${e.lastModified ? `<lastmod>${esc(e.lastModified)}</lastmod>` : ''}${e.priority !== undefined ? `<priority>${e.priority.toFixed(1)}</priority>` : ''}</url>`,
      )
      .join('\n') +
    '\n</urlset>\n'
  );
}
export function sitemapIndexXml() {
  const base = siteOrigin();
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    SITEMAP_SECTIONS.map(
      (s) => `<sitemap><loc>${esc(`${base}/sitemaps/${s}.xml`)}</loc></sitemap>`,
    ).join('\n') +
    '\n</sitemapindex>\n'
  );
}
