import type { NextConfig } from 'next';

/** Keep in step with CITY_PAGES slugs. Exact paths only — never /jobs/:slug. */
const CITY_SLUGS = [
  'brussels',
  'london',
  'berlin',
  'paris',
  'geneva',
  'luxembourg',
  'strasbourg',
  'the-hague',
  'vienna',
  'madrid',
  'rome',
  'warsaw',
  'copenhagen',
  'stockholm',
  'dublin',
  'lisbon',
  'prague',
  'budapest',
  'athens',
  'amsterdam',
  'milan',
] as const;

/**
 * Published job slugs that equal a city slug. data/eujobs.sqlite is not in this
 * workspace; checked against the production listings table on 2026-10-16: no collisions.
 * /jobs/brussels/[segment] does not serve the exact path /jobs/brussels.
 */
const JOB_SLUG_COLLISIONS = new Set<string>();

function cityRedirects(): { source: string; destination: string; statusCode: 301 }[] {
  return CITY_SLUGS.flatMap((slug) => {
    const destination = `/${slug}`;
    const rules: { source: string; destination: string; statusCode: 301 }[] = [
      { source: `/cities/${slug}`, destination, statusCode: 301 },
      { source: `/${slug}-jobs`, destination, statusCode: 301 },
      { source: `/jobs-in-${slug}`, destination, statusCode: 301 },
    ];
    if (!JOB_SLUG_COLLISIONS.has(slug))
      rules.push({ source: `/jobs/${slug}`, destination, statusCode: 301 });
    return rules;
  });
}

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async redirects() {
    return [
      { source: '/post-job', destination: '/submit?kind=job&plan=basic', permanent: true },
      { source: '/post-a-job', destination: '/submit?kind=job&plan=basic', statusCode: 301 },
      { source: '/post', destination: '/submit?kind=job&plan=basic', statusCode: 301 },
      { source: '/employer-dashboard', destination: '/account', permanent: true },
      { source: '/auth/forgot-password', destination: '/auth/recovery', permanent: true },
      ...cityRedirects(),
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
