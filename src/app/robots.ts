import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  if (process.env.EUJOBS_SEED === '1') return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/account',
        '/admin',
        '/auth',
        '/api/',
        '/submit',
        '/manage-job',
        '/job-success',
        '/job-cancel',
        '/calendar-purchases',
        '/alerts/confirm',
        '/alerts/unsubscribe',
      ],
    },
    sitemap: `${(process.env.APP_ORIGIN || 'https://eujobs.co').replace(/\/$/, '')}/sitemap.xml`,
  };
}
