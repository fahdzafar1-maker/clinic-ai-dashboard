'use client';

import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clinicConfig as defaults } from '@/clinic.config';
import { generateDemo, randomLiveRow } from '@/lib/demo';
import { PRESETS, type Preset } from '@/lib/presets';
import { supabase } from '@/lib/supabase';
import { dayKey } from '@/lib/time';
import type { Activity, AppSettings, ClinicConfig, Labels } from '@/lib/types';

type Source = 'loading' | 'live' | 'sample';

interface ClinicContext {
  config: ClinicConfig;
  preset: Preset;
  labels: Labels;
  settings: AppSettings;
  rows: Activity[];
  /** live = rows from Supabase; sample = generated demo data (offline, or table still empty). */
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
}

const Ctx = createContext<ClinicContext | null>(null);

export function useClinic() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useClinic must be used inside <ClinicProvider>');
  return c;
}

const LS_CONFIG = 'clinic-dashboard:config';
const LS_SETTINGS = 'clinic-dashboard:settings';
const DEFAULT_SETTINGS: AppSettings = { demo_mode: true, retention_days: 7 };

function readLocal<T>(key: string): Partial<T> | null {
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

export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const online = !!supabase;
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [config, setConfig] = useState<ClinicConfig>(defaults);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!online);
  const [liveRows, setLiveRows] = useState<Activity[]>([]);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  // Clock: keeps "today" correct across midnight and refreshes the KPIs.
  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Auth (only when Supabase is configured).
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

  // Settings + clinic config.
  useEffect(() => {
    if (!mounted) return;
    if (!supabase) {
      setConfig({ ...defaults, ...readLocal<ClinicConfig>(LS_CONFIG) });
      setSettings({ ...DEFAULT_SETTINGS, ...readLocal<AppSettings>(LS_SETTINGS) });
      return;
    }
    if (!session) return;
    const apply = (row: { clinic?: Partial<ClinicConfig> | null; demo_mode: boolean; retention_days: number }) => {
      setConfig({ ...defaults, ...(row.clinic ?? {}) });
      setSettings({ demo_mode: row.demo_mode, retention_days: row.retention_days === 3 ? 3 : 7 });
    };
    supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => { if (data) apply(data); });
    const ch = supabase
      .channel('settings-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings' }, (p) => apply(p.new as never))
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [mounted, session]);

  // Activity rows + Realtime.
  useEffect(() => {
    if (!supabase || !session) return;
    let cancelled = false;
    const since = new Date(Date.now() - 15 * 864e5).toISOString();
    supabase
      .from('activity')
      .select('*')
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
      .channel('activity-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity' }, (p) => {
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
      .subscribe();
    return () => { cancelled = true; supabase?.removeChannel(ch); };
  }, [session, markNew]);

  const source: Source = !mounted || (online && (!session || !dbLoaded)) ? 'loading' : online && liveRows.length ? 'live' : 'sample';

  // Sample data follows the preset/doctors/services, and is regenerated as the clock moves.
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  const sampleRows = useMemo(
    () => (source === 'sample' ? generateDemo(config, new Date(minuteBucket * 60_000)) : []),
    [source, config, minuteBucket],
  );
  const [simRows, setSimRows] = useState<Activity[]>([]);
  useEffect(() => setSimRows([]), [config.preset]);

  // Simulated live activity while showing sample data, so the feed feels alive.
  useEffect(() => {
    if (source !== 'sample') return;
    const t = setInterval(() => {
      const row = randomLiveRow(config);
      setSimRows((r) => [row, ...r].slice(0, 30));
      markNew(row.id);
    }, 25_000);
    return () => clearInterval(t);
  }, [source, config, markNew]);

  const rows = source === 'live' ? liveRows : source === 'sample' ? [...simRows, ...sampleRows] : [];

  // Brand colours → CSS variables.
  useEffect(() => {
    const s = document.documentElement.style;
    s.setProperty('--primary', config.primary);
    s.setProperty('--accent', config.accent);
  }, [config.primary, config.accent]);

  const saveConfig = useCallback(async (c: ClinicConfig) => {
    if (supabase) {
      const { error } = await supabase.from('settings').update({ clinic: c }).eq('id', 1);
      if (error) throw new Error(error.message);
    } else {
      writeLocal(LS_CONFIG, c);
    }
    setConfig(c);
  }, []);

  const saveSettings = useCallback(async (s: AppSettings) => {
    if (supabase) {
      const { error } = await supabase.from('settings').update(s).eq('id', 1);
      if (error) throw new Error(error.message);
    } else {
      writeLocal(LS_SETTINGS, s);
    }
    setSettings(s);
  }, []);

  const togglePlay = useCallback((row: Activity) => {
    if (!row.recording_url) return;
    const el = (audio.current ??= new Audio());
    if (playingId === row.id) { el.pause(); setPlayingId(null); return; }
    el.src = row.recording_url;
    el.onended = () => setPlayingId(null);
    el.play().then(() => setPlayingId(row.id)).catch(() => setPlayingId(null));
  }, [playingId]);

  const signOut = useCallback(async () => { await supabase?.auth.signOut(); }, []);

  const preset = PRESETS[config.preset] ?? PRESETS.dental;
  const value: ClinicContext = {
    config, preset, labels: preset.labels, settings, rows, source, newIds, now,
    today: dayKey(now, config.timezone), online, session, authReady, signOut,
    saveConfig, saveSettings, playingId, togglePlay,
  };

  return <Ctx.Provider value={value}>{mounted ? children : null}</Ctx.Provider>;
}
