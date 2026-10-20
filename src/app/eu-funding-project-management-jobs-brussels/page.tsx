import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('eu-funding-project-management-jobs-brussels');
export default function Page() {
  return <SeoLandingPage slug="eu-funding-project-management-jobs-brussels" />;
}
