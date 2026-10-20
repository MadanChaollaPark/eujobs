import { redirect } from 'next/navigation';
export default async function LegacyAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; returnTo?: string; next?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  const destination = params.returnTo || params.next;
  if (destination?.startsWith('/') && !destination.startsWith('//'))
    query.set('returnTo', destination);
  redirect(
    `/auth/${params.mode === 'register' ? 'register' : 'login'}${query.size ? `?${query}` : ''}`,
  );
}
