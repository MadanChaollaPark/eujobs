import CityLandingPage, { cityLandingMetadata } from '@/components/CityLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => cityLandingMetadata('milan');
export default function Page() {
  return <CityLandingPage slug="milan" />;
}
