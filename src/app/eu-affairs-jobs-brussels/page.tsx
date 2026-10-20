import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('eu-affairs-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="eu-affairs-jobs-brussels" />;
}
