import { StoreError } from '@/lib/store';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CATEGORIES } from '@/lib/categories';
import { getRequestUser } from '@/lib/auth';
import { EMPLOYMENT_TYPES, EVENT_TYPES, SENIORITIES, TOPICS, WORK_MODES } from '@/lib/types';
import type { SearchFilters, User } from '@/lib/types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof z.ZodError)
    return json(
      {
        error: error.issues
          .map((issue) => issue.message)
          .slice(0, 3)
          .join(' '),
      },
      400,
    );
  if (
    error instanceof Error &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    (error.status < 500 || (error instanceof StoreError && error.status === 503))
  ) {
    const response = json({ error: error.message }, error.status);
    if (error instanceof ApiError && error.retryAfter)
      response.headers.set('Retry-After', String(error.retryAfter));
    return response;
  }
  console.error('API operation failed:', error instanceof Error ? error.name : 'Unknown error');
  return json({ error: 'We could not complete this request. Please try again.' }, 500);
}

export function protectMutation(request: Request) {
  const origin = request.headers.get('origin');
  let allowedOrigin: string;
  try {
    if (process.env.APP_ORIGIN) {
      const configured = new URL(process.env.APP_ORIGIN);
      if (
        !['http:', 'https:'].includes(configured.protocol) ||
        configured.username ||
        configured.password
      )
        throw new Error('Invalid origin');
      allowedOrigin = configured.origin;
    } else {
      // Next may normalize request.url to localhost even when the browser uses
      // 127.0.0.1. The actual HTTP Host is authoritative for this direct server.
      // Proxy deployments should set APP_ORIGIN; never trust forwarded-host here.
      const host = request.headers.get('host');
      const protocol = new URL(request.url).protocol;
      if (
        !host ||
        host.length > 255 ||
        /[\s/\\@?#,%]/.test(host) ||
        !['http:', 'https:'].includes(protocol)
      )
        throw new Error('Invalid host');
      const canonical = new URL(`${protocol}//${host}`);
      if (
        !canonical.hostname ||
        canonical.username ||
        canonical.password ||
        canonical.pathname !== '/' ||
        canonical.search ||
        canonical.hash
      )
        throw new Error('Invalid host');
      allowedOrigin = canonical.origin;
    }
  } catch {
    throw new ApiError('Please submit this request from EUJobs.', 403);
  }
  if (
    !origin ||
    origin !== allowedOrigin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new ApiError('Please submit this request from EUJobs.', 403);
  }
}
export async function readJson(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || ''))
    throw new ApiError('Send a JSON request body.', 415);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new ApiError('This request is too large.', 413);
  if (!request.body) throw new ApiError('A request body is required.', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiError('This request is too large.', 413);
    }
    chunks.push(value);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid object');
    return value as Record<string, unknown>;
  } catch {
    throw new ApiError('Enter a valid JSON object.', 400);
  }
}
export function requireUser(request: Request): User {
  const user = getRequestUser(request);
  if (!user) throw new ApiError('Sign in to continue.', 401);
  return user;
}

const buckets = new Map<string, { used: number; resets: number }>();
const MAX_BUCKETS = 10_000;
export function rateLimit(key: string, maximum: number, windowMs: number) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resets <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [oldKey, value] of buckets) if (value.resets <= now) buckets.delete(oldKey);
      if (buckets.size >= MAX_BUCKETS)
        throw new ApiError('Too many requests. Please try again shortly.', 429, 60);
    }
    bucket = { used: 0, resets: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.used++;
  if (bucket.used > maximum)
    throw new ApiError(
      'Too many requests. Please try again later.',
      429,
      Math.ceil((bucket.resets - now) / 1000),
    );
}
export function clientKey(request: Request) {
  // Enable only behind a proxy that replaces, rather than trusts, incoming forwarding headers.
  if (process.env.TRUST_PROXY === '1')
    return (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0, 64);
  return 'shared-origin';
}

const optionalText = (max: number) => z.string().trim().max(max).optional();
export const searchSchema = z
  .object({
    kind: z.enum(['job', 'event']).optional(),
    q: optionalText(200),
    location: optionalText(100),
    topic: z.enum(TOPICS).optional(),
    categorySlug: z.enum(CATEGORIES.map((c) => c.slug)).optional(),
    policyTag: optionalText(60),
    workMode: z.enum(WORK_MODES).optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    seniority: z.enum(SENIORITIES).optional(),
    eventType: z.enum(EVENT_TYPES).optional(),
    salaryOnly: z.boolean().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    sort: z.enum(['recent', 'salary', 'deadline', 'soonest']).optional(),
    page: z.number().int().min(1).max(100_000).optional(),
    pageSize: z.number().int().min(1).max(50).optional(),
  })
  .strict()
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    'The end date must follow the start date.',
  );
export function searchParams(url: string): SearchFilters {
  const params = new URL(url).searchParams;
  const input: Record<string, unknown> = {};
  for (const [key, value] of params) {
    if (!value) continue;
    if (key === 'page' || key === 'pageSize') input[key] = Number(value);
    else if (key === 'salaryOnly') {
      if (!['true', 'false', '1', '0'].includes(value))
        throw new ApiError('Invalid salary filter.', 400);
      input[key] = value === 'true' || value === '1';
    } else input[key] = value;
  }
  return searchSchema.parse(input);
}
export const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid identifier.');
