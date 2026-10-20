import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('digital-policy-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="digital-policy-jobs-brussels" />;
}
