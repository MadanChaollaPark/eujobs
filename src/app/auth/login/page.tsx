import AuthForm from '@/components/AuthForm';
import { redirect } from 'next/navigation';
export const metadata = { title: 'Sign in' };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  if (params.returnTo === '/submit' || params.returnTo === '/submit?kind=job')
    redirect('/submit?kind=job&plan=basic');
  return (
    <div className="container auth-shell">
      <AuthForm mode="login" returnTo={params.returnTo} />
    </div>
  );
}
