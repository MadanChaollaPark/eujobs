import { z } from 'zod';
import { EMPLOYMENT_TYPES, EVENT_TYPES, SENIORITIES, TOPICS, WORK_MODES } from '../types';
import { CATEGORIES } from '../categories';

const common = {
  q: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe('Literal keyword search across title, organization, summary and description.'),
  location: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('Exact location, e.g. Brussels. Remote work is a separate workMode filter.'),
  topic: z.enum(TOPICS).optional(),
  from: z.iso
    .date()
    .optional()
    .describe(
      'Inclusive start date, YYYY-MM-DD in Europe/Brussels. Job deadline or event overlap.',
    ),
  to: z.iso
    .date()
    .optional()
    .describe('Inclusive end date, YYYY-MM-DD in Europe/Brussels. Job deadline or event overlap.'),
  publishedAfter: z.iso
    .datetime({ offset: true })
    .optional()
    .describe('Publication timestamp lower bound, inclusive; ISO 8601 with offset.'),
  page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
};
const datesOrdered = (v: { from?: string; to?: string }) => !v.from || !v.to || v.from <= v.to;
export const jobSearchSchema = z
  .object({
    ...common,
    categorySlug: z.enum(CATEGORIES.map((c) => c.slug)).optional(),
    policyTag: z.string().trim().min(2).max(60).optional(),
    workMode: z.enum(WORK_MODES).optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    seniority: z.enum(SENIORITIES).optional(),
    salaryOnly: z
      .boolean()
      .optional()
      .describe('Require a disclosed numeric salary; false means no restriction.'),
    sort: z.enum(['recent', 'salary', 'deadline']).default('recent'),
  })
  .strict()
  .refine(datesOrdered, 'from must be on or before to');
export const eventSearchSchema = z
  .object({
    ...common,
    eventType: z.enum(EVENT_TYPES).optional(),
    sort: z.enum(['recent', 'soonest']).default('soonest'),
  })
  .strict()
  .refine(datesOrdered, 'from must be on or before to');
export const identifierSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/)
  .describe('Stable listing ID returned by search; not a URL or slug.');
export const getSchema = z.object({ id: identifierSchema }).strict();
const nullableText = z.string().nullable();
const nullableNumber = z.number().nullable();
export const listingSchema = z.object({
  id: z.string(),
  kind: z.enum(['job', 'event']),
  title: z.string(),
  organization: z.string(),
  location: z.string(),
  country: z.string(),
  topic: z.string(),
  summary: z.string(),
  canonicalUrl: z.string().url(),
  publishedAt: nullableText,
  updatedAt: z.string(),
  sourceUrl: nullableText,
  sourceCheckedAt: nullableText,
  deadline: nullableText,
  timezone: z.string(),
  employmentType: nullableText,
  seniority: nullableText,
  workMode: nullableText,
  salary: z.object({
    min: nullableNumber,
    max: nullableNumber,
    currency: nullableText,
    period: z.enum(['year', 'month']).nullable(),
    display: nullableText,
  }),
  startsAt: nullableText,
  endsAt: nullableText,
  eventType: nullableText,
  dateOnly: z.boolean(),
  application: z.object({
    url: nullableText,
    method: nullableText,
    aiApplicationsBlocked: z.boolean().nullable(),
  }),
});
export const detailSchema = listingSchema.extend({
  description: z.string(),
  applicationInstructions: nullableText,
  venue: nullableText,
  price: nullableNumber,
});
export const searchResultSchema = z.object({
  apiVersion: z.literal('1'),
  items: z.array(listingSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  pages: z.number().int(),
  nextPage: z.number().int().nullable(),
  retrievedAt: z.string(),
});
export const detailResultSchema = z.object({
  apiVersion: z.literal('1'),
  item: detailSchema,
  retrievedAt: z.string(),
});
export const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), retryAfter: z.number().optional() }),
});
export type SearchOutput = z.infer<typeof searchResultSchema>;
export type DetailOutput = z.infer<typeof detailResultSchema>;
export type SearchInput = z.input<typeof jobSearchSchema> | z.input<typeof eventSearchSchema>;
export type Kind = 'job' | 'event';
export interface AgentBackend {
  search(kind: Kind, input: unknown): SearchOutput | Promise<SearchOutput>;
  get(kind: Kind, id: string): DetailOutput | Promise<DetailOutput>;
}
export class AgentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function parseQuery(params: URLSearchParams, kind: Kind) {
  const input: Record<string, unknown> = Object.create(null);
  for (const [key, value] of params) {
    if (Object.hasOwn(input, key))
      throw new AgentError('INVALID_ARGUMENT', `Duplicate parameter: ${key}`);
    if (key === 'page' || key === 'pageSize') {
      if (!/^\d+$/.test(value))
        throw new AgentError('INVALID_ARGUMENT', `${key} must be a positive integer`);
      input[key] = Number(value);
    } else if (key === 'salaryOnly') {
      if (!['true', 'false'].includes(value))
        throw new AgentError('INVALID_ARGUMENT', 'salaryOnly must be true or false');
      input[key] = value === 'true';
    } else input[key] = value;
  }
  return (kind === 'job' ? jobSearchSchema : eventSearchSchema).parse(input);
}
export function publicError(error: unknown): AgentError {
  if (error instanceof AgentError) return error;
  if (error instanceof z.ZodError)
    return new AgentError(
      'INVALID_ARGUMENT',
      error.issues
        .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
        .slice(0, 3)
        .join('; '),
    );
  // Internal exception details never cross the public boundary.
  return new AgentError(
    'INTERNAL_ERROR',
    'EUJobs could not complete the request. Try again later.',
    500,
  );
}
