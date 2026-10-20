import {
  AgentError,
  type AgentBackend,
  type Kind,
  jobSearchSchema,
  eventSearchSchema,
  identifierSchema,
  searchResultSchema,
  detailResultSchema,
} from './contract';
export function createAgentClient(
  baseUrl = process.env.EUJOBS_BASE_URL || 'https://eujobs.co',
): AgentBackend {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new AgentError('INVALID_ARGUMENT', 'Use an absolute EUJobs base URL.');
  }
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== '/' ||
    (base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))
  )
    throw new AgentError(
      'INVALID_ARGUMENT',
      'Base URL must be an HTTPS origin, or HTTP localhost, without credentials or a path.',
    );
  async function request(path: string) {
    let response: Response;
    try {
      response = await fetch(new URL(path, base), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
    } catch {
      throw new AgentError(
        'NETWORK_ERROR',
        'Could not reach the EUJobs API within 10 seconds.',
        503,
      );
    }
    let text = '';
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 4 * 1024 * 1024) {
            await reader.cancel();
            throw new AgentError('INVALID_RESPONSE', 'EUJobs response exceeded 4 MiB.', 502);
          }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } catch (error) {
        if (error instanceof AgentError) throw error;
        throw new AgentError('NETWORK_ERROR', 'EUJobs response was interrupted.', 503);
      }
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new AgentError(
        'INVALID_RESPONSE',
        'Expected a version 1 JSON API response. Check that the agent API is deployed at this base URL.',
        502,
      );
    }
    if (!response.ok) {
      const body = data as { error?: { code?: unknown; message?: unknown } };
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new AgentError(
        typeof body?.error?.code === 'string' ? body.error.code : 'HTTP_ERROR',
        typeof body?.error?.message === 'string'
          ? body.error.message
          : `EUJobs returned HTTP ${response.status}`,
        response.status,
        retryAfter > 0 ? retryAfter : undefined,
      );
    }
    return data;
  }
  return {
    async search(kind: Kind, input: unknown) {
      const parsed = (kind === 'job' ? jobSearchSchema : eventSearchSchema).parse(input);
      const query = new URLSearchParams(
        Object.entries(parsed).map(([key, value]) => [key, String(value)]),
      );
      const result = searchResultSchema.safeParse(
        await request(`/api/v1/${kind === 'job' ? 'jobs' : 'events'}?${query}`),
      );
      if (!result.success)
        throw new AgentError(
          'INVALID_RESPONSE',
          'EUJobs returned an incompatible search response.',
          502,
        );
      return result.data;
    },
    async get(kind: Kind, id: string) {
      identifierSchema.parse(id);
      const result = detailResultSchema.safeParse(
        await request(`/api/v1/${kind === 'job' ? 'jobs' : 'events'}/${encodeURIComponent(id)}`),
      );
      if (!result.success)
        throw new AgentError(
          'INVALID_RESPONSE',
          'EUJobs returned an incompatible detail response.',
          502,
        );
      return result.data;
    },
  };
}
