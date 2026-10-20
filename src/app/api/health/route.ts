import { getDb } from '@/lib/store';
import { json } from '../_shared';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    getDb().prepare('SELECT 1 AS ready').get();
    return json({ ok: true, database: 'ready', service: 'eujobs' });
  } catch {
    return json({ ok: false, database: 'unavailable', service: 'eujobs' }, 503);
  }
}
