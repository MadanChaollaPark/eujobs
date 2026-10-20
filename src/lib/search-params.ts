import type { ListingKind, SearchFilters } from './types';
import { EMPLOYMENT_TYPES, EVENT_TYPES, SENIORITIES, TOPICS, WORK_MODES } from './types';
import { CATEGORIES } from './categories';
/** Drop unknown enum values from public URLs instead of failing the whole page. */
function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}
const SORTS = ['recent', 'salary', 'deadline', 'soonest'] as const;
export function parseSearchParams(
  params: Record<string, string | string[] | undefined>,
  kind: ListingKind,
): SearchFilters {
  const get = (k: string) => {
    const v = params[k];
    return typeof v === 'string' ? v : undefined;
  };
  return {
    kind,
    q: get('q'),
    location: get('location'),
    topic: oneOf(get('topic'), TOPICS),
    categorySlug: oneOf(
      get('categorySlug'),
      CATEGORIES.map((c) => c.slug),
    ),
    policyTag: get('policyTag'),
    workMode: oneOf(get('workMode'), WORK_MODES),
    employmentType: oneOf(get('employmentType'), EMPLOYMENT_TYPES),
    seniority: oneOf(get('seniority'), SENIORITIES),
    eventType: oneOf(get('eventType'), EVENT_TYPES),
    salaryOnly: get('salaryOnly') === 'true',
    from: get('from'),
    to: get('to'),
    sort: oneOf(get('sort'), SORTS),
    page: Math.max(1, Number(get('page')) || 1),
    pageSize: 8,
  };
}
