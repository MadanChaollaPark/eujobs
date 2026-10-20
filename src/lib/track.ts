type TrackData = Record<string, string | number | boolean>;
type Umami = { track: (name: string, data?: TrackData) => void };
export function track(name: string, data?: TrackData) {
  try {
    (window as unknown as { umami?: Umami }).umami?.track(name, data);
  } catch {}
}

/** Page-load events: Umami's script is afterInteractive, so wait briefly before giving up. */
export function trackWhenReady(name: string, data?: TrackData) {
  if (typeof window === 'undefined') return () => {};
  const ready = () => !!(window as unknown as { umami?: unknown }).umami;
  const send = () => track(name, data);
  if (ready()) {
    send();
    return () => {};
  }
  let tries = 0;
  const timer = window.setInterval(() => {
    if (ready() || ++tries > 20) {
      window.clearInterval(timer);
      send();
    }
  }, 250);
  return () => window.clearInterval(timer);
}
