import { pageMetadata } from '@/lib/page-metadata';
import { featuredCityPages } from '@/lib/city-pages';
import Link from 'next/link';
import LaunchBanner from '@/components/LaunchBanner';
import NewsletterSignup from '@/components/NewsletterSignup';
import { Suspense } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  Compass,
  Check,
  Globe2,
} from 'lucide-react';
import { searchListings, getStats, getFacets } from '@/lib/store';
import { JobCard, EventCard } from '@/components/ListingCard';
import DiscoverySearch from '@/components/DiscoverySearch';
import BrusselsIllustration from '@/components/BrusselsIllustration';
const homeTitle = 'EUJobs — EU jobs in Brussels and Europe';
const homeMeta = pageMetadata(
  'EU jobs in Brussels and Europe',
  'Discover jobs in EU affairs and the events bringing Europe together. Clear information, useful filters and your next opportunity.',
  '/',
);
export const metadata = {
  ...homeMeta,
  title: { absolute: homeTitle },
  openGraph: { ...homeMeta.openGraph, title: homeTitle },
  twitter: { ...homeMeta.twitter, title: homeTitle },
};
export default function Home() {
  const stats = getStats();
  const jobs = searchListings({ kind: 'job', pageSize: 5, sort: 'recent' });
  const events = searchListings({ kind: 'event', pageSize: 3, sort: 'soonest' });
  return (
    <>
      <div className="container">
        <LaunchBanner />
      </div>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-spark">✳</span> A NEXT CHAPTER, WITH PURPOSE
            </p>
            <h1>
              Good work.
              <br />
              <span>Great connections.</span>
            </h1>
            <p className="hero-city-line">
              EU affairs jobs in Brussels, plus Luxembourg, Strasbourg, Geneva, The Hague, Paris and
              Vienna.
            </p>
            <nav className="city-strip" aria-label="Jobs by city">
              {featuredCityPages().map((city) => (
                <Link key={city.slug} href={`/${city.slug}`}>
                  {city.name}
                </Link>
              ))}
              <Link href="/cities">All cities</Link>
            </nav>
            <p className="hero-description">
              Discover meaningful careers and the conversations
              <br className="desktop-only" /> shaping Europe. Your next opportunity starts here.
            </p>
            <Suspense fallback={<div className="search-skeleton" />}>
              <DiscoverySearch home locations={getFacets().locations} />
            </Suspense>
            <div className="popular-searches">
              <span>Popular searches</span>
              {['Policy officer', 'Climate', 'Traineeship'].map((q) => (
                <Link href={`/jobs?q=${encodeURIComponent(q)}`} key={q}>
                  {q}
                  <ArrowUpRight size={11} />
                </Link>
              ))}
            </div>
          </div>
          <BrusselsIllustration />
        </div>
      </section>
      <section className="discovery-facts">
        <div className="container facts-inner">
          <span>
            <strong>{stats.jobs}</strong> open roles
          </span>
          <i />
          <span>
            <strong>{stats.events}</strong> upcoming events
          </span>
          <i />
          <span>
            <strong>{stats.organizations}</strong> organizations
          </span>
          <span className="facts-last">
            <Globe2 size={16} /> Brussels, Europe & beyond
          </span>
        </div>
      </section>
      <section className="container home-discovery">
        <div className="home-jobs">
          <div className="section-heading">
            <div>
              <p className="eyebrow">MAKE YOUR NEXT MOVE</p>
              <h2>Work that matters.</h2>
            </div>
            <Link className="text-link" href="/jobs">
              All jobs <ArrowRight size={16} />
            </Link>
          </div>
          <div className="topic-links">
            {[
              ['All opportunities', ''],
              ['EU policy', 'EU policy'],
              ['Climate & energy', 'Climate & energy'],
              ['Digital & tech', 'Digital & technology'],
            ].map(([label, topic]) => (
              <Link
                className={topic ? '' : 'selected'}
                href={`/jobs${topic ? '?topic=' + encodeURIComponent(topic) : ''}`}
                key={label}
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="job-list">
            {jobs.items.map((l) => (
              <JobCard key={l.id} listing={l} />
            ))}
            {jobs.total === 0 && (
              <div className="empty-state">
                <h3>A new chapter is on its way.</h3>
                <p>There are no published jobs yet. Create an alert to hear about new roles.</p>
                <Link className="text-link" href="/alerts">
                  Create a job alert →
                </Link>
              </div>
            )}
          </div>
          <Link className="all-listings-link" href="/jobs">
            Find your next role <ArrowRight size={17} />
          </Link>
        </div>
        <aside className="home-sidebar">
          <div className="section-heading">
            <div>
              <p className="eyebrow">BE PART OF THE CONVERSATION</p>
              <h2>On the agenda.</h2>
            </div>
            <CalendarDays size={23} />
          </div>
          <div className="sidebar-events">
            {events.items.map((l) => (
              <EventCard key={l.id} listing={l} compact />
            ))}
            {events.total === 0 && <p>No upcoming events are published yet.</p>}
            <Link className="text-link" href="/events">
              Explore all events <ArrowRight size={16} />
            </Link>
          </div>
          <div className="save-promo">
            <div className="promo-icon">
              <Bookmark size={22} />
            </div>
            <h3>
              A shortlist.
              <br />A little more direction.
            </h3>
            <p>
              Keep promising roles and events together. Save a search and see new matches whenever
              you return.
            </p>
            <Link className="button button-lime" href="/auth/register">
              Make it yours <ArrowUpRight size={16} />
            </Link>
            <span>Free to explore. Free to save.</span>
          </div>
        </aside>
      </section>
      <section className="principles-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LESS NOISE. MORE POSSIBILITY.</p>
              <h2>A better starting point.</h2>
            </div>
            <Link className="text-link" href="/about">
              Our approach <ArrowRight size={16} />
            </Link>
          </div>
          <div className="principles-grid">
            <div>
              <Compass />
              <h3>Your interests come first</h3>
              <p>
                Filter by policy area, work style, location and salary. Find what fits your next
                chapter.
              </p>
            </div>
            <div>
              <Check />
              <h3>Clarity over guesswork</h3>
              <p>
                Known salaries, explicit sources, honest unknowns. Clear information to help you
                decide where to go next.
              </p>
            </div>
            <div>
              <CalendarDays />
              <h3>A career and a community</h3>
              <p>
                Find the role, join the conversation, meet your people. Jobs and events, together.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="container employer-banner">
        <div>
          <p className="eyebrow">REACH THE EUROPEAN COMMUNITY</p>
          <h2>Looking for the right people?</h2>
          <p>Share your next role or bring people together at your event.</p>
        </div>
        <Link href="/submit?plan=basic" className="button">
          Post a listing <ArrowUpRight size={17} />
        </Link>
      </section>
      <div className="container" style={{ marginBottom: 32 }}>
        <NewsletterSignup source="home" />
      </div>
    </>
  );
}
