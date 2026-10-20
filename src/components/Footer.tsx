import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from './Header';
import { featuredCityPages } from '@/lib/city-pages';
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div>
          <Brand />
          <p>
            Work with purpose.
            <br />
            Connect with Europe.
          </p>
        </div>
        <div>
          <h3>Discover</h3>
          <Link href="/jobs">Find a job</Link>
          <Link href="/events">Explore events</Link>
          <Link href="/alerts">Free job alerts</Link>
          <Link href="/companies">Companies</Link>
          <Link href="/categories">Job categories</Link>
          <Link href="/account">Saved opportunities</Link>
        </div>
        <div>
          <h3>Cities</h3>
          {featuredCityPages().map((city) => (
            <Link key={city.slug} href={`/${city.slug}`}>
              {city.name}
            </Link>
          ))}
          <Link href="/cities">All cities</Link>
        </div>
        <div>
          <h3>Make connections</h3>
          <Link href="/submit?kind=job&plan=basic">
            Post a job <ArrowUpRight size={12} />
          </Link>
          <Link href="/submit?kind=event">
            Share an event <ArrowUpRight size={12} />
          </Link>
          <Link href="/contact">Get in touch</Link>
          <Link href="/pricing">Plans & pricing</Link>
          <Link href="/alerts?kind=newsletter">Weekly newsletter</Link>
          <Link href="/help">Help & support</Link>
        </div>
        <div>
          <h3>European resources</h3>
          <Link href="/blog">Career advice</Link>
          <Link href="/career-guides">Career guides</Link>
          <Link href="/fairpay">Fair Pay calculator</Link>
          <Link href="/lobbying-entities">Lobbying organizations</Link>
          <Link href="/brussels-best">Brussels Best</Link>
          <Link href="/lobbying-events">Policy events</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} EUJobs. Built for the European community.</span>
        <span>
          <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·{' '}
          <Link href="/refund">Refunds</Link> · <Link href="/about">About</Link> ·{' '}
          <Link href="/feed.xml">RSS</Link>
        </span>
      </div>
    </footer>
  );
}
