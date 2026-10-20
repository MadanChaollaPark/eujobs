import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('trade-association-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="trade-association-jobs-brussels" />;
}
