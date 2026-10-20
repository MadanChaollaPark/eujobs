import { pageMetadata } from '@/lib/page-metadata';
import ContactForm from '@/components/ContactForm';
export const metadata = pageMetadata(
  'Get in touch',
  'Contact EUJobs with questions about listings, events, payments or support.',
  '/contact',
);
export default function ContactPage() {
  return (
    <div className="container flow-page">
      <div className="contact-layout">
        <div>
          <p className="eyebrow">LET’S TALK</p>
          <h1 className="page-title">
            A good connection
            <br />
            starts here.
          </h1>
          <p className="flow-intro">
            A question about a listing, an idea for an event, or something we could do better? We’re
            listening.
          </p>
          <div className="contact-note">
            <h3>Something needs a second look?</h3>
            <p className="muted">
              Include the listing link and what you noticed so the team can review the right
              opportunity.
            </p>
          </div>
        </div>
        <ContactForm />
      </div>
    </div>
  );
}
