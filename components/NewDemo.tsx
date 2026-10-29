'use client';

import { useState } from 'react';
import { useClinic } from './ClinicProvider';
import { Icon } from './Icon';
import { DEMO_VOICE_NUMBER } from './Shell';
import { Card } from './widgets';
import { buildGreeting, clientMessage, LANG_CODES, LANGS, suggestVoice } from '@/lib/demoBrief';
import { DEMO_LINES, phoneDigits } from '@/lib/demoLines';
import { PRESETS, PRESET_KEYS } from '@/lib/presets';
import { supabase } from '@/lib/supabase';
import type { ClinicConfig, PresetKey, ReceptionistConfig } from '@/lib/types';

const WEBHOOK = process.env.NEXT_PUBLIC_DEMO_WEBHOOK_URL || '';

interface Brief {
  clinic_name: string;
  clinic_type: PresetKey;
  city: string;
  website: string;
  contact_name: string;
  phone: string;
  email: string;
  emailClient: boolean;
  agent: string;
  langs: string[];
  voice: 'vapi' | 'elevenlabs';
  greeting: string;
  greetingEdited: boolean;
  line: string;
  callers: string;
  notes: string;
}

const EMPTY: Brief = {
  clinic_name: '', clinic_type: 'dental', city: '', website: '', contact_name: '', phone: '', email: '', emailClient: false,
  agent: 'Sara', langs: ['en'], voice: 'vapi', greeting: '', greetingEdited: false, line: '', callers: '', notes: '',
};

interface Result { url: string; slug: string; number: string; dedicated: boolean; message: string; warning: string }

/** enrichedAt is written by DEMO-01 once it has finished reading the clinic website. */
type DemoRow = { id: string; config: (Partial<ClinicConfig> & { enrichedAt?: string }) | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Agency form: build a prospect demo from a short brief in one go. DEMO-01 creates the demo and reads
 * the clinic website (team, services, hours/prices into knowledge); when that is done, the receptionist
 * settings from the brief are merged in, and a ready-to-send message for the prospect is shown.
 */
export function NewDemo({ onClose }: { onClose: () => void }) {
  const { clinics, refreshClinics } = useClinic();
  const [b, setB] = useState<Brief>(EMPTY);
  const [step, setStep] = useState<'form' | 'building' | 'done'>('form');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => setB((x) => ({ ...x, [k]: v }));
  const greeting = b.greetingEdited ? b.greeting : buildGreeting(b.clinic_name.trim() || 'the clinic', b.agent.trim() || 'Sara', b.langs);

  const takenBy = (line: string) => clinics.find((c) => c.status !== 'expired' && phoneDigits(c.config?.receptionist?.dedicatedNumber) === phoneDigits(line));

  function toggleLang(code: string) {
    setB((x) => {
      const langs = x.langs.includes(code) ? x.langs.filter((l) => l !== code) : [...x.langs, code].slice(0, 6);
      return { ...x, langs: langs.length ? langs : ['en'], voice: suggestVoice(langs) };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phoneDigits(b.phone).length < 8) { setError('Owner phone needs the country code, e.g. +386 41 123 456.'); return; }
    if (!WEBHOOK || !supabase) { setError('NEXT_PUBLIC_DEMO_WEBHOOK_URL or Supabase is not configured.'); return; }
    setError('');
    setStep('building');
    setStatus('Creating the demo…');
    try {
      const res = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_name: b.clinic_name.trim(), clinic_type: b.clinic_type, city: b.city.trim(), website: b.website.trim(),
          contact_name: b.contact_name.trim(), phone: b.phone.trim(), email: b.email.trim(),
          notify_lead: b.emailClient && !!b.email.trim(), source: 'manual', origin: window.location.origin,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.slug) throw new Error(data.error || `Demo builder failed (${res.status})`);

      // Wait for DEMO-01 to finish reading the website, so its profile save doesn't overwrite ours.
      setStatus(b.website.trim() ? 'Reading the clinic website (team, services, hours, prices)…' : 'Saving the clinic profile…');
      let row: DemoRow | null = null;
      for (let i = 0; i < 30; i++) {
        const { data: r } = await supabase.from('clinics').select('id, config').eq('slug', data.slug).maybeSingle();
        row = (r as DemoRow | null) ?? row;
        if (row?.config?.enrichedAt) break;
        await sleep(3000);
      }
      if (!row) throw new Error('The demo was created but could not be loaded. Open it from Active demos.');

      setStatus('Setting up the receptionist…');
      const cfg = row.config ?? {};
      const fromSite = cfg.receptionist?.knowledge?.trim() ?? '';
      const knowledge = [b.notes.trim(), fromSite && (b.notes.trim() ? `FROM THE CLINIC WEBSITE:\n${fromSite}` : fromSite)]
        .filter(Boolean).join('\n\n').slice(0, 12000);
      const receptionist: ReceptionistConfig = {
        ...(cfg.receptionist ?? {}),
        name: b.agent.trim() || 'Sara',
        languages: b.langs,
        voice: b.voice,
        greeting,
        knowledge: knowledge || undefined,
        dedicatedNumber: b.line || undefined,
        callerNumbers: b.callers.split(/[,;\n]+/).map((x) => x.trim()).filter((x) => phoneDigits(x).length >= 8).slice(0, 10),
      };
      const { error: upErr } = await supabase.from('clinics').update({ config: { ...cfg, receptionist } }).eq('id', row.id);
      if (upErr) throw new Error(upErr.message);
      refreshClinics();

      const url = data.url || `${window.location.origin}/demo/${data.slug}`;
      const number = b.line || DEMO_VOICE_NUMBER;
      setResult({
        url, slug: data.slug, number, dedicated: !!b.line,
        message: clientMessage({ contact: b.contact_name, clinic: b.clinic_name.trim(), url, number, dedicated: !!b.line, ownerPhone: b.phone.trim(), agent: receptionist.name!, langs: b.langs }),
        warning: row.config?.enrichedAt ? '' : 'The website was still being read after 90 seconds. Check the team and services in the demo Settings.',
      });
      setStep('done');
    } catch (err) {
      setError((err as Error).message || 'Something went wrong.');
      setStep('form');
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.message).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (step === 'done' && result) {
    return (
      <Card title={`Demo ready: ${b.clinic_name}`} icon="sparkle" action={<button className="link" onClick={onClose}>Close</button>}>
        <div className="form newdemo">
          {result.warning && <div className="banner banner-demo">{result.warning}</div>}
          <div className="demo-kit">
            <div><span className="muted">Demo link</span><a className="strong" href={result.url} target="_blank" rel="noreferrer">{result.url}</a></div>
            <div><span className="muted">AI phone number</span><b>{result.number}{result.dedicated ? ' (dedicated)' : ' (shared)'}</b></div>
          </div>
          <label>Message for {b.contact_name || 'the client'} <span className="muted">(edit if needed, then copy)</span>
            <textarea rows={16} value={result.message} onChange={(e) => setResult({ ...result, message: e.target.value })} />
          </label>
          <div className="newdemo-actions">
            <button className="btn btn-primary" onClick={copy}><Icon name="copy" />{copied ? 'Copied' : 'Copy message'}</button>
            {phoneDigits(b.phone) && <a className="btn btn-ghost" href={`https://wa.me/${phoneDigits(b.phone)}?text=${encodeURIComponent(result.message)}`} target="_blank" rel="noreferrer"><Icon name="whatsapp" />Open in WhatsApp</a>}
            <a className="btn btn-ghost" href={result.url} target="_blank" rel="noreferrer">Open demo <Icon name="arrowRight" /></a>
          </div>
          <p className="hint">Before sending: open the demo and call {result.number} once yourself{result.dedicated ? '' : ` from ${b.phone}`} to check the greeting and the voice.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card title="New demo from a brief" icon="sparkle" action={<button className="link" onClick={onClose}>Cancel</button>}>
      <form className="form newdemo" onSubmit={submit}>
        <div className="field-grid">
          <label className="span-2">Clinic name *<input required maxLength={120} value={b.clinic_name} onChange={(e) => set('clinic_name', e.target.value)} placeholder="Zobozdravstvo Surina" /></label>
          <label>Clinic type *
            <select value={b.clinic_type} onChange={(e) => set('clinic_type', e.target.value as PresetKey)}>
              {PRESET_KEYS.map((k) => <option key={k} value={k}>{PRESETS[k].label}</option>)}
            </select>
          </label>
          <label>City *<input required maxLength={80} value={b.city} onChange={(e) => set('city', e.target.value)} placeholder="Ilirska Bistrica" /></label>
          <label className="span-2">Website <span className="muted">(the AI reads team, services, hours and prices from it)</span>
            <input maxLength={300} value={b.website} onChange={(e) => set('website', e.target.value)} placeholder="https://…" />
          </label>
          <label>Owner name *<input required maxLength={80} value={b.contact_name} onChange={(e) => set('contact_name', e.target.value)} /></label>
          <label>Owner mobile / WhatsApp *<input required type="tel" maxLength={25} value={b.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+386 41 123 456" /></label>
          <label>Email <span className="muted">(optional)</span><input type="email" maxLength={120} value={b.email} onChange={(e) => set('email', e.target.value)} /></label>
          <label className="consent newdemo-check"><input type="checkbox" checked={b.emailClient} disabled={!b.email.trim()} onChange={(e) => set('emailClient', e.target.checked)} /><span>Also email the demo link to the client</span></label>
        </div>

        <div className="newdemo-section">AI receptionist</div>
        <div className="field-grid">
          <label>Receptionist name<input maxLength={30} value={b.agent} onChange={(e) => set('agent', e.target.value)} placeholder="Sara" /></label>
          <label>Voice
            <select value={b.voice} onChange={(e) => set('voice', e.target.value as Brief['voice'])}>
              <option value="vapi">Vapi Voices (default, cheaper)</option>
              <option value="elevenlabs">ElevenLabs (for Slovenian / Serbian / Bosnian names)</option>
            </select>
          </label>
          <div className="span-2 newdemo-langs">
            <span>Languages <span className="muted">(click in order: main language first)</span></span>
            <div className="chips">
              {LANG_CODES.map((code) => {
                const i = b.langs.indexOf(code);
                return (
                  <button type="button" key={code} className={`chip ${i >= 0 ? 'active' : ''}`} onClick={() => toggleLang(code)}>
                    {i >= 0 && <span className="chip-count">{i + 1}</span>}{LANGS[code].name}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="span-2">Greeting <span className="muted">(built from the languages; edit to change)</span>
            <input maxLength={300} value={greeting} onChange={(e) => setB((x) => ({ ...x, greeting: e.target.value, greetingEdited: true }))} />
          </label>
          <label>Phone line
            <select value={b.line} onChange={(e) => set('line', e.target.value)}>
              <option value="">Shared number {DEMO_VOICE_NUMBER}</option>
              {DEMO_LINES.map((l) => { const owner = takenBy(l); return <option key={l} value={l} disabled={!!owner}>{l}{owner ? ` (${owner.name})` : ' (dedicated)'}</option>; })}
            </select>
          </label>
          <label>Extra caller numbers <span className="muted">(your test phones, staff)</span>
            <input value={b.callers} onChange={(e) => set('callers', e.target.value)} placeholder="+92 333 1234567, +386 …" />
          </label>
          <label className="span-2">Notes for the receptionist <span className="muted">(hours, prices, team, anything the website misses)</span>
            <textarea rows={5} maxLength={6000} value={b.notes} onChange={(e) => set('notes', e.target.value)} placeholder={'OPENING HOURS: Mon-Fri 8:00-16:00\nPRICES: Check-up from 40 EUR, implant from 900 EUR'} />
          </label>
        </div>

        {error && <div className="banner banner-error">{error}</div>}
        {step === 'building' && <div className="banner banner-sample">{status} This takes up to a minute.</div>}
        <button className="btn btn-primary" disabled={step === 'building'}>{step === 'building' ? 'Building…' : 'Build demo'}</button>
      </form>
    </Card>
  );
}
