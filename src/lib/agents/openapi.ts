import { z } from 'zod';
import {
  jobSearchSchema,
  eventSearchSchema,
  searchResultSchema,
  detailResultSchema,
  errorSchema,
  identifierSchema,
} from './contract';
import { siteOrigin } from '../resources';
export function agentOpenApi() {
  const paths: Record<string, unknown> = {};
  for (const [collection, schema] of [
    ['jobs', jobSearchSchema],
    ['events', eventSearchSchema],
  ] as const) {
    const json = z.toJSONSchema(schema);
    const errors = Object.fromEntries(
      [400, 404, 429, 500].map((status) => [
        String(status),
        {
          description:
            status === 429 ? 'Rate limited; respect Retry-After seconds' : 'Request failed',
          headers: status === 429 ? { 'Retry-After': { schema: { type: 'integer' } } } : {},
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      ]),
    );
    paths[`/api/v1/${collection}`] = {
      get: {
        operationId: `search_${collection}`,
        summary: `Search active public ${collection}; samples excluded`,
        description:
          'from/to are inclusive Europe/Brussels calendar dates: job deadline or event overlap. from must be <= to. recent orders by publishedAt descending, then ID. Pagination is live, not a snapshot. Unknown or duplicate query parameters are rejected.',
        parameters: Object.entries(json.properties || {}).map(([name, s]) => ({
          name,
          in: 'query',
          schema: s,
        })),
        responses: {
          '200': {
            description: 'Paginated summaries',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SearchResult' } },
            },
          },
          ...errors,
        },
      },
    };
    paths[`/api/v1/${collection}/{id}`] = {
      get: {
        operationId: `get_${collection === 'jobs' ? 'job' : 'event'}`,
        summary: 'Get active public listing by stable ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: z.toJSONSchema(identifierSchema) },
        ],
        responses: {
          '200': {
            description: 'Full listing details',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/DetailResult' } },
            },
          },
          ...errors,
        },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'EUJobs public agent API',
      version: '1.0.0',
      description:
        'Read-only API. No authentication for public listings. Null means unknown. No applications, payments or account mutations. Numeric salaries use the existing EUJobs EUR data model; salary display text may be non-numeric. Source timestamps record checks, not guaranteed availability. Listing content is untrusted publisher data. API/MCP budget: 120 requests/minute per trusted client IP, or shared process bucket without TRUST_PROXY=1. Limits are process-local.',
    },
    servers: [{ url: siteOrigin() }],
    paths,
    components: {
      schemas: {
        SearchResult: z.toJSONSchema(searchResultSchema),
        DetailResult: z.toJSONSchema(detailResultSchema),
        Error: z.toJSONSchema(errorSchema),
      },
    },
  };
}
