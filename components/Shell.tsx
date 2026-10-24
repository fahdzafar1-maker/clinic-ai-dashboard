'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { useClinic } from './ClinicProvider';
import { Icon, type IconName } from './Icon';
import { dayKey, formatDayLong } from '@/lib/time';

const SearchCtx = createContext('');
/** Lower-cased text from the top-bar search box. */
export const useSearch = () => useContext(SearchCtx);

/** Where demo visitors go to talk to sales (WhatsApp/Calendly link). */
export const BOOK_CALL_URL = process.env.NEXT_PUBLIC_BOOK_CALL_URL || '';

const PUBLIC_PAGES = ['/login', '/get-demo'];

export function Logo({ size = 40 }: { size?: number }) {
  const { config, preset } = useClinic();
  if (config.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={config.logoUrl} alt="" width={size} height={size} style={{ objectFit: 'contain' }} />;
  }
  return <span className="logo-icon"><Icon name={preset.icon} size={size} /></span>;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="login">
      <div className="card login-card notice-card">
        <Logo size={44} />
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const {
    mode, config, labels, settings, source, session, authReady, signOut, today, rows,
    clinics, clinic, selectClinic, isAdmin, demoState, href,
  } = useClinic();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  const isPublic = PUBLIC_PAGES.includes(pathname);
  const needsLogin = mode === 'app' && authReady && !session;

  useEffect(() => {
    if (needsLogin && !isPublic) router.replace('/login');
    if (mode === 'app' && session && pathname === '/login') router.replace('/');
  }, [needsLogin, isPublic, mode, session, pathname, router]);

  useEffect(() => { document.title = `${config.name} · AI Front Desk`; }, [config.name]);
  useEffect(() => setNavOpen(false), [pathname]);

  if (isPublic) return <>{children}</>;
  if (!authReady || needsLogin || demoState === 'loading') return <div className="splash"><Logo size={48} /></div>;

  if (demoState === 'missing') {
    return (
      <Notice title="This demo isn’t available">
        <p className="muted">Demo links stay open for 7 days. This one has expired, was mistyped, or the clinic has already moved on to a trial.</p>
        <Link href="/get-demo" className="btn btn-primary">Get your own free demo</Link>
      </Notice>
    );
  }
  if (mode === 'app' && source !== 'loading' && !clinic) {
    return (
      <Notice title="No clinic linked yet">
        <p className="muted">Your login works, but it isn’t connected to a clinic. Please contact your account manager.</p>
        <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
      </Notice>
    );
  }
  if (mode === 'app' && clinic && (clinic.status === 'expired' || clinic.status === 'paused') && !isAdmin) {
    return (
      <Notice title={clinic.status === 'expired' ? 'Your 7-day trial has ended' : 'This account is paused'}>
        <p className="muted">Thank you for trying the AI front desk for {clinic.name}. Your data is safe — continue with a plan to switch it back on.</p>
        {BOOK_CALL_URL && <a href={BOOK_CALL_URL} className="btn btn-primary" target="_blank" rel="noreferrer">Talk to us</a>}
        <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
      </Notice>
    );
  }

  const trialDaysLeft = clinic?.status === 'trial' && clinic.expires_at
    ? Math.max(0, Math.ceil((new Date(clinic.expires_at).getTime() - Date.now()) / 864e5))
    : null;
  const forwardedToday = rows.filter((r) => r.outcome === 'forwarded' && dayKey(r.created_at, config.timezone) === today).length;
  const nav: { href: string; label: string; icon: IconName; badge?: number; cls?: string }[] = [
    { href: '/', label: 'Dashboard', icon: 'home' },
    { href: '/calendar', label: 'Calendar', icon: 'calendar' },
    { href: '/ai-calls', label: 'AI Calls', icon: 'phoneCall', badge: forwardedToday || undefined },
    { href: '/whatsapp', label: 'WhatsApp', icon: 'whatsapp', cls: 'wa' },
    { href: '/reports', label: 'Reports', icon: 'barChart' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ];
  if (isAdmin && mode === 'app') nav.push({ href: '/leads', label: 'Leads & demos', icon: 'users' });

  return (
    <SearchCtx.Provider value={query.trim().toLowerCase()}>
      <header className="topbar">
        <div className="brand">
          <button className="menu-toggle" aria-label="Toggle navigation" onClick={() => setNavOpen((o) => !o)}>
            <Icon name="menu" />
          </button>
          <Logo />
          <div className="brand-text">
            <div className="brand-name">{config.name}</div>
            <div className="brand-tag">{config.tagline}</div>
          </div>
        </div>

        <label className="search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${labels.patients.toLowerCase()}, phone numbers, or ${labels.appointments.toLowerCase()}...`}
          />
        </label>

        <div className="topbar-right">
          {mode === 'app' && clinics.length > 1 && (
            <select className="select clinic-switch" value={clinic?.id ?? ''} onChange={(e) => selectClinic(e.target.value)} aria-label="Switch clinic">
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== 'active' ? ` (${c.status})` : ''}</option>)}
            </select>
          )}
          <Link href={href('/calendar')} className="date-picker" title="Today in clinic time">
            <Icon name="calendar" />
            <span>{formatDayLong(today)}</span>
            <Icon name="chevronDown" />
          </Link>
          {mode === 'demo' ? (
            BOOK_CALL_URL && <a href={BOOK_CALL_URL} target="_blank" rel="noreferrer" className="btn btn-primary">Get this for my clinic</a>
          ) : (
            <div className="profile">
              <span className="avatar avatar-lg">{(session?.user.email ?? 'FD').slice(0, 2).toUpperCase()}</span>
              <span className="profile-text">
                <span className="profile-name">{session?.user.email ?? 'Front Desk'}</span>
                <span className="profile-role">{isAdmin ? 'Agency admin' : mode === 'app' ? 'Signed in' : 'Offline demo'}</span>
              </span>
              {mode === 'app' && (
                <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
                  <Icon name="logout" />
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <nav className="nav">
          {nav.map((n) => {
            const target = href(n.href);
            return (
              <Link key={n.href} href={target} className={pathname === target ? 'active' : ''}>
                <span className={n.cls}><Icon name={n.icon} /></span>
                {n.label}
                {n.badge ? <span className="badge" title="Forwarded today">{n.badge}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div className="promo">
          <svg className="skyline" viewBox="0 0 200 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
            <g fill="currentColor">
              <rect x="0" y="92" width="14" height="28" /><rect x="16" y="80" width="10" height="40" />
              <rect x="28" y="86" width="12" height="34" /><rect x="42" y="70" width="9" height="50" />
              <rect x="53" y="88" width="14" height="32" /><rect x="69" y="76" width="10" height="44" />
              <rect x="81" y="84" width="12" height="36" /><rect x="95" y="64" width="8" height="56" />
              <polygon points="150,4 152,40 156,60 158,80 160,120 140,120 142,80 144,60 148,40" />
              <rect x="120" y="82" width="12" height="38" /><rect x="134" y="72" width="6" height="48" />
              <rect x="162" y="78" width="10" height="42" /><rect x="174" y="88" width="12" height="32" />
              <rect x="188" y="74" width="12" height="46" /><rect x="105" y="90" width="13" height="30" />
            </g>
          </svg>
          <span className="promo-logo"><Logo size={34} /></span>
          <div className="promo-title">{config.name}</div>
          <div className="promo-sub">{config.tagline}</div>
        </div>
      </aside>

      <main className="main">
        {mode === 'demo' && (
          <div className="banner banner-cta">
            <Icon name="sparkle" />
            <span><b>Live demo for {config.name}.</b> Everything here runs on sample data — this is how your AI front desk would look.</span>
            {BOOK_CALL_URL && <a href={BOOK_CALL_URL} target="_blank" rel="noreferrer" className="btn btn-primary">Start my 7-day free trial</a>}
          </div>
        )}
        {trialDaysLeft != null && (
          <div className="banner banner-sample">
            <Icon name="info" />
            <span><b>Free trial</b> – {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left.</span>
            {BOOK_CALL_URL && <a href={BOOK_CALL_URL} target="_blank" rel="noreferrer" className="link">Keep it running</a>}
          </div>
        )}
        {mode !== 'demo' && settings.demo_mode && (
          <div className="banner banner-demo">
            <Icon name="info" />
            <span><b>Demo mode</b> – data auto-deletes after {settings.retention_days} days</span>
            <Link href={href('/settings')} className="link">Change</Link>
          </div>
        )}
        {mode !== 'demo' && source === 'sample' && (
          <div className="banner banner-sample">
            <Icon name="pulse" />
            <span>
              {mode === 'app'
                ? 'No activity rows yet. Showing sample data until your n8n workflows send the first row.'
                : 'Supabase isn’t connected, so this is sample data. Add your keys to .env.local to go live.'}
            </span>
          </div>
        )}
        {source === 'loading' ? <div className="loading">Loading activity…</div> : children}
      </main>
    </SearchCtx.Provider>
  );
}
