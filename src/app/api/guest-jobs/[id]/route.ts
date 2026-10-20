import { z } from 'zod';
import {
  authorizeGuest,
  guestCookieName,
  guestCookieOptions,
  requireGuest,
} from '@/lib/guest-posting';
import { listPayments } from '@/lib/billing';
import { transitionListing, updateListing } from '@/lib/store';
import {
  clientKey,
  errorResponse,
  idSchema,
  json,
  protectMutation,
  rateLimit,
  readJson,
} from '../../_shared';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
function privateData(access: ReturnType<typeof requireGuest>) {
  return {
    listing: access.listing,
    contactEmail: access.guest.contactEmail,
    payments: listPayments(access.guest.ownerId).filter(
      (order) => order.listingId === access.listing.id,
    ),
    expiresAt: access.guest.expiresAt,
  };
}
export async function GET(request: Request, context: Context) {
  try {
    rateLimit(`guest-read:${clientKey(request)}`, 120, 60000);
    const id = idSchema.parse((await context.params).id);
    const access = requireGuest(request, id);
    const response = json(privateData(access));
    // Refresh the browser's cookie after a verified payment extended the durable
    // grant. Reading a job never extends the grant itself.
    response.cookies.set(
      guestCookieName(id),
      access.token,
      guestCookieOptions(id, access.guest.expiresAt),
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    protectMutation(request);
    rateLimit(`guest-access:${clientKey(request)}`, 30, 60000);
    const id = idSchema.parse((await context.params).id);
    const body = z
      .object({ action: z.literal('access'), token: z.string().max(100) })
      .strict()
      .parse(await readJson(request));
    const access = authorizeGuest(id, body.token);
    const response = json(privateData(access));
    response.cookies.set(
      guestCookieName(id),
      body.token,
      guestCookieOptions(id, access.guest.expiresAt),
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    protectMutation(request);
    rateLimit(`guest-edit:${clientKey(request)}`, 120, 60000);
    const id = idSchema.parse((await context.params).id);
    const { guest } = requireGuest(request, id);
    const body = await readJson(request);
    const action = z.enum(['save', 'submit', 'close']).parse(body.action);
    const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).parse(body.version);
    const { action: _, version: __, ...fields } = body;
    if (action !== 'save') z.object({}).strict().parse(fields);
    const listing =
      action === 'save'
        ? updateListing(id, guest.ownerId, 'member', version, fields)
        : transitionListing(id, guest.ownerId, 'member', version, action);
    return json({ listing });
  } catch (error) {
    return errorResponse(error);
  }
}
