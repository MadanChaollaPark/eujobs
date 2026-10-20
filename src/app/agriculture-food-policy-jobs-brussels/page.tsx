import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('agriculture-food-policy-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="agriculture-food-policy-jobs-brussels" />;
}
