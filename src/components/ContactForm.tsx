'use client';
import { useState } from 'react';
import './flows.css';
export default function ContactForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const input = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Your message could not be saved.');
      setReference(data.reference);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Connection failed. Please try again.');
    } finally {
      setPending(false);
    }
  }
  if (reference)
    return (
      <div className="flow-card contact-confirmation" role="status">
        <span className="pill">MESSAGE RECEIVED</span>
        <h2>Thanks for getting in touch.</h2>
        <p>Your message has been saved in the EUJobs team inbox.</p>
        <p className="muted">
          Reference: <code>{reference}</code>
        </p>
        <button className="button secondary" onClick={() => setReference('')}>
          Send another message
        </button>
      </div>
    );
  return (
    <form className="flow-card flow-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          Your name
          <input name="name" required minLength={2} maxLength={100} autoComplete="name" />
        </label>
        <label className="field">
          Email address
          <input name="email" type="email" required maxLength={254} autoComplete="email" />
        </label>
      </div>
      <label className="field">
        Subject
        <input
          name="subject"
          required
          minLength={3}
          maxLength={150}
          placeholder="How can we help?"
        />
      </label>
      <label className="field">
        Your message
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={5000}
          rows={7}
          placeholder="Tell us a little more…"
        />
      </label>
      {error && (
        <p className="flow-error" role="alert">
          {error}
        </p>
      )}
      <p className="field-help">
        Your message and contact details are stored for the EUJobs team to review.
      </p>
      <button className="button" disabled={pending}>
        {pending ? 'Saving your message…' : 'Send message'}
      </button>
    </form>
  );
}
