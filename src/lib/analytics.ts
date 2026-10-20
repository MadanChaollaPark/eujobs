/** Cookieless, self-hosted Umami. Server-side events never include personal data. */
export function trackServerEvent(name: string, data: Record<string, string | number> = {}) {
  const website = process.env.UMAMI_WEBSITE_ID;
  const endpoint = process.env.UMAMI_COLLECT_URL || 'http://127.0.0.1:3300/api/send';
  if (!website) return;
  const origin = process.env.APP_ORIGIN || 'https://eujobs.co';
  void fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    },
    body: JSON.stringify({
      type: 'event',
      payload: { website, hostname: new URL(origin).hostname, url: '/server/payment', name, data },
    }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => undefined);
}
