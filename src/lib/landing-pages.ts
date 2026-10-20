import type { Listing } from './types';
export type LandingPage = {
  slug: string;
  title: string;
  h1: string;
  description: string;
  intro: string;
  match: (job: Listing) => boolean;
};
const has = (job: Listing, words: string[]) => {
  const title = job.title.toLowerCase();
  return words.some((w) => title.includes(w));
};
export const BRUSSELS_LANDING_PAGES: LandingPage[] = [
  {
    slug: 'public-affairs',
    title: 'Public affairs jobs in Brussels',
    h1: 'Public affairs jobs in Brussels',
    description:
      'Current public affairs, advocacy, lobbying and government relations jobs in Brussels at consultancies, associations, companies and NGOs.',
    intro:
      'Advocacy, government relations and public affairs roles in Brussels, from consultancies and in-house teams to associations and NGOs.',
    match: (j) =>
      j.categorySlug === 'public-affairs' ||
      has(j, [
        'public affairs',
        'advocacy',
        'government relations',
        'lobby',
        'eu affairs',
        'european affairs',
      ]),
  },
  {
    slug: 'eu-policy',
    title: 'EU policy jobs in Brussels',
    h1: 'EU policy jobs in Brussels',
    description:
      'Current EU policy jobs in Brussels: policy officers, advisers and analysts at EU institutions, agencies, think tanks and associations.',
    intro:
      'Policy officers, advisers and analysts working on EU legislation and policy at institutions, agencies, think tanks and associations in Brussels.',
    match: (j) =>
      ['eu-institutions', 'eu-agencies', 'think-tanks'].includes(j.categorySlug || '') ||
      has(j, ['policy', 'policies', 'regulatory', 'legislative']),
  },
  {
    slug: 'ngo',
    title: 'NGO jobs in Brussels',
    h1: 'NGO jobs in Brussels',
    description:
      'Current NGO and civil society jobs in Brussels: advocacy, campaigns, programmes, communications and operations roles.',
    intro:
      'Advocacy, campaigns, programmes, communications and operations roles at NGOs and civil society organisations in Brussels.',
    match: (j) => j.categorySlug === 'ngos',
  },
  {
    slug: 'internships',
    title: 'EU internships and traineeships in Brussels',
    h1: 'EU internships and traineeships in Brussels',
    description:
      'Current internships and traineeships in Brussels at EU institutions, NGOs, think tanks, associations and public affairs firms.',
    intro:
      'Paid and unpaid internships and traineeships in Brussels across the EU-affairs community. Check each notice for eligibility and allowances.',
    match: (j) =>
      j.employmentType === 'Traineeship' ||
      has(j, ['intern', 'trainee', 'traineeship', 'stagiaire', 'blue book']),
  },
  {
    slug: 'trade-associations',
    title: 'Trade association jobs in Brussels',
    h1: 'Trade association jobs in Brussels',
    description:
      'Current jobs at European trade and professional associations in Brussels: policy, advocacy, communications and membership roles.',
    intro:
      'Policy, advocacy, communications and membership roles at European trade and professional associations based in Brussels.',
    match: (j) => j.categorySlug === 'trade-associations',
  },
];
export function getBrusselsLanding(slug: string) {
  return BRUSSELS_LANDING_PAGES.find((p) => p.slug === slug) || null;
}
export function isBrussels(job: Listing) {
  return /brussel|bruxelles/i.test(`${job.location} ${job.country}`);
}
