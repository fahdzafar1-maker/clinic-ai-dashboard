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

export function Logo({ size = 40 }: { size?: number }) {
  const { config, preset } = useClinic();
  if (config.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={config.logoUrl} alt="" width={size} height={size} style={{ objectFit: 'contain' }} />;
  }
  return <span className="logo-icon"><Icon name={preset.icon} size={size} /></span>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { config, labels, settings, source, online, session, authReady, signOut, today, rows } = useClinic();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  const isLogin = pathname === '/login';
  const needsLogin = online && authReady && !session;

  useEffect(() => {
    if (needsLogin && !isLogin) router.replace('/login');
    if (online && session && isLogin) router.replace('/');
  }, [needsLogin, isLogin, online, session, router]);

  useEffect(() => { document.title = `${config.name} · AI Front Desk`; }, [config.name]);
  useEffect(() => setNavOpen(false), [pathname]);

  if (isLogin) return <>{children}</>;
  if (!authReady || needsLogin) return <div className="splash"><Logo size={48} /></div>;

  const forwardedToday = rows.filter((r) => r.outcome === 'forwarded' && dayKey(r.created_at, config.timezone) === today).length;
  const nav: { href: string; label: string; icon: IconName; badge?: number; cls?: string }[] = [
    { href: '/', label: 'Dashboard', icon: 'home' },
    { href: '/calendar', label: 'Calendar', icon: 'calendar' },
    { href: '/ai-calls', label: 'AI Calls', icon: 'phoneCall', badge: forwardedToday || undefined },
    { href: '/whatsapp', label: 'WhatsApp', icon: 'whatsapp', cls: 'wa' },
    { href: '/reports', label: 'Reports', icon: 'barChart' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ];

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
          <Link href="/calendar" className="date-picker" title="Today in clinic time">
            <Icon name="calendar" />
            <span>{formatDayLong(today)}</span>
            <Icon name="chevronDown" />
          </Link>
          <div className="profile">
            <span className="avatar avatar-lg">{(session?.user.email ?? 'FD').slice(0, 2).toUpperCase()}</span>
            <span className="profile-text">
              <span className="profile-name">{session?.user.email ?? 'Front Desk'}</span>
              <span className="profile-role">{online ? 'Signed in' : 'Offline demo'}</span>
            </span>
            {online && (
              <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
                <Icon name="logout" />
              </button>
            )}
          </div>
        </div>
      </header>

      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <nav className="nav">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={pathname === n.href ? 'active' : ''}>
              <span className={n.cls}><Icon name={n.icon} /></span>
              {n.label}
              {n.badge ? <span className="badge" title="Forwarded today">{n.badge}</span> : null}
            </Link>
          ))}
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
        {settings.demo_mode && (
          <div className="banner banner-demo">
            <Icon name="info" />
            <span><b>Demo mode</b> – data auto-deletes after {settings.retention_days} days</span>
            <Link href="/settings" className="link">Change</Link>
          </div>
        )}
        {source === 'sample' && (
          <div className="banner banner-sample">
            <Icon name="pulse" />
            <span>
              {online
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
