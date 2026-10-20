import Link from 'next/link';
import '@/components/flows.css';
export const metadata = { title: 'Checkout paused', robots: { index: false, follow: false } };
export default function JobCancelPage() {
  return (
    <div className="container flow-page">
      <div className="submission-shell flow-card">
        <p className="eyebrow">YOUR DRAFT IS SAFE</p>
        <h1 className="page-title">Take your time.</h1>
        <p>
          You left checkout. Your job stays in your account, and you can resume payment from your
          submissions.
        </p>
        <p>
          If you completed payment in another tab, check your payment history before trying again.
        </p>
        <Link href="/account" className="button">
          Return to your account →
        </Link>
      </div>
    </div>
  );
}
