import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createAgentMcp } from '@/lib/agents/mcp';
import { agentService } from '@/lib/agents/service';
import { agentRateLimit, agentErrorResponse } from '@/lib/agents/http';
import { AgentError } from '@/lib/agents/contract';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const url = new URL(process.env.APP_ORIGIN || request.url);
    if (!process.env.APP_ORIGIN && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new AgentError(
        'CONFIGURATION_ERROR',
        'APP_ORIGIN must be configured for remote MCP.',
        503,
      );
    if (
      request.headers.get('host') !== url.host ||
      (request.headers.has('origin') && request.headers.get('origin') !== url.origin)
    )
      throw new AgentError('FORBIDDEN', 'Untrusted request host or origin.', 403);
    agentRateLimit(request);
    const server = createAgentMcp(agentService);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 64 * 1024,
    });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } finally {
      await server.close();
    }
  } catch (error) {
    return agentErrorResponse(error);
  }
}
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
export function DELETE() {
  return GET();
}
