import { searchResponse } from '@/lib/agents/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return searchResponse(request, 'job');
}
