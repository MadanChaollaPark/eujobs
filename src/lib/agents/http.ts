import { ApiError, clientKey, rateLimit } from '../../app/api/_shared';
import { AgentError, publicError, parseQuery, type Kind } from './contract';
import { agentService } from './service';
export function agentRateLimit(request: Request) {
  rateLimit(`agent:${clientKey(request)}`, 120, 60_000);
}
export function agentErrorResponse(error: unknown) {
  const e =
    error instanceof ApiError && error.status === 429
      ? new AgentError('RATE_LIMITED', error.message, 429, error.retryAfter)
      : publicError(error);
  return Response.json(
    {
      error: {
        code: e.code,
        message: e.message,
        ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}),
      },
    },
    {
      status: e.status,
      headers: {
        'Cache-Control': 'no-store',
        ...(e.retryAfter ? { 'Retry-After': String(e.retryAfter) } : {}),
      },
    },
  );
}
export async function searchResponse(request: Request, kind: Kind) {
  try {
    agentRateLimit(request);
    return Response.json(
      await agentService.search(kind, parseQuery(new URL(request.url).searchParams, kind)),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return agentErrorResponse(error);
  }
}
export async function detailResponse(request: Request, kind: Kind, id: string) {
  try {
    agentRateLimit(request);
    if (new URL(request.url).search)
      throw new AgentError('INVALID_ARGUMENT', 'Detail requests do not accept query parameters.');
    return Response.json(await agentService.get(kind, id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return agentErrorResponse(error);
  }
}
