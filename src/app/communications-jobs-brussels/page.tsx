import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('communications-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="communications-jobs-brussels" />;
}
