import { pageMetadata } from '@/lib/page-metadata';
import AlertForm from '@/components/AlertForm';
import { emailAvailable } from '@/lib/email';
import { citySlugForLocation } from '@/lib/city-pages';
export const metadata = pageMetadata(
  'Free job alerts',
  'Create a confirmed email subscription for new jobs matching your interests.',
  '/alerts',
);
export const dynamic = 'force-dynamic';
export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams,
    initial: Record<string, string> = {};
  for (const key of [
    'q',
    'location',
    'topic',
    'workMode',
    'employmentType',
    'seniority',
    'organizationId',
    'categorySlug',
    'frequency',
    'kind',
  ])
    if (typeof values[key] === 'string') initial[key] = values[key];
  return (
    <div className="container flow-page" style={{ maxWidth: 820 }}>
      <AlertForm
        available={emailAvailable()}
        initial={initial}
        city={citySlugForLocation(initial.location)}
      />
    </div>
  );
}
