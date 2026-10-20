import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('policy-advocacy-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="policy-advocacy-jobs-brussels" />;
}
