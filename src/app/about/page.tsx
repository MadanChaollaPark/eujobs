import { pageMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import { ArrowUpRight, Search, ShieldCheck, CalendarDays } from 'lucide-react';
export const metadata = pageMetadata(
  'Our approach',
  'Learn how EUJobs connects European careers, policy events and practical resources for your next opportunity.',
  '/about',
);
export default function About() {
  return (
    <div className="container about-page">
      <p className="eyebrow">OUR APPROACH</p>
      <h1>
        A smaller distance
        <br />
        between you and <em>what’s next.</em>
      </h1>
      <p className="about-lead">
        EUJobs brings European careers and community into one thoughtful space. Find meaningful
        work, discover useful events, and keep track of the opportunities that matter to you.
      </p>
      <div className="principles-grid">
        <div>
          <Search />
          <h3>Useful information</h3>
          <p>
            We keep salary, working hours, contract type, and work mode separate. Missing
            information stays unknown. Filters apply to the complete published inventory.
          </p>
        </div>
        <div>
          <ShieldCheck />
          <h3>A clear review process</h3>
          <p>
            Every submission starts as a private draft. A moderator reviews it before publication.
            Material edits return it to draft so changes receive a fresh review.
          </p>
        </div>
        <div>
          <CalendarDays />
          <h3>Beyond the job description</h3>
          <p>
            Conferences, workshops, and conversations bring people together. Save events alongside
            jobs and download calendar invitations in your own time zone.
          </p>
        </div>
      </div>
      <section className="about-detail">
        <h2>Careers, community and context</h2>
        <p>
          Browse European career opportunities, save listings and searches, follow job alerts, and
          discover events. Our resource collections bring career advice, organization profiles and
          the Brussels policy community into the same space.
        </p>
        <p>
          Employers can post a job without an account: enter the details or paste the job link,
          choose a plan, and manage the listing from a private link. Publication requires review.
          Event submissions are reviewed too, and published events can be downloaded as calendar
          invitations.
        </p>
        <p>
          We keep source dates visible where available. The restored career archive and organization
          directory provide useful context; check official sources for current recruitment and
          registration information. Contact us to suggest a correction or request help.
        </p>
        <Link className="button" href="/submit?plan=basic">
          Share an opportunity <ArrowUpRight size={16} />
        </Link>
      </section>
    </div>
  );
}
