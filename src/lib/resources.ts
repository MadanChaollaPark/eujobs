import { isCompetitorUrl } from './competitors';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { searchListings } from './store';
import type { Listing, ListingKind } from './types';

export interface Resource {
  slug: string;
  name: string;
  summary: string;
  content: string;
  tags: string[];
  website?: string;
  sourceUrl?: string;
  sourceDate?: string;
  date?: string;
  author?: string;
  fields: Record<string, string>;
  relations?: { section: DirectorySection | 'lobbyingEntities'; slug: string }[];
  flags?: { indexable?: boolean; inRegister?: boolean; brussels?: boolean; removedOn?: string };
}
export function findResourceBySlug<T extends { slug: string }>(
  items: T[],
  slug: string,
): T | undefined {
  const exact = items.find((item) => item.slug === slug);
  if (exact) return exact;
  // Next route params may retain URL encoding. Exact lookup comes first so
  // existing slugs with literal percent characters keep their own identity.
  try {
    const decoded = decodeURIComponent(slug);
    return decoded === slug ? undefined : items.find((item) => item.slug === decoded);
  } catch {
    return undefined;
  }
}
export const DIRECTORY_SECTIONS = {
  consultancies: 'Consultancies',
  consultants: 'Consultants',
  'law-firms': 'Law firms',
  'intelligence-systems': 'Intelligence systems',
  'digital-tools': 'Digital tools',
  trainers: 'Trainers',
  specialists: 'Specialists',
  articles: 'Articles',
  guides: 'Guides',
} as const;
export type DirectorySection = keyof typeof DIRECTORY_SECTIONS;
export function siteOrigin() {
  return (process.env.APP_ORIGIN || 'https://eujobs.co').replace(/\/$/, '');
}
export function safeWebUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !isCompetitorUrl(url.href)
      ? url.href
      : undefined;
  } catch {
    return;
  }
}
export function plainContent(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|section|tr)>/gi, '\n\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
export function articleContent(value: unknown): string {
  if (typeof value !== 'string') return '';
  return plainContent(
    value
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(
        /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_match, url: string, label: string) => {
          const safe = safeWebUrl(url.replace(/&amp;/g, '&'));
          return safe
            ? `[${plainContent(label)}](${safe.replace(/\(/g, '%28').replace(/\)/g, '%29')})`
            : plainContent(label);
        },
      )
      .replace(
        /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
        (_match, level: string, label: string) =>
          `\n\n${'#'.repeat(Math.max(2, Number(level)))} ${plainContent(label)}\n\n`,
      )
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/li>/gi, '\n'),
  );
}
type ResourceFile = {
  lobbyingEntities?: unknown[];
  careerGuides?: unknown[];
  blog?: unknown[];
  niches?: unknown[];
  brusselsBest?: Partial<Record<DirectorySection, unknown[]>>;
};
let fileCache: { filename: string; stamp: string; value: ResourceFile } | undefined;
const normalizedCache = new Map<string, Resource[]>();
export function readResourceFile(): ResourceFile {
  const filename =
    process.env.EUJOBS_RESOURCES_FILE ||
    join(resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || './data'), 'resources.json');
  if (!existsSync(/* turbopackIgnore: true */ filename)) {
    fileCache = undefined;
    normalizedCache.clear();
    return {};
  }
  const info = statSync(/* turbopackIgnore: true */ filename),
    stamp = `${info.mtimeMs}:${info.size}`;
  if (fileCache?.filename === filename && fileCache.stamp === stamp) return fileCache.value;
  const value = JSON.parse(readFileSync(/* turbopackIgnore: true */ filename, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid resource inventory');
  fileCache = { filename, stamp, value };
  normalizedCache.clear();
  return value;
}
const FIELD_LABELS: Record<string, string> = {
  acronym: 'Acronym',
  registrationNumber: 'Register number',
  identificationCode: 'Register number',
  euOffice: 'EU office',
  entityForm: 'Legal form',
  registrationCategory: 'Registration category',
  registrationDate: 'Registration date',
  lastUpdateDate: 'Register updated',
  country: 'Country',
  city: 'City',
  address: 'Address',
  location: 'Location',
  organization: 'Organization',
  companyName: 'Organization',
  role: 'Role',
  jobTitle: 'Role',
  type: 'Type',
  category: 'Category',
  description: 'About',
  mission: 'Mission',
  activities: 'Activities',
  goals: 'Goals',
  annualBudget: 'Annual budget',
  lobbyingBudget: 'Lobbying expenditure',
  staffCount: 'Staff count',
  numberOfPersons: 'People involved',
  fullTimeEquivalent: 'Full-time equivalent staff',
  interestRepresented: 'Interests represented',
  clients: 'Clients',
  membership: 'Membership',
  entityName: 'Organization',
  source: 'Source',
  sourceName: 'Source',
  ownership: 'Ownership',
  brusselsOfficeSince: 'Brussels office since',
  experience: 'Experience',
  achievements: 'Achievements',
  education: 'Education',
  languages: 'Languages',
  myJob: 'Role description',
  services: 'Services',
  programs: 'Training programmes',
  features: 'Features',
  keyPartners: 'Key partners',
};
export function normalizeResource(input: unknown): Resource | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  if (typeof r.slug !== 'string' || !r.slug || /[\\/?#]/.test(r.slug)) return null;
  const name = plainContent(r.name || r.title || r.originalName);
  if (!name) return null;
  const fields: Record<string, string> = {};
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const value = r[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const text = plainContent(String(value));
      if (text) fields[label] = text;
    } else if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
      fields[label] = value.join(', ');
  }
  const tags = [r.tags, r.interests, r.specialisms, r.specialistAreas, r.relatedInterests].flatMap(
    (v) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []),
  );
  if (r.headOffice && typeof r.headOffice === 'object') {
    const office = r.headOffice as Record<string, unknown>;
    for (const key of ['city', 'country', 'address'])
      if (typeof office[key] === 'string') fields[FIELD_LABELS[key]] = plainContent(office[key]);
  }
  const sections = Array.isArray(r.sections)
    ? r.sections
        .flatMap((section) => {
          if (!section || typeof section !== 'object') return [];
          const s = section as Record<string, unknown>;
          return [
            plainContent(s.heading || s.title),
            articleContent(s.content || s.contentHtml || s.body || s.text),
          ]
            .filter(Boolean)
            .join('\n\n');
        })
        .join('\n\n')
    : '';
  const relations: NonNullable<Resource['relations']> = [];
  for (const [key, section] of [
    ['linkedConsultants', 'consultants'],
    ['consultancies', 'consultancies'],
    ['lawFirms', 'law-firms'],
    ['organizationSlug', 'consultancies'],
    ['entitySlug', 'lobbyingEntities'],
  ] as const) {
    const slugs = Array.isArray(r[key]) ? r[key] : [r[key]];
    for (const slug of slugs as unknown[])
      if (typeof slug === 'string' && slug && !/[\\/?#]/.test(slug))
        relations.push({ section, slug });
  }
  const contactWebsite =
    r.contact && typeof r.contact === 'object'
      ? (r.contact as Record<string, unknown>).website
      : undefined;
  return {
    slug: r.slug,
    name,
    summary: plainContent(r.summary || r.excerpt || r.description || r.mission).slice(0, 400),
    content:
      articleContent(r.content || r.contentHtml || r.body) ||
      sections ||
      articleContent(r.description || r.myJob),
    tags: [...new Set(tags)],
    website: safeWebUrl(r.website || r.websiteUrl || r.webSiteURL || r.url || contactWebsite),
    sourceUrl: safeWebUrl(r.sourceUrl || r.originalUrl),
    sourceDate:
      typeof r.sourceDate === 'string'
        ? r.sourceDate
        : typeof r.scrapedAt === 'string'
          ? r.scrapedAt
          : undefined,
    date:
      typeof r.date === 'string'
        ? r.date
        : typeof r.publishedDate === 'string'
          ? r.publishedDate
          : undefined,
    author: typeof r.author === 'string' ? r.author : undefined,
    fields,
    relations,
    flags:
      typeof r.indexable === 'boolean' || typeof r.inRegister === 'boolean'
        ? {
            indexable: r.indexable === true,
            inRegister: r.inRegister !== false,
            brussels: r.brussels === true,
            removedOn:
              typeof r.removedFromRegister === 'string' ? r.removedFromRegister : undefined,
          }
        : undefined,
  };
}
export function resourceList(
  kind: 'lobbyingEntities' | 'careerGuides' | 'blog' | DirectorySection,
): Resource[] {
  const data = readResourceFile();
  const cached = normalizedCache.get(kind);
  if (cached) return cached;
  const rows = Object.hasOwn(DIRECTORY_SECTIONS, kind)
    ? data.brusselsBest?.[kind as DirectorySection]
    : data[kind as 'blog'];
  if (rows !== undefined && !Array.isArray(rows))
    throw new Error(`Invalid resource collection: ${kind}`);
  const result = (rows || [])
    .map(normalizeResource)
    .filter((r): r is Resource => r !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
  normalizedCache.set(kind, result);
  return result;
}
export function allPublicListings(kind?: ListingKind): Listing[] {
  const first = searchListings({ kind, pageSize: 100, page: 1 });
  const items = [...first.items];
  for (let page = 2; page <= first.pages; page++)
    items.push(...searchListings({ kind, pageSize: 100, page }).items);
  return items.filter((l) => !l.isSample);
}
export function companySlug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
export function companies() {
  const groups = new Map<string, { id: string; name: string; slug: string; jobs: Listing[] }>();
  for (const job of allPublicListings('job')) {
    const group = groups.get(job.organizationId) || {
      id: job.organizationId,
      name: job.organization,
      slug: `${companySlug(job.organization)}-${job.organizationId.slice(0, 8)}`,
      jobs: [],
    };
    group.jobs.push(job);
    groups.set(job.organizationId, group);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function lobbyingSourceInfo(): { exportDate?: string } {
  const info = (readResourceFile() as { lobbyingEntitiesSource?: { exportDate?: string } })
    .lobbyingEntitiesSource;
  return info || {};
}
export function blogPosts(): Resource[] {
  const directory = join(process.cwd(), 'src/content/blog');
  const local: Resource[] = existsSync(/* turbopackIgnore: true */ directory)
    ? readdirSync(/* turbopackIgnore: true */ directory)
        .filter((name) => name.endsWith('.md'))
        .flatMap((filename) => {
          const raw = readFileSync(/* turbopackIgnore: true */ join(directory, filename), 'utf8');
          if (!raw.trim()) return [];
          const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
          const meta = Object.fromEntries(
            (match?.[1] || '').split('\n').flatMap((line) => {
              const pair = line.match(/^([\w-]+):\s*(.*?)\s*$/);
              return pair ? [[pair[1], pair[2].replace(/^['"]|['"]$/g, '')]] : [];
            }),
          );
          const content = raw.slice(match?.[0].length || 0).trim();
          const summary =
            content
              .split(/\n\s*\n/)
              .find((block) => block.length > 80 && !/^(#|\*\*Date|\*\*Author|---)/.test(block)) ||
            content;
          return [
            {
              slug: filename.slice(0, -3),
              name: meta.title || filename.slice(0, -3).replaceAll('-', ' '),
              summary: summary.replace(/[*_#]/g, '').trim().slice(0, 220),
              content,
              date: meta.date,
              author: meta.author || 'EUJobs team',
              tags: [],
              fields: {},
            } satisfies Resource,
          ];
        })
    : [];
  const merged = new Map(local.map((post) => [post.slug, post]));
  for (const post of resourceList('blog')) merged.set(post.slug, post);
  return [...merged.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
