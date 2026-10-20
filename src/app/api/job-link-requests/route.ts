import { jobLinkSchema, saveJobLinkRequest } from '@/lib/job-link-requests';
import { clientKey, errorResponse, json, protectMutation, rateLimit, readJson } from '../_shared';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    protectMutation(request);
    rateLimit(`job-link:client:${clientKey(request)}`, 10, 60 * 60 * 1000);
    const input = jobLinkSchema.parse(await readJson(request, 8 * 1024));
    rateLimit(`job-link:email:${input.email}`, 5, 60 * 60 * 1000);
    const { reference } = saveJobLinkRequest(input);
    return json({ message: 'Thanks. We will prepare your listing and email you.', reference }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
