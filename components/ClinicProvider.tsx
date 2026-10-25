'use client';

import type { Session } from '@supabase/supabase-js';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clinicConfig as defaults } from '@/clinic.config';
import { generateDemo, randomLiveRow } from '@/lib/demo';
import { PRESETS, type Preset } from '@/lib/presets';
import { supabase } from '@/lib/supabase';
import { dayKey } from '@/lib/time';
import type { Activity, AppSettings, ClinicConfig, ClinicRow, Labels } from '@/lib/types';

/**
 * offline = no Supabase keys (sample data, settings in the browser)
 * app     = signed-in clinic staff / agency admin, real data per clinic
 * demo    = public /demo/<slug> page for a lead, sample data with their branding
 */
export type Mode = 'offline' | 'app' | 'demo';
type Source = 'loading' | 'live' | 'sample';

interface ClinicContext {
  mode: Mode;
  config: ClinicConfig;
  preset: Preset;
  labels: Labels;
  settings: AppSettings;
  rows: Activity[];
  /** live = rows from Supabase; sample = generated demo data (offline, demo page, or no rows yet). */
  source: Source;
  newIds: Set<string>;
  now: Date;
  today: string;
  online: boolean;
  session: Session | null;
  authReady: boolean;
  signOut: () => Promise<void>;
  saveConfig: (c: ClinicConfig) => Promise<void>;
  saveSettings: (s: AppSettings) => Promise<void>;
  playingId: string | null;
  togglePlay: (row: Activity) => void;
  /** Clinics the signed-in user can see (all of them for agency admins). */
  clinics: ClinicRow[];
  clinic: ClinicRow | null;
  selectClinic: (id: string) => void;
  isAdmin: boolean;
  /** 'missing' when /demo/<slug> doesn't exist or is no longer a demo. */
  demoState: 'none' | 'loading' | 'ok' | 'missing';
  /** Prefix internal links with this so navigation stays inside a demo. */
  href: (path: string) => string;
}

const Ctx = createContext<ClinicContext | null>(null);

export function useClinic() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useClinic must be used inside <ClinicProvider>');
  return c;
}

const LS_CONFIG = 'clinic-dashboard:config';
const LS_SETTINGS = 'clinic-dashboard:settings';
const LS_CLINIC = 'clinic-dashboard:clinic';
const DEFAULT_SETTINGS: AppSettings = { demo_mode: true, retention_days: 7 };

function readLocal<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}
function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

function normalize(r: Partial<Activity> & { id: string | number }): Activity {
  return {
    id: String(r.id),
    created_at: r.created_at ?? new Date().toISOString(),
    channel: r.channel ?? 'call',
    patient_name: r.patient_name ?? null,
    phone_masked: r.phone_masked ?? null,
    language: r.language ?? null,
    summary: r.summary ?? null,
    outcome: r.outcome ?? 'info',
    duration_sec: r.duration_sec ?? null,
    recording_url: r.recording_url ?? null,
    appointment_time: r.appointment_time ?? null,
    doctor: r.doctor ?? null,
    event: r.event ?? 'conversation',
    service: r.service ?? null,
  };
}

/** Stored config may be partial (e.g. a fresh demo only knows its preset), so fill gaps from that preset. */
function configFrom(name: string, cfg: Partial<ClinicConfig> | null | undefined): ClinicConfig {
  const preset = PRESETS[cfg?.preset ?? defaults.preset] ?? PRESETS.dental;
  const byPreset = cfg?.preset && cfg.preset !== defaults.preset
    ? { tagline: preset.tagline, doctors: preset.doctors, services: preset.services }
    : {};
  return { ...defaults, ...byPreset, ...(cfg ?? {}), name: name || cfg?.name || defaults.name };
}

export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const online = !!supabase;
  const pathname = usePathname();
  const demoSlug = pathname.startsWith('/demo/') ? decodeURIComponent(pathname.split('/')[2] ?? '') : '';
  const mode: Mode = demoSlug ? 'demo' : online ? 'app' : 'offline';

  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!online);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  // offline mode
  const [localConfig, setLocalConfig] = useState<ClinicConfig>(defaults);
  const [localSettings, setLocalSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  // app mode
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [clinicsLoaded, setClinicsLoaded] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [liveRows, setLiveRows] = useState<Activity[]>([]);
  const [dbLoaded, setDbLoaded] = useState(false);
  // demo mode
  const [demoClinic, setDemoClinic] = useState<{ name: string; config: Partial<ClinicConfig> | null } | null>(null);
  const [demoState, setDemoState] = useState<ClinicContext['demoState']>('none');
  const [demoOverride, setDemoOverride] = useState<ClinicConfig | null>(null);

  // Clock: keeps "today" correct across midnight and refreshes the KPIs.
  useEffect(() => {
    setMounted(true);
    setLocalConfig({ ...defaults, ...readLocal<Partial<ClinicConfig>>(LS_CONFIG) });
    setLocalSettings({ ...DEFAULT_SETTINGS, ...readLocal<Partial<AppSettings>>(LS_SETTINGS) });
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Auth.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const markNew = useCallback((id: string) => {
    setNewIds((s) => new Set(s).add(id));
    setTimeout(() => setNewIds((s) => { const n = new Set(s); n.delete(id); return n; }), 4000);
  }, []);

  // Demo page: load the lead's branded config and count the view.
  useEffect(() => {
    if (!demoSlug) { setDemoState('none'); return; }
    setDemoOverride(null);
    if (!supabase) { setDemoClinic({ name: defaults.name, config: null }); setDemoState('ok'); return; }
    setDemoState('loading');
    supabase.rpc('get_demo', { p_slug: demoSlug }).then(({ data, error }) => {
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) { setDemoState('missing'); return; }
      setDemoClinic({ name: row.name, config: row.config });
      setDemoState('ok');
      supabase?.rpc('track_demo_view', { p_slug: demoSlug });
    });
  }, [demoSlug]);

  // App mode: clinics this user can access.
  const userId = session?.user.id;
  useEffect(() => {
    if (!supabase || !userId || mode !== 'app') return;
    let cancelled = false;
    Promise.all([
      supabase.from('clinics').select('id, slug, name, status, config, demo_mode, retention_days, expires_at').order('name'),
      supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ]).then(([c, a]) => {
      if (cancelled) return;
      if (c.error) console.error('Loading clinics failed:', c.error.message);
      const list = (c.data ?? []) as ClinicRow[];
      setClinics(list);
      setIsAdmin(!!a.data);
      const saved = readLocal<string>(LS_CLINIC);
      setCurrentId(list.find((x) => x.id === saved)?.id ?? list.find((x) => x.status !== 'demo')?.id ?? list[0]?.id ?? null);
      setClinicsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [userId, mode]);

  const clinic = clinics.find((c) => c.id === currentId) ?? null;

  // App mode: activity rows for the selected clinic + Realtime.
  useEffect(() => {
    if (!supabase || !userId || !currentId || mode !== 'app') return;
    let cancelled = false;
    setDbLoaded(false);
    setLiveRows([]);
    const since = new Date(Date.now() - 15 * 864e5).toISOString();
    supabase
      .from('activity')
      .select('*')
      .eq('clinic_id', currentId)
      .or(`created_at.gte.${since},appointment_time.gte.${since}`)
      .order('created_at', { ascending: false })
      .limit(5000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('Loading activity failed:', error.message);
        setLiveRows((data ?? []).map(normalize));
        setDbLoaded(true);
      });

    const ch = supabase
      .channel(`clinic-${currentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity', filter: `clinic_id=eq.${currentId}` }, (p) => {
        if (p.eventType === 'INSERT') {
          const row = normalize(p.new as Activity);
          setLiveRows((rows) => [row, ...rows.filter((r) => r.id !== row.id)]);
          markNew(row.id);
        } else if (p.eventType === 'UPDATE') {
          const row = normalize(p.new as Activity);
          setLiveRows((rows) => rows.map((r) => (r.id === row.id ? row : r)));
        } else if (p.eventType === 'DELETE') {
          const id = String((p.old as { id: string }).id);
          setLiveRows((rows) => rows.filter((r) => r.id !== id));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clinics', filter: `id=eq.${currentId}` }, (p) => {
        const row = p.new as ClinicRow;
        setClinics((list) => list.map((c) => (c.id === row.id ? { ...c, ...row } : c)));
      })
      .subscribe();
    return () => { cancelled = true; supabase?.removeChannel(ch); };
  }, [userId, currentId, mode, markNew]);

  const config: ClinicConfig = useMemo(() => {
    if (mode === 'demo') return demoOverride ?? configFrom(demoClinic?.name ?? '', demoClinic?.config);
    if (mode === 'app') return clinic ? configFrom(clinic.name, clinic.config) : defaults;
    return localConfig;
  }, [mode, demoOverride, demoClinic, clinic, localConfig]);

  const settings: AppSettings = mode === 'app'
    ? { demo_mode: clinic?.demo_mode ?? true, retention_days: clinic?.retention_days === 3 ? 3 : 7 }
    : mode === 'demo' ? { demo_mode: false, retention_days: 7 } : localSettings;

  const source: Source =
    !mounted ? 'loading'
    : mode === 'demo' ? (demoState === 'ok' ? 'sample' : 'loading')
    : mode === 'offline' ? 'sample'
    : !session || !clinicsLoaded || (clinic && !dbLoaded) ? 'loading'
    : liveRows.length ? 'live' : 'sample';

  // Sample data follows the preset/doctors/services, and is regenerated as the clock moves.
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  const sampleRows = useMemo(
    () => (source === 'sample' ? generateDemo(config, new Date(minuteBucket * 60_000)) : []),
    [source, config, minuteBucket],
  );
  const [simRows, setSimRows] = useState<Activity[]>([]);
  useEffect(() => setSimRows([]), [config.preset, currentId, demoSlug]);

  // Simulated live activity while showing sample data, so the feed feels alive.
  useEffect(() => {
    if (source !== 'sample') return;
    const t = setInterval(() => {
      const row = randomLiveRow(config);
      setSimRows((r) => [row, ...r].slice(0, 30));
      markNew(row.id);
    }, mode === 'demo' ? 15_000 : 25_000);
    return () => clearInterval(t);
  }, [source, config, mode, markNew]);

  const rows = source === 'live' ? liveRows : source === 'sample' ? [...simRows, ...sampleRows] : [];

  // Brand colours → CSS variables.
  useEffect(() => {
    const s = document.documentElement.style;
    s.setProperty('--primary', config.primary);
    s.setProperty('--accent', config.accent);
  }, [config.primary, config.accent]);

  const selectClinic = useCallback((id: string) => { setCurrentId(id); writeLocal(LS_CLINIC, id); }, []);

  const saveConfig = useCallback(async (c: ClinicConfig) => {
    if (mode === 'demo') { setDemoOverride(c); return; }
    if (mode === 'app') {
      if (!supabase || !clinic) throw new Error('No clinic selected');
      const { error } = await supabase.from('clinics').update({ name: c.name, config: c }).eq('id', clinic.id);
      if (error) throw new Error(error.message);
      setClinics((list) => list.map((x) => (x.id === clinic.id ? { ...x, name: c.name, config: c } : x)));
      return;
    }
    writeLocal(LS_CONFIG, c);
    setLocalConfig(c);
  }, [mode, clinic]);

  const saveSettings = useCallback(async (s: AppSettings) => {
    if (mode === 'demo') return;
    if (mode === 'app') {
      if (!supabase || !clinic) throw new Error('No clinic selected');
      const { error } = await supabase.from('clinics').update(s).eq('id', clinic.id);
      if (error) throw new Error(error.message);
      setClinics((list) => list.map((x) => (x.id === clinic.id ? { ...x, ...s } : x)));
      return;
    }
    writeLocal(LS_SETTINGS, s);
    setLocalSettings(s);
  }, [mode, clinic]);

  const togglePlay = useCallback((row: Activity) => {
    if (!row.recording_url) return;
    const el = (audio.current ??= new Audio());
    if (playingId === row.id) { el.pause(); setPlayingId(null); return; }
    el.src = row.recording_url;
    el.onended = () => setPlayingId(null);
    el.play().then(() => setPlayingId(row.id)).catch(() => setPlayingId(null));
  }, [playingId]);

  const signOut = useCallback(async () => { await supabase?.auth.signOut(); }, []);
  const base = demoSlug ? `/demo/${encodeURIComponent(demoSlug)}` : '';
  const href = useCallback((path: string) => (base ? (path === '/' ? base : base + path) : path), [base]);

  const preset = PRESETS[config.preset] ?? PRESETS.dental;
  const value: ClinicContext = {
    mode, config, preset, labels: preset.labels, settings, rows, source, newIds, now,
    today: dayKey(now, config.timezone), online, session, authReady, signOut,
    saveConfig, saveSettings, playingId, togglePlay,
    clinics, clinic, selectClinic, isAdmin, demoState, href,
  };

  return <Ctx.Provider value={value}>{mounted ? children : null}</Ctx.Provider>;
}
