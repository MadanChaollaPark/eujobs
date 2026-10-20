import { POST as alertsPost } from '../../alerts/route';
import { errorResponse, protectMutation, readJson } from '../../_shared';
export const runtime = 'nodejs';
/** Kept for the older newsletter form; it has the same explicit consent and confirmation flow. */
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const body = await readJson(request, 4096);
    return alertsPost(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({
          action: 'subscribe',
          email: body.email,
          consent: body.consent,
          frequency: 'weekly',
          kind: 'newsletter',
        }),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
