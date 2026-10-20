/**
 * Static niche landing definitions so footer SEO pages work even when
 * the MongoDB `niches` collection has not been seeded yet.
 * Seed script (scripts/seed-footer-niches.js) remains the source of truth
 * for production; these are a resilient fallback.
 */

export type StaticNiche = {
  slug: string;
  name: string;
  description: string;
  h1: string;
  tagline: string;
  competitor?: string;
  keywords: string[];
  colors: { primary: string; accent: string };
  filters: {
    cities?: string[];
    countries?: string[];
    companyPatterns?: string[];
    seniority?: string[];
    titleKeywords?: string[];
  };
  faqs: { question: string; answer: string }[];
  enabled: boolean;
};

export const STATIC_NICHES: StaticNiche[] = [
  {
    slug: 'jobs-in-brussels',
    name: 'Jobs in Brussels',
    h1: 'Jobs in Brussels — EU Affairs, Policy & International Careers',
    tagline: 'Browse policy, advocacy, institutional and international jobs in Brussels.',
    description:
      "Brussels is the political capital of Europe and one of the continent's most international job markets. Browse EU institutions, NGOs, think tanks, trade associations and public affairs roles on EUJobs.co.",
    competitor: 'jobsin.brussels',
    keywords: [
      'jobs in Brussels',
      'EU jobs Brussels',
      'policy jobs Brussels',
      'Brussels jobs for English speakers',
    ],
    colors: { primary: 'blue', accent: 'indigo' },
    filters: { cities: ['Brussels', 'Bruxelles'], countries: ['Belgium'] },
    faqs: [
      {
        question: 'Do I need to speak French to work in Brussels?',
        answer:
          'Not for most EU-affairs jobs. English is the working language of the EU institutions, consultancies, trade associations and NGOs. French helps for daily life and some Belgian employers.',
      },
      {
        question: 'How do I get a job at the EU institutions in Brussels?',
        answer:
          'Permanent posts go through EPSO competitions. Faster routes include contract agent (CAST), temporary agent vacancies, and traineeships such as the Commission Blue Book and Parliament Schuman programmes.',
      },
    ],
    // Hub is /brussels. next.config 301s /jobs-in-brussels; do not also serve this niche.
    enabled: false,
  },
  {
    slug: 'public-affairs-jobs-brussels',
    name: 'Public Affairs Jobs in Brussels',
    h1: 'Public Affairs Jobs in Brussels — Government Relations & Advocacy',
    tagline:
      'From junior consultant to head of EU affairs: public affairs and lobbying careers in the EU capital.',
    description:
      'Public affairs, government relations, advocacy and lobbying jobs in Brussels — consultancies, trade associations, corporate EU affairs offices and NGOs.',
    competitor: 'eurobrussels.com',
    keywords: ['public affairs jobs Brussels', 'lobbying jobs Brussels', 'EU affairs manager'],
    colors: { primary: 'blue', accent: 'indigo' },
    filters: {
      titleKeywords: [
        'public affairs',
        'government affairs',
        'government relations',
        'advocacy',
        'lobby',
      ],
    },
    faqs: [
      {
        question: 'What is the difference between public affairs and lobbying?',
        answer:
          'Lobbying is direct engagement with policymakers. Public affairs is broader: policy monitoring, position papers, coalitions and strategic communications. In Brussels the terms often overlap.',
      },
    ],
    enabled: true,
  },
  {
    slug: 'eu-agencies-jobs',
    name: 'EU Agencies Jobs',
    h1: 'EU Agencies Jobs — Careers Across Europe',
    tagline:
      'Contract agent, temporary agent and official roles at EU agencies from EFSA to ECHA, EMA and beyond.',
    description:
      'Browse vacancies at EU decentralised agencies and joint undertakings. Roles span science, regulation, IT, admin and communications across Member State cities.',
    keywords: ['EU agencies jobs', 'EFSA jobs', 'EMA jobs', 'ECHA careers'],
    colors: { primary: 'blue', accent: 'indigo' },
    filters: {
      companyPatterns: [
        'Agency',
        'EFSA',
        'EMA',
        'ECHA',
        'EEA',
        'EASA',
        'EBA',
        'ESMA',
        'EIOPA',
        'ENISA',
        'Frontex',
        'EUIPO',
      ],
    },
    faqs: [],
    enabled: true,
  },
  {
    slug: 'ngo-jobs',
    name: 'NGO Jobs in Brussels',
    h1: 'NGO Jobs in Brussels — Civil Society & Advocacy Careers',
    tagline:
      'Policy, campaigns, programmes and fundraising roles at European NGOs and civil society organisations.',
    description:
      'Find NGO and civil society jobs in Brussels and across Europe — advocacy officers, programme managers, communications and fundraising.',
    keywords: ['NGO jobs Brussels', 'civil society jobs Europe', 'advocacy officer'],
    colors: { primary: 'blue', accent: 'indigo' },
    filters: {
      companyPatterns: [
        'NGO',
        'Foundation',
        'Forum',
        'Alliance',
        'Coalition',
        'Amnesty',
        'WWF',
        'Greenpeace',
        'Oxfam',
      ],
      titleKeywords: ['advocacy', 'campaign', 'programme', 'civil society'],
    },
    faqs: [],
    enabled: true,
  },
  {
    slug: 'climate-jobs',
    name: 'Climate & Environment Jobs',
    h1: 'Climate & Environment Jobs — EU Green Deal Careers',
    tagline: 'Policy, advocacy and technical roles on climate, energy and the European Green Deal.',
    description:
      'Climate, environment and energy jobs in the EU bubble — Green Deal policy, sustainability advocacy and environmental regulation.',
    keywords: ['climate jobs Brussels', 'Green Deal jobs', 'environment policy EU'],
    colors: { primary: 'green', accent: 'emerald' },
    filters: {
      titleKeywords: [
        'climate',
        'environment',
        'sustainability',
        'energy',
        'green deal',
        'biodiversity',
      ],
    },
    faqs: [],
    enabled: true,
  },
  {
    slug: 'eu-policy',
    name: 'EU Policy Jobs',
    h1: 'EU Policy Jobs — Officers, Advisers & Analysts',
    tagline:
      'Policy officer and EU affairs roles across institutions, associations and consultancies.',
    description:
      'EU policy officer, adviser and analyst vacancies in Brussels and beyond — track legislation, draft positions and engage stakeholders.',
    keywords: ['EU policy jobs', 'policy officer Brussels', 'EU affairs jobs'],
    colors: { primary: 'blue', accent: 'indigo' },
    filters: {
      titleKeywords: ['policy', 'EU affairs', 'regulatory', 'legislation'],
    },
    faqs: [],
    enabled: true,
  },
  {
    slug: 'legal-jobs',
    name: 'Legal Jobs in EU Affairs',
    h1: 'Legal Jobs — EU Law, Competition & Regulatory',
    tagline: 'Legal counsel, competition and regulatory roles in Brussels and EU law firms.',
    description:
      'EU law, competition, regulatory affairs and legal counsel positions at institutions, law firms and in-house teams.',
    keywords: ['EU legal jobs', 'competition lawyer Brussels', 'regulatory counsel'],
    colors: { primary: 'blue', accent: 'indigo' },
    filters: {
      titleKeywords: ['legal', 'lawyer', 'counsel', 'competition', 'regulatory', 'compliance'],
    },
    faqs: [],
    enabled: true,
  },
  {
    slug: 'eu-finance-jobs',
    name: 'EU Finance & Economics Jobs',
    h1: 'Finance & Economics Jobs in the EU Bubble',
    tagline: 'Banking, financial services policy, economics and budget roles across Europe.',
    description:
      'Finance, banking policy, economics and budget roles at associations, institutions and consultancies in the EU sphere.',
    keywords: ['EU finance jobs', 'banking policy Brussels', 'economics jobs EU'],
    colors: { primary: 'blue', accent: 'indigo' },
    filters: {
      titleKeywords: ['finance', 'banking', 'economic', 'budget', 'taxation', 'monetary'],
    },
    faqs: [],
    enabled: true,
  },
  {
    slug: 'remote-europe',
    name: 'Remote EU Jobs',
    h1: 'Remote & Hybrid EU Affairs Jobs',
    tagline:
      'Work on European policy from anywhere — remote and hybrid roles across the EU bubble.',
    description:
      'Remote and hybrid EU affairs, policy and public affairs positions for professionals across Europe.',
    keywords: ['remote EU jobs', 'hybrid public affairs', 'work from home EU policy'],
    colors: { primary: 'blue', accent: 'indigo' },
    filters: {
      titleKeywords: ['remote', 'hybrid', 'work from home'],
    },
    faqs: [],
    enabled: true,
  },
  {
    slug: 'luxembourg',
    name: 'Jobs in Luxembourg',
    h1: 'EU & International Jobs in Luxembourg',
    tagline: 'Court of Justice, EIB, Commission services and international roles in Luxembourg.',
    description:
      'Jobs in Luxembourg linked to EU institutions, the European Investment Bank, financial services and international organisations.',
    keywords: ['jobs Luxembourg', 'EIB jobs', 'EU jobs Luxembourg'],
    colors: { primary: 'blue', accent: 'indigo' },
    filters: { cities: ['Luxembourg'], countries: ['Luxembourg'] },
    faqs: [],
    enabled: true,
  },
  {
    slug: 'geneva',
    name: 'Jobs in Geneva',
    h1: 'International & EU-Related Jobs in Geneva',
    tagline: 'UN, WTO, trade and international organisation careers in Geneva.',
    description:
      'International organisation and EU-related policy roles in Geneva — trade, humanitarian and multilateral careers.',
    keywords: ['jobs Geneva', 'UN jobs Geneva', 'WTO careers'],
    colors: { primary: 'blue', accent: 'indigo' },
    filters: { cities: ['Geneva'], countries: ['Switzerland'] },
    faqs: [],
    enabled: true,
  },
  {
    slug: 'london',
    name: 'Jobs in London',
    h1: 'EU Affairs & Public Policy Jobs in London',
    tagline: 'Public affairs, trade and policy roles in London with a European dimension.',
    description:
      'London-based public affairs, policy and trade roles that connect to the EU regulatory and political agenda.',
    keywords: ['public affairs London', 'EU affairs London', 'policy jobs London'],
    colors: { primary: 'blue', accent: 'indigo' },
    filters: { cities: ['London'], countries: ['United Kingdom', 'UK'] },
    faqs: [],
    enabled: true,
  },
  {
    slug: 'european-commission-jobs',
    name: 'European Commission Jobs',
    h1: 'European Commission Jobs & Traineeships',
    tagline:
      'Officials, contract agents, temporary agents and Blue Book traineeships at the European Commission.',
    description:
      'European Commission vacancies and related institutional roles — AD/AST grades, CAST, temporary agents and traineeships.',
    keywords: ['European Commission jobs', 'Blue Book traineeship', 'Commission careers'],
    colors: { primary: 'blue', accent: 'indigo' },
    filters: {
      companyPatterns: ['European Commission', 'Commission'],
      titleKeywords: ['Commission', 'Blue Book'],
    },
    faqs: [],
    enabled: true,
  },
];

export function getStaticNiche(slug: string): StaticNiche | null {
  return STATIC_NICHES.find((n) => n.slug === slug && n.enabled) || null;
}

export function getAllStaticNicheSlugs(): string[] {
  return STATIC_NICHES.filter((n) => n.enabled).map((n) => n.slug);
}
