import { z } from 'zod';
import { createSavedSearch, deleteSavedSearch, getSavedSearches } from '@/lib/store';
import {
  errorResponse,
  idSchema,
  json,
  protectMutation,
  rateLimit,
  readJson,
  requireUser,
  searchSchema,
} from '../_shared';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    return json({ searches: getSavedSearches(requireUser(request).id) });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const user = requireUser(request);
    rateLimit(`searches:${user.id}`, 30, 60 * 60 * 1000);
    const body = await readJson(request, 8192);
    const name = z.string().trim().min(2).max(100).parse(body.name);
    const filters = searchSchema.parse(body.filters);
    return json({ search: createSavedSearch(user.id, { name, filters }) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    protectMutation(request);
    const user = requireUser(request);
    deleteSavedSearch(user.id, idSchema.parse(new URL(request.url).searchParams.get('id')));
    return json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
