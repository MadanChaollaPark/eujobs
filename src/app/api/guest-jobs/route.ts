import { createGuestPosting, guestCookieName, guestCookieOptions } from '@/lib/guest-posting';
import { clientKey, errorResponse, json, protectMutation, rateLimit, readJson } from '../_shared';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    protectMutation(request);
    rateLimit(`guest-create:${clientKey(request)}`, 20, 3600000);
    const body = await readJson(request);
    const result = createGuestPosting(body);
    const response = json(result, result.replayed ? 200 : 201);
    response.cookies.set(
      guestCookieName(result.listing.id),
      body.requestToken as string,
      guestCookieOptions(result.listing.id, result.expiresAt),
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
