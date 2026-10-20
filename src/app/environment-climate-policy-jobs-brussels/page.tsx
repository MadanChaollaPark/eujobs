import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('environment-climate-policy-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="environment-climate-policy-jobs-brussels" />;
}
