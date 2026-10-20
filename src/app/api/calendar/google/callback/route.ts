import { NextResponse } from 'next/server';
import { completeGoogleCalendarConnection, GOOGLE_STATE_COOKIE } from '@/lib/google-calendar';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const url = new URL(request.url),
    prefix = `${GOOGLE_STATE_COOKIE}=`;
  const browser =
    (request.headers.get('cookie') || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) || null;
  const origin = process.env.APP_ORIGIN || new URL(request.url).origin;
  let path = '/events?google=error#monthly-calendar';
  try {
    const result = await completeGoogleCalendarConnection(
      url.searchParams.get('state'),
      browser,
      url.searchParams.get('code'),
    );
    path = `/calendar-purchases/${encodeURIComponent(result.purchaseId)}?google=${result.connected ? 'connected' : 'error'}`;
  } catch {
    /* Return a generic message, never provider errors or credentials. */
  }
  const response = NextResponse.redirect(new URL(path, origin), 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  // Cookie deletion also works when the integration has been disabled during consent.
  response.cookies.set(GOOGLE_STATE_COOKIE, '', {
    httpOnly: true,
    secure: origin.startsWith('https:'),
    sameSite: 'lax',
    path: '/api/calendar/google/callback',
    maxAge: 0,
  });
  return response;
}
