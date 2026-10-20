import CityLandingPage, { cityLandingMetadata } from '@/components/CityLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => cityLandingMetadata('paris');
export default function Page() {
  return <CityLandingPage slug="paris" />;
}
