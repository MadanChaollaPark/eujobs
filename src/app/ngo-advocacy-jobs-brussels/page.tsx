import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('ngo-advocacy-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="ngo-advocacy-jobs-brussels" />;
}
