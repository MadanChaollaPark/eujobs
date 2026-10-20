import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('trade-policy-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="trade-policy-jobs-brussels" />;
}
