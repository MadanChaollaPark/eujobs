'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Bookmark, Menu, X, UserRound } from 'lucide-react';
import type { User } from '@/lib/types';
import ThemeToggle from './ThemeToggle';
const resources = [
  ['/companies', 'Companies'],
  ['/categories', 'Job categories'],
  ['/blog', 'Career advice'],
  ['/career-guides', 'Career guides'],
  ['/fairpay', 'Fair Pay calculator'],
  ['/lobbying-entities', 'Lobbying organizations'],
  ['/brussels-best', 'Brussels Best'],
  ['/pricing', 'Job posting prices'],
  ['/about', 'Our approach'],
  ['/help', 'Help'],
];
export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="EUJobs home">
      <span className="brand-symbol" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} style={{ transform: `rotate(${i * 45}deg) translateY(-10px)` }} />
        ))}
      </span>
      <span>
        eu<span className="brand-light">jobs</span>
        <span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export default function Header({ user }: { user: User | null }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const resourcesMenu = useRef<HTMLDetailsElement>(null);
  const isCurrent = (href: string) => path === href || path.startsWith(`${href}/`);
  useEffect(() => {
    setOpen(false);
    if (resourcesMenu.current) resourcesMenu.current.open = false;
  }, [path]);
  useEffect(() => {
    function dismiss(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (open) {
        setOpen(false);
        menuButton.current?.focus();
      } else if (resourcesMenu.current?.open) {
        resourcesMenu.current.open = false;
        resourcesMenu.current.querySelector('summary')?.focus();
      }
    }
    function dismissOutside(event: PointerEvent) {
      if (!header.current?.contains(event.target as Node)) setOpen(false);
      if (!resourcesMenu.current?.contains(event.target as Node) && resourcesMenu.current)
        resourcesMenu.current.open = false;
    }
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismissOutside);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', dismissOutside);
    };
  }, [open]);
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 900px)');
    function resize() {
      setOpen(false);
      if (resourcesMenu.current) resourcesMenu.current.open = false;
    }
    mobile.addEventListener('change', resize);
    return () => mobile.removeEventListener('change', resize);
  }, []);
  const links = [
    ['/jobs', 'Find a job'],
    ['/events', 'Events & community'],
    ['/alerts', 'Job alerts'],
  ];
  return (
    <>
      <header className="site-header" ref={header}>
        <div className="container header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Main navigation">
            {links.map(([href, label]) => (
              <Link
                className={isCurrent(href) ? 'active' : ''}
                aria-current={isCurrent(href) ? 'page' : undefined}
                href={href}
                key={href}
              >
                {label}
              </Link>
            ))}
            <details
              className="resources-menu"
              ref={resourcesMenu}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  event.currentTarget.open = false;
              }}
            >
              <summary>Resources</summary>
              <div>
                {resources.map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isCurrent(href) ? 'page' : undefined}
                    onClick={(event) =>
                      event.currentTarget.closest('details')?.removeAttribute('open')
                    }
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </details>
          </nav>
          <div className="header-actions">
            <ThemeToggle />
            <Link className="saved-nav" href="/account" aria-label="Your saved listings">
              <Bookmark size={18} />
              <span>Saved</span>
            </Link>
            <Link
              className="account-nav"
              href={user ? '/account' : '/auth'}
              aria-label={user ? 'Your account' : 'Sign in'}
            >
              <UserRound size={18} />
            </Link>
            <Link className="button button-small" href="/submit?kind=job&plan=basic">
              Post a job <ArrowUpRight size={15} />
            </Link>
          </div>
          <button
            type="button"
            ref={menuButton}
            className="mobile-menu icon-button"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">
            {links.map(([href, label]) => (
              <Link
                onClick={() => setOpen(false)}
                href={href}
                key={href}
                aria-current={isCurrent(href) ? 'page' : undefined}
              >
                {label}
              </Link>
            ))}
            {resources.map(([href, label]) => (
              <Link
                onClick={() => setOpen(false)}
                href={href}
                key={href}
                aria-current={isCurrent(href) ? 'page' : undefined}
              >
                {label}
              </Link>
            ))}
            <Link onClick={() => setOpen(false)} href={user ? '/account' : '/auth'}>
              {user ? 'My account' : 'Sign in & saved listings'}
            </Link>
            <Link onClick={() => setOpen(false)} href="/submit?kind=job&plan=basic">
              Post a job
            </Link>
          </nav>
        )}
      </header>
    </>
  );
}
