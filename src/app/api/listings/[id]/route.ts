import { z } from 'zod';
import { transitionListing, updateListing } from '@/lib/store';
import {
  errorResponse,
  idSchema,
  json,
  protectMutation,
  rateLimit,
  readJson,
  requireUser,
} from '../../_shared';
export const runtime = 'nodejs';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    protectMutation(request);
    const user = requireUser(request);
    const id = idSchema.parse((await context.params).id);
    rateLimit(`edit:${user.id}`, 120, 60 * 1000);
    const body = await readJson(request);
    const action = z.enum(['save', 'submit', 'approve', 'reject', 'close']).parse(body.action);
    const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).parse(body.version);
    const { action: _, version: __, ...input } = body;
    const listing =
      action === 'save'
        ? updateListing(id, user.id, user.role, version, input)
        : transitionListing(
            id,
            user.id,
            user.role,
            version,
            action,
            body.reason === undefined
              ? undefined
              : z.string().trim().min(1).max(2000).parse(body.reason),
          );
    return json({ listing });
  } catch (error) {
    return errorResponse(error);
  }
}
