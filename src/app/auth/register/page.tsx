import AuthForm from '@/components/AuthForm';
export const metadata = { title: 'Create an account' };
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="container auth-shell">
      <AuthForm mode="register" returnTo={params.returnTo} />
    </div>
  );
}
