import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('think-tank-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="think-tank-jobs-brussels" />;
}
