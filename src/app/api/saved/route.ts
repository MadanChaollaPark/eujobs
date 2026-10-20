import { getSavedIds, toggleSaved } from '@/lib/store';
import {
  errorResponse,
  idSchema,
  json,
  protectMutation,
  rateLimit,
  readJson,
  requireUser,
} from '../_shared';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    return json({ ids: getSavedIds(requireUser(request).id) });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const user = requireUser(request);
    rateLimit(`saved:${user.id}`, 120, 60 * 1000);
    return json({
      saved: toggleSaved(user.id, idSchema.parse((await readJson(request, 4096)).listingId)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
