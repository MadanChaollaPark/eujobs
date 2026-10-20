import type { Listing } from './types';
import type { Resource } from './resources';
import copy from '../data/city-pages.json';
import { resourceList } from './resources';

/** City landing pages at /<slug>. Page copy lives in src/data/city-pages.json (regenerate with
 * scripts/build-city-copy.py from cities/pages/<slug>.md) so it can be swapped without code changes. */
export type CityPage = {
  slug: string;
  name: string;
  country: string;
  /** Matches job location text, including local-language names. */
  jobPattern: RegExp;
  /** Exact (accent-folded) Transparency Register city values for this city. */
  registerCities: string[];
};
export const CITY_PAGES: CityPage[] = [
  {
    slug: 'brussels',
    name: 'Brussels',
    country: 'Belgium',
    /** Local names only. Do not match the country name Belgium on its own. */
    jobPattern: /\bbrussels\b|\bbruxelles\b|\bbrussel\b/i,
    registerCities: ['brussels', 'bruxelles', 'brussel'],
  },
  {
    slug: 'london',
    name: 'London',
    country: 'United Kingdom',
    jobPattern: /\blondon\b/i,
    registerCities: ['london'],
  },
  {
    slug: 'berlin',
    name: 'Berlin',
    country: 'Germany',
    jobPattern: /\bberlin\b/i,
    registerCities: ['berlin'],
  },
  {
    slug: 'paris',
    name: 'Paris',
    country: 'France',
    jobPattern: /\bparis\b/i,
    registerCities: ['paris'],
  },
  {
    slug: 'geneva',
    name: 'Geneva',
    country: 'Switzerland',
    jobPattern: /\bgen[eè]v[ae]\b|\bgenf\b/i,
    registerCities: ['geneva', 'geneve', 'genf'],
  },
  {
    slug: 'luxembourg',
    name: 'Luxembourg',
    country: 'Luxembourg',
    jobPattern: /\bluxemb(?:o|ou)rg\b|\bluxemburg\b/i,
    registerCities: ['luxembourg', 'luxemburg'],
  },
  {
    slug: 'strasbourg',
    name: 'Strasbourg',
    country: 'France',
    jobPattern: /\bstrasbourg\b|\bstra(?:ss|ß)burg\b/i,
    registerCities: ['strasbourg'],
  },
  {
    slug: 'the-hague',
    name: 'The Hague',
    country: 'Netherlands',
    jobPattern: /\bthe hague\b|\bden haag\b|'s-gravenhage|\bla haye\b/i,
    registerCities: ['the hague', 'den haag', "'s-gravenhage", 's-gravenhage'],
  },
  {
    slug: 'vienna',
    name: 'Vienna',
    country: 'Austria',
    jobPattern: /\bvienna\b|\bwien\b/i,
    registerCities: ['vienna', 'wien'],
  },
  {
    slug: 'madrid',
    name: 'Madrid',
    country: 'Spain',
    jobPattern: /\bmadrid\b/i,
    registerCities: ['madrid'],
  },
  {
    slug: 'rome',
    name: 'Rome',
    country: 'Italy',
    jobPattern: /\brome\b|\broma\b/i,
    registerCities: ['rome', 'roma'],
  },
  {
    slug: 'warsaw',
    name: 'Warsaw',
    country: 'Poland',
    jobPattern: /\bwarsaw\b|\bwarszawa\b|\bvarsovie\b/i,
    registerCities: ['warsaw', 'warszawa'],
  },
  {
    slug: 'copenhagen',
    name: 'Copenhagen',
    country: 'Denmark',
    jobPattern: /\bcopenhagen\b|\bk(?:ø|o|oe)benhavn\b/i,
    registerCities: ['copenhagen', 'kobenhavn', 'koebenhavn'],
  },
  {
    slug: 'stockholm',
    name: 'Stockholm',
    country: 'Sweden',
    jobPattern: /\bstockholm\b/i,
    registerCities: ['stockholm'],
  },
  {
    slug: 'dublin',
    name: 'Dublin',
    country: 'Ireland',
    jobPattern: /\bdublin\b/i,
    registerCities: ['dublin'],
  },
  {
    slug: 'lisbon',
    name: 'Lisbon',
    country: 'Portugal',
    jobPattern: /\blisbon\b|\blisboa\b|\blisbonne\b/i,
    registerCities: ['lisbon', 'lisboa'],
  },
  {
    slug: 'prague',
    name: 'Prague',
    country: 'Czechia',
    jobPattern: /\bprague\b|\bpraha\b/i,
    registerCities: ['prague', 'praha'],
  },
  {
    slug: 'budapest',
    name: 'Budapest',
    country: 'Hungary',
    jobPattern: /\bbudapest\b/i,
    registerCities: ['budapest'],
  },
  {
    slug: 'athens',
    name: 'Athens',
    country: 'Greece',
    jobPattern: /\bathens\b|\bathina\b|αθήνα/i,
    registerCities: ['athens', 'athina'],
  },
  {
    slug: 'amsterdam',
    name: 'Amsterdam',
    country: 'Netherlands',
    jobPattern: /\bamsterdam\b/i,
    registerCities: ['amsterdam'],
  },
  {
    slug: 'milan',
    name: 'Milan',
    country: 'Italy',
    jobPattern: /\bmilan\b|\bmilano\b/i,
    registerCities: ['milan', 'milano'],
  },
];
export type CityCopy = {
  title: string;
  description: string;
  h1: string;
  html: string;
  employersHtml?: string;
};
const COPY = copy as Record<string, CityCopy>;

export function getCityPage(slug: string) {
  return CITY_PAGES.find((c) => c.slug === slug) || null;
}

/** First city whose jobPattern matches location text. Empty when nothing matches, including "Belgium" alone. */
export function cityForLocation(location: string | null | undefined) {
  if (!location) return null;
  return CITY_PAGES.find((c) => c.jobPattern.test(location)) || null;
}

export function citySlugForLocation(location: string | null | undefined) {
  return cityForLocation(location)?.slug || '';
}

/** Homepage strip and footer: institutional seats, Brussels first. */
export const FEATURED_CITY_SLUGS = [
  'brussels',
  'luxembourg',
  'strasbourg',
  'geneva',
  'the-hague',
  'paris',
  'vienna',
] as const;

export function featuredCityPages() {
  const bySlug = new Map(CITY_PAGES.map((c) => [c.slug, c]));
  return FEATURED_CITY_SLUGS.map((slug) => bySlug.get(slug)).filter((c): c is CityPage => !!c);
}

/** /cities index: featured seven, then the remaining cities in CITY_PAGES order. */
export function citiesInIndexOrder() {
  const featured = new Set<string>(FEATURED_CITY_SLUGS);
  return [...featuredCityPages(), ...CITY_PAGES.filter((c) => !featured.has(c.slug))];
}

const RELATED_CITY_SLUGS: Record<string, string[]> = {
  brussels: ['luxembourg', 'strasbourg'],
  luxembourg: ['brussels', 'strasbourg'],
  strasbourg: ['brussels', 'luxembourg'],
  amsterdam: ['the-hague'],
  'the-hague': ['amsterdam'],
  paris: ['brussels'],
  geneva: ['vienna', 'rome'],
  vienna: ['geneva', 'rome'],
  rome: ['geneva', 'vienna'],
};

/** Other city hubs: a short related lead-in, then every remaining city. */
export function relatedCityPages(slug: string) {
  const bySlug = new Map(CITY_PAGES.map((c) => [c.slug, c]));
  const lead = (RELATED_CITY_SLUGS[slug] || [])
    .map((s) => bySlug.get(s))
    .filter((c): c is CityPage => !!c && c.slug !== slug);
  const leadSlugs = new Set(lead.map((c) => c.slug));
  const rest = CITY_PAGES.filter((c) => c.slug !== slug && !leadSlugs.has(c.slug));
  return [...lead, ...rest];
}
export function cityCopy(city: CityPage): CityCopy {
  return (
    COPY[city.slug] || {
      title: `Policy & Public Affairs Jobs in ${city.name}`,
      description: `Policy, public affairs and international jobs in ${city.name}, ${city.country}, listed on EUJobs. Apply on the employer's own site.`,
      h1: `Policy and public affairs jobs in ${city.name}`,
      html: '',
    }
  );
}
export function cityJobs(city: CityPage, jobs: Listing[]) {
  return jobs.filter((j) => city.jobPattern.test(j.location || ''));
}
const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .toLowerCase()
    .trim()
    .replace(/,.*$/, '')
    .replace(/\s+\d.*$/, '')
    .replace(/^\d{2,5}[- ]?/, '')
    .trim();
const PRIORITY: [number, RegExp][] = [
  [0, /non-governmental/i],
  [1, /trade and business/i],
  [2, /think tank/i],
  [3, /consultanc/i],
];
const prio = (r: Resource) => {
  const c = r.fields['Registration category'] || '';
  return PRIORITY.find(([, rx]) => rx.test(c))?.[0] ?? 9;
};
/** Register organisations in a city: indexable profiles first, priority categories first. */
export function cityRegisterOrgs(city: CityPage, limit = 15) {
  const wanted = new Set(city.registerCities.map(fold));
  const all = resourceList('lobbyingEntities').filter(
    (r) => r.flags?.inRegister !== false && wanted.has(fold(r.fields['City'] || '')),
  );
  const ranked = all
    .filter((r) => r.flags?.indexable !== false)
    .sort((a, b) => prio(a) - prio(b) || a.name.localeCompare(b.name));
  return { total: all.length, top: ranked.slice(0, limit) };
}
