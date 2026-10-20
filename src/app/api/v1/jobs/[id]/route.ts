import { detailResponse } from '@/lib/agents/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return detailResponse(request, 'job', (await context.params).id);
}
