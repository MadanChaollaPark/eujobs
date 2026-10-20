import { agentOpenApi } from '@/lib/agents/openapi';
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json(agentOpenApi(), { headers: { 'Cache-Control': 'public, max-age=300' } });
}
