import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('financial-services-policy-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="financial-services-policy-jobs-brussels" />;
}
