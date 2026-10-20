import CityLandingPage, { cityLandingMetadata } from '@/components/CityLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => cityLandingMetadata('luxembourg');
export default function Page() {
  return <CityLandingPage slug="luxembourg" />;
}
