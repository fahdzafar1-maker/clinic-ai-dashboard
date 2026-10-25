'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { DEMO_VOICE_NUMBER } from '@/components/Shell';
import { PRESETS, PRESET_KEYS } from '@/lib/presets';
import type { PresetKey } from '@/lib/types';

const WEBHOOK = process.env.NEXT_PUBLIC_DEMO_WEBHOOK_URL || '';

interface Form {
  clinic_name: string;
  clinic_type: PresetKey;
  city: string;
  website: string;
  contact_name: string;
  phone: string;
  email: string;
  consent: boolean;
  trap: string; // honeypot — hidden from people; named so browser autofill leaves it alone
}

const EMPTY: Form = {
  clinic_name: '', clinic_type: 'dental', city: '', website: '', contact_name: '', phone: '', email: '', consent: false, trap: '',
};

export default function GetDemoPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.trap) { setForm((f) => ({ ...f, trap: '' })); setError('Something went wrong. Please press the button again.'); return; }
    const digits = form.phone.replace(/\D/g, '');
    if (digits.length < 8) { setError('Please enter a valid WhatsApp number with country code, e.g. +971 50 123 4567.'); return; }
    if (!WEBHOOK) { setError('Demo requests are not switched on yet. Please contact us directly.'); return; }

    setState('sending');
    setError('');
    try {
      const res = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_name: form.clinic_name.trim(),
          clinic_type: form.clinic_type,
          city: form.city.trim(),
          website: form.website.trim(),
          contact_name: form.contact_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          source: 'website',
          origin: window.location.origin,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !(data.url || data.slug)) throw new Error(data.error || `Request failed (${res.status})`);
      setDemoUrl(data.url || `${window.location.origin}/demo/${data.slug}`);
      setDemoCode(data.demo_code || '');
      setState('done');
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Please try again.');
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div className="login">
        <div className="card login-card getdemo-card">
          <span className="done-icon"><Icon name="calendarCheck" size={30} /></span>
          <h1>Your demo is ready 🎉</h1>
          <p className="muted">
            We built a live demo for <b>{form.clinic_name}</b>. We also sent the link to your WhatsApp{form.email ? ' and email' : ''}.
          </p>
          <a className="btn btn-primary" href={demoUrl}>Open my demo <Icon name="arrowRight" /></a>
          <div className="demo-kit">
            <div><span className="muted">Your AI receptionist</span><a className="strong" href={`tel:${DEMO_VOICE_NUMBER.replace(/[^+\d]/g, '')}`}>{DEMO_VOICE_NUMBER}</a></div>
            {demoCode && <div><span className="muted">Your demo code</span><b>{demoCode}</b></div>}
          </div>
          <p className="hint">Call from {form.phone} and the receptionist answers as {form.clinic_name}. Want to call from another phone too? Tell us the number and we'll add it to your demo. Every call appears in your demo within seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <form className="card login-card getdemo-card" onSubmit={submit}>
        <span className="done-icon"><Icon name="sparkle" size={28} /></span>
        <h1>See your clinic’s AI front desk</h1>
        <p className="muted">Tell us about your clinic. In about a minute you’ll get a live demo with your name, team and services.</p>

        <div className="field-grid">
          <label className="span-2">Clinic name *
            <input required maxLength={120} value={form.clinic_name} onChange={(e) => set('clinic_name', e.target.value)} placeholder="e.g. Smile Dental Dubai" />
          </label>
          <label>Clinic type *
            <select value={form.clinic_type} onChange={(e) => set('clinic_type', e.target.value as PresetKey)}>
              {PRESET_KEYS.map((k) => <option key={k} value={k}>{PRESETS[k].label}</option>)}
            </select>
          </label>
          <label>City *
            <input required maxLength={80} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Dubai" />
          </label>
          <label className="span-2">Website or Instagram <span className="muted">(optional — we use it to add your real doctors and services)</span>
            <input maxLength={300} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://… or @yourclinic" />
          </label>
          <label>Your name *
            <input required maxLength={80} value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
          </label>
          <label>Your mobile / WhatsApp number *
            <input required type="tel" maxLength={25} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+971 50 123 4567" />
          </label>
          <p className="hint span-2 field-note">This is <b>your own</b> number, not the AI's. When you call the demo AI receptionist from it, the AI recognises you and answers as your clinic. The AI numbers are given to you with the demo.</p>
          <label className="span-2">Email <span className="muted">(optional)</span>
            <input type="email" maxLength={120} value={form.email} onChange={(e) => set('email', e.target.value)} />
          </label>
          <label className="hp" aria-hidden="true">Leave this empty
            <input tabIndex={-1} name="hp_trap_x9" autoComplete="off" data-lpignore="true" value={form.trap} onChange={(e) => set('trap', e.target.value)} />
          </label>
        </div>

        <label className="consent">
          <input type="checkbox" required checked={form.consent} onChange={(e) => set('consent', e.target.checked)} />
          <span>I agree to receive my demo link and follow-up messages on WhatsApp and email.</span>
        </label>

        {error && <div className="banner banner-error">{error}</div>}
        <button className="btn btn-primary" disabled={state === 'sending'}>
          {state === 'sending' ? 'Building your demo…' : 'Build my free demo'}
        </button>
      </form>
    </div>
  );
}
