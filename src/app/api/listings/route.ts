import { createListing, searchListings } from '@/lib/store';
import {
  errorResponse,
  json,
  protectMutation,
  rateLimit,
  readJson,
  requireUser,
  searchParams,
} from '../_shared';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    return json(searchListings(searchParams(request.url)));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const user = requireUser(request);
    rateLimit(`create:${user.id}`, 20, 60 * 60 * 1000);
    return json({ listing: createListing(user.id, await readJson(request)) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
