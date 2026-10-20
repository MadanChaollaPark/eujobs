import { emailAvailable, emailQueueSummary } from '@/lib/email';
import { getDb } from '@/lib/store';
import { ApiError, errorResponse, json, requireUser } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    if (user.role !== 'admin') throw new ApiError('Administrator access required.', 403);
    const db = getDb();
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => String(r.name)),
    );
    const count = (table: string) =>
      tables.has(table)
        ? Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n || 0)
        : 0;
    return json({
      ok: true,
      release: process.env.RELEASE_SHA || 'development',
      database: 'ready',
      inventory: {
        jobs: Number(
          db.prepare("SELECT COUNT(*) AS n FROM listings WHERE kind='job'").get()?.n || 0,
        ),
        users: count('users'),
        contacts: count('contacts'),
      },
      providers: {
        stripe: {
          configured: !!process.env.STRIPE_SECRET_KEY,
          webhook: !!process.env.STRIPE_WEBHOOK_SECRET,
        },
        email: {
          configured: emailAvailable(),
          enabled: process.env.EMAIL_DELIVERY_ENABLED === '1',
          provider: process.env.EMAIL_PROVIDER || 'brevo',
          queue: emailQueueSummary(),
        },
      },
      ingestion: { automatic: false, note: 'Imports require an explicit operator command.' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
