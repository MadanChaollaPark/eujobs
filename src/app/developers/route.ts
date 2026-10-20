import { agentDocs } from '@/lib/agents/docs';
export function GET() {
  return new Response(agentDocs, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
