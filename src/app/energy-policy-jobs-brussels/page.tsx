import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('energy-policy-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="energy-policy-jobs-brussels" />;
}
