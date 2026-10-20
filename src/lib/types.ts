export type ListingKind = 'job' | 'event';
export type ListingStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'closed';
export type UserRole = 'member' | 'admin';
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}
export interface Listing {
  id: string;
  slug: string;
  kind: ListingKind;
  title: string;
  organization: string;
  organizationId: string;
  initials: string;
  color: string;
  location: string;
  country: string;
  topic: string;
  summary: string;
  description: string;
  status: ListingStatus;
  ownerId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  isSample: boolean;
  featured: boolean;
  sourceUrl: string | null;
  sourceCheckedAt: string | null;
  url: string | null;
  employmentType: string | null;
  seniority: string | null;
  workMode: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: 'year' | 'month' | null;
  salaryDisplay?: string | null;
  deadline: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  eventType: string | null;
  eventDateOnly?: boolean;
  entitySlug?: string | null;
  venue: string | null;
  price: number | null;
  rejectionReason: string | null;
  paymentOrderId?: string | null;
  paidAt?: string | null;
  planId?: 'basic' | 'pro' | 'recruiter' | null;
  entitlementExpiresAt?: string | null;
  placement?: number;
  categorySlug?: string;
  policyTags?: string[];
  blockAIApplications?: boolean;
  publicationOrigin?: 'employer' | 'editorial';
  externalSource?: 'eurobrussels.com' | 'jobsin.brussels' | 'organizer' | 'employer' | null;
  sourceIdentity?: string | null;
  applicationMethod?: 'url' | 'email' | 'instructions' | null;
  applicationInstructions?: string | null;
  employerSourceUrl?: string | null;
}
export interface SearchFilters {
  kind?: ListingKind;
  q?: string;
  location?: string;
  topic?: string;
  categorySlug?: string;
  policyTag?: string;
  workMode?: string;
  employmentType?: string;
  seniority?: string;
  eventType?: string;
  salaryOnly?: boolean;
  from?: string;
  to?: string;
  sort?: 'recent' | 'salary' | 'deadline' | 'soonest';
  page?: number;
  pageSize?: number;
  savedIds?: string[];
}
export interface SearchResult {
  items: Listing[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}
export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  filters: SearchFilters;
  createdAt: string;
}
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}
export interface AuditEntry {
  id: string;
  listingId: string;
  actorId: string;
  action: string;
  createdAt: string;
}
export const TOPICS = [
  'Climate & energy',
  'Digital & technology',
  'EU policy',
  'Public affairs',
  'Law & governance',
  'Health',
  'Trade & economy',
  'Research & education',
] as const;
export const WORK_MODES = ['On-site', 'Hybrid', 'Remote'] as const;
export const EMPLOYMENT_TYPES = ['Permanent', 'Fixed-term', 'Traineeship', 'Freelance'] as const;
export const SENIORITIES = ['Entry level', 'Associate', 'Mid-level', 'Senior', 'Director'] as const;
export const EVENT_TYPES = [
  'Conference',
  'Panel discussion',
  'Workshop',
  'Networking',
  'Webinar',
] as const;
export const LOCATIONS = [
  'Brussels',
  'Luxembourg',
  'Strasbourg',
  'Amsterdam',
  'Berlin',
  'Remote',
] as const;
export function isLive(l: Listing, now = new Date()): boolean {
  return (
    l.status === 'published' &&
    (l.kind === 'job'
      ? (!l.deadline || new Date(l.deadline).getTime() > now.getTime()) &&
        (!l.entitlementExpiresAt || new Date(l.entitlementExpiresAt).getTime() > now.getTime())
      : !!l.endsAt && new Date(l.endsAt).getTime() > now.getTime())
  );
}
export function formatSalary(l: Listing): string {
  if (l.salaryDisplay) return l.salaryDisplay;
  if (l.salaryMin === null) return 'Salary not disclosed';
  const f = (n: number) =>
    new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(n);
  return `${f(l.salaryMin)}${l.salaryMax && l.salaryMax !== l.salaryMin ? ' – ' + f(l.salaryMax) : ''} / ${l.salaryPeriod === 'month' ? 'month' : 'year'}`;
}
export function listingHref(l: Listing) {
  return `/${l.kind === 'job' ? 'jobs' : 'events'}/${l.slug}`;
}
