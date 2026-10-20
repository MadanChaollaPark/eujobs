import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('eu-traineeships-brussels');
export default function Page() {
  return <SeoLandingPage slug="eu-traineeships-brussels" />;
}
