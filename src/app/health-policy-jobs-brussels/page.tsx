import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('health-policy-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="health-policy-jobs-brussels" />;
}
