'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
export default function CheckoutStatus({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState('checking');
  const [message, setMessage] = useState('Checking your payment securely with Stripe…');
  useEffect(() => {
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    async function check() {
      try {
        const response = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Payment could not be verified yet.');
        if (!active) return;
        if (body.order?.status === 'paid') {
          setState('paid');
          setMessage(
            body.listing?.status === 'pending'
              ? 'Payment confirmed. Your job is now awaiting editorial review. It will go online after approval; your 30 days begin then.'
              : 'Payment confirmed. Open your account to submit your latest draft for review.',
          );
        } else if (++tries < 8) {
          setMessage('Payment confirmation is still processing. We’ll check again in a moment.');
          timer = setTimeout(check, 2500);
        } else {
          setState('pending');
          setMessage(
            'Payment has not been confirmed yet. Check your account later or contact EUJobs with your checkout reference.',
          );
        }
      } catch (error) {
        if (active) {
          setState('pending');
          setMessage(
            error instanceof Error ? error.message : 'Payment verification is unavailable.',
          );
        }
      }
    }
    if (sessionId) void check();
    else {
      setState('pending');
      setMessage('No checkout reference was provided. You can review payments in your account.');
    }
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [sessionId]);
  return (
    <div className="flow-card">
      <h1 className="page-title">
        {state === 'paid' ? 'Payment received.' : 'Your payment status.'}
      </h1>
      <p role="status">{message}</p>
      <p className="field-help">
        Payment does not automatically publish a listing. Every job is reviewed first.
      </p>
      <div className="flow-actions">
        <Link href="/account" className="button">
          Open your account →
        </Link>
        <Link href="/contact" className="button secondary">
          Contact EUJobs
        </Link>
      </div>
    </div>
  );
}
