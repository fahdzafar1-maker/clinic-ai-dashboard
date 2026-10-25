'use client';

import { useEffect, useState } from 'react';
import { clinicConfig as fileDefaults } from '@/clinic.config';
import { useClinic } from '@/components/ClinicProvider';
import { DemoNumbersCard } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/widgets';
import { PRESETS, PRESET_KEYS } from '@/lib/presets';
import type { AppSettings, ClinicConfig, PresetKey } from '@/lib/types';

const sampleRow = (clinicId: string) => `{
  "clinic_id": "${clinicId}",
  "channel": "call",
  "patient_name": "Ayesha Khan",
  "phone_masked": "+971501234567",
  "language": "English",
  "summary": "Booked a cleaning for tomorrow 10:30.",
  "outcome": "booked",
  "duration_sec": 134,
  "recording_url": "https://example.com/recordings/abc.mp3",
  "appointment_time": "2026-10-25T10:30:00+04:00",
  "doctor": "Dr. Ahmed Khan",
  "service": "Cleaning"
}`;

export default function SettingsPage() {
  const { config, settings, saveConfig, saveSettings, mode, clinic } = useClinic();
  const SAMPLE_ROW = sampleRow(clinic?.id ?? 'YOUR-CLINIC-ID');
  const [draft, setDraft] = useState<ClinicConfig>(config);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(config), [config]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  const set = <K extends keyof ClinicConfig>(k: K, v: ClinicConfig[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const rc = draft.receptionist ?? {};
  // Raw text of the languages box, so typing "sl, h" isn't wiped before a code is complete.
  const [langText, setLangText] = useState((config.receptionist?.languages ?? []).join(', '));
  useEffect(() => setLangText((config.receptionist?.languages ?? []).join(', ')), [config]);
  const [numbersText, setNumbersText] = useState((config.receptionist?.callerNumbers ?? []).join(', '));
  useEffect(() => setNumbersText((config.receptionist?.callerNumbers ?? []).join(', ')), [config]);
  const setRc = (patch: Partial<NonNullable<ClinicConfig['receptionist']>>) =>
    setDraft((d) => ({ ...d, receptionist: { ...(d.receptionist ?? {}), ...patch } }));

  function applyPreset(key: PresetKey) {
    const p = PRESETS[key];
    setDraft((d) => ({ ...d, preset: key, tagline: p.tagline, doctors: p.doctors, services: p.services }));
  }

  async function save(next: ClinicConfig = draft) {
    setSaving(true);
    setStatus(null);
    try {
      await saveConfig(next);
      setStatus({ kind: 'ok', text: mode === 'app' ? 'Saved to Supabase.' : mode === 'demo' ? 'Applied to this demo (not saved — try anything!).' : 'Saved in this browser.' });
    } catch (e) {
      setStatus({ kind: 'error', text: `Could not save: ${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  }

  async function updateDemo(next: AppSettings) {
    try {
      await saveSettings(next);
      setStatus({ kind: 'ok', text: 'Demo mode updated.' });
    } catch (e) {
      setStatus({ kind: 'error', text: `Could not update demo mode: ${(e as Error).message}` });
    }
  }

  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://YOUR-PROJECT.supabase.co'}/rest/v1/activity`;

  return (
    <>
      <section className="page-head head-row">
        <div>
          <h1>Settings</h1>
          <p>Clinic profile, branding, team and services. Defaults live in <code>clinic.config.ts</code>.</p>
        </div>
        <div className="actions">
          {mode !== 'demo' && <button className="btn btn-ghost" onClick={() => setDraft(fileDefaults)}>Reset to config file</button>}
          <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => save()}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </section>

      {mode === 'demo' && <div className="banner banner-sample"><Icon name="sparkle" />Try it: change the clinic type, colours, doctors or services and press Save — the whole demo updates instantly.</div>}
      {status && <div className={`banner ${status.kind === 'ok' ? 'banner-ok' : 'banner-error'}`}>{status.text}</div>}

      {mode === 'demo' && <DemoNumbersCard />}

      <div className="settings-grid">
        <Card title="Clinic type" icon="sparkle" className="span-2">
          <p className="hint">Switching the preset updates labels, {draft.preset === 'physio' ? 'therapists' : 'doctors'}, services and the sample data.</p>
          <div className="presets">
            {PRESET_KEYS.map((k) => (
              <button key={k} className={`preset ${draft.preset === k ? 'active' : ''}`} onClick={() => applyPreset(k)}>
                <Icon name={PRESETS[k].icon} size={26} />
                <span className="preset-name">{PRESETS[k].label}</span>
                <span className="preset-sub">{PRESETS[k].labels.practitioner}s · {PRESETS[k].labels.appointments}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Clinic profile" icon="home">
          <div className="form">
            <label>Clinic name<input value={draft.name} onChange={(e) => set('name', e.target.value)} /></label>
            <label>Tagline<input value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} /></label>
            <label>Logo URL <span className="muted">(blank = preset icon; files in /public work, e.g. /logo.svg)</span>
              <input value={draft.logoUrl} placeholder="https://… or /logo.svg" onChange={(e) => set('logoUrl', e.target.value)} />
            </label>
            <div className="form-row">
              <label>Primary colour<input type="color" value={draft.primary} onChange={(e) => set('primary', e.target.value)} /></label>
              <label>Accent colour<input type="color" value={draft.accent} onChange={(e) => set('accent', e.target.value)} /></label>
            </div>
            <div className="form-row">
              <label>Country code<input value={draft.countryCode} inputMode="numeric" maxLength={4} onChange={(e) => set('countryCode', e.target.value.replace(/\D/g, ''))} placeholder="971" /></label>
              <label>Timezone<input value={draft.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder="Asia/Dubai" /></label>
              <label>Opens<input type="number" min={0} max={23} value={draft.openHour} onChange={(e) => set('openHour', Number(e.target.value))} /></label>
              <label>Closes<input type="number" min={1} max={24} value={draft.closeHour} onChange={(e) => set('closeHour', Number(e.target.value))} /></label>
            </div>
          </div>
        </Card>

        {mode !== 'demo' && <Card title="Demo mode" icon="info">
          <div className="form">
            <label className="toggle">
              <input type="checkbox" checked={settings.demo_mode} onChange={(e) => updateDemo({ ...settings, demo_mode: e.target.checked })} />
              <span className="switch" />
              <span>Auto-delete old activity</span>
            </label>
            <label>Keep data for
              <select value={settings.retention_days} disabled={!settings.demo_mode}
                onChange={(e) => updateDemo({ ...settings, retention_days: Number(e.target.value) === 3 ? 3 : 7 })}>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
              </select>
            </label>
            <p className="hint">
              {mode === "app"
                ? 'A daily pg_cron job in Supabase deletes activity rows older than this while demo mode is on.'
                : 'Offline demo: this only changes the banner. Connect Supabase for the real clean-up job.'}
            </p>
          </div>
        </Card>}

        <Card title={`${PRESETS[draft.preset].labels.practitioner}s`} icon="users">
          <div className="list-edit">
            {draft.doctors.map((d, i) => (
              <div className="list-row" key={i}>
                <input value={d.name} placeholder="Name" onChange={(e) => set('doctors', draft.doctors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input value={d.role} placeholder="Role" onChange={(e) => set('doctors', draft.doctors.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                <button className="icon-btn" aria-label="Remove" onClick={() => set('doctors', draft.doctors.filter((_, j) => j !== i))}><Icon name="trash" /></button>
              </div>
            ))}
            <button className="btn btn-ghost" onClick={() => set('doctors', [...draft.doctors, { name: '', role: '' }])}><Icon name="plus" /> Add</button>
          </div>
          <p className="hint">Names must match the <code>doctor</code> value your n8n workflows send.</p>
        </Card>

        {mode !== 'demo' && <Card title="AI phone receptionist" icon="phoneCall" className="span-2">
          <p className="hint">How the AI receptionist answers calls for this clinic. Leave empty for sensible defaults (name Sara, English greeting, automatic language).</p>
          <div className="form">
            <div className="form-row">
              <label>Receptionist name<input value={rc.name ?? ''} placeholder="Sara" maxLength={30} onChange={(e) => setRc({ name: e.target.value })} /></label>
              <label>Languages <span className="muted">(codes, main first)</span>
                <input value={langText} placeholder="e.g. sl, hr, it, en"
                  onChange={(e) => {
                    setLangText(e.target.value);
                    setRc({ languages: e.target.value.toLowerCase().split(/[\s,]+/).filter((x) => /^[a-z]{2}$/.test(x)).slice(0, 6) });
                  }} />
              </label>
              <label>Voice
                <select value={rc.voice ?? 'elevenlabs'} onChange={(e) => setRc({ voice: e.target.value as 'vapi' | 'elevenlabs' })}>
                  <option value="elevenlabs">ElevenLabs (premium)</option>
                  <option value="vapi">Vapi Voices (cheaper)</option>
                </select>
              </label>
            </div>
            <label>Dedicated AI number <span className="muted">(one of our Vapi numbers reserved for this clinic — anyone calling it, from any phone, reaches this receptionist)</span>
              <input value={rc.dedicatedNumber ?? ''} placeholder="+1 757 760 9040" maxLength={25} onChange={(e) => setRc({ dedicatedNumber: e.target.value.trim() })} />
            </label>
            <label>Extra caller numbers <span className="muted">(calls from these numbers reach this clinic's receptionist — e.g. your own test phone, the owner's staff)</span>
              <input value={numbersText} placeholder="+92 333 1234567, +386 41 000000"
                onChange={(e) => {
                  setNumbersText(e.target.value);
                  setRc({ callerNumbers: e.target.value.split(/[,;\n]+/).map((x) => x.trim()).filter((x) => x.replace(/\D/g, '').length >= 8).slice(0, 10) });
                }} />
            </label>
            <label>Greeting <span className="muted">(first sentence of every call)</span>
              <input value={rc.greeting ?? ''} maxLength={300} placeholder={`Hello, thank you for calling ${draft.name}. This is Sara, the AI receptionist. How can I help you today?`} onChange={(e) => setRc({ greeting: e.target.value })} />
            </label>
            <label>Clinic knowledge <span className="muted">(opening hours, team, prices, address, FAQs — the AI only answers from this)</span>
              <textarea rows={10} maxLength={12000} value={rc.knowledge ?? ''} onChange={(e) => setRc({ knowledge: e.target.value })}
                placeholder={'OPENING HOURS: Mon-Fri 9:00-18:00...\nTEAM: Dr. ...\nPRICES: Check-up 50 EUR...'} />
            </label>
          </div>
        </Card>}

        <Card title="Services" icon="calendarCheck">
          <div className="list-edit">
            {draft.services.map((s, i) => (
              <div className="list-row" key={i}>
                <input value={s.name} placeholder="Service" onChange={(e) => set('services', draft.services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input type="number" min={5} step={5} value={s.minutes} className="narrow"
                  onChange={(e) => set('services', draft.services.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) } : x)))} />
                <span className="muted">min</span>
                <button className="icon-btn" aria-label="Remove" onClick={() => set('services', draft.services.filter((_, j) => j !== i))}><Icon name="trash" /></button>
              </div>
            ))}
            <button className="btn btn-ghost" onClick={() => set('services', [...draft.services, { name: '', minutes: 30 }])}><Icon name="plus" /> Add</button>
          </div>
          <p className="hint">Durations size the blocks on the calendar.</p>
        </Card>

        {mode !== 'demo' && <Card title="n8n integration" icon="pulse" className="span-2">
          <p className="hint">This clinic’s ID is <code>{clinic?.id ?? "—"}</code>. Every row n8n sends must include it as <code>clinic_id</code> (full guide in README.md):</p>
          <div className="code-block">
            <div><b>POST</b> {endpoint}</div>
            <div>apikey: <i>&lt;Supabase service_role / secret key&gt;</i></div>
            <div>Authorization: Bearer <i>&lt;same key, legacy service_role only&gt;</i></div>
            <div>Content-Type: application/json</div>
            <div>Prefer: return=minimal</div>
          </div>
          <pre className="code-block">{SAMPLE_ROW}</pre>
          <button className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(SAMPLE_ROW)}><Icon name="copy" /> Copy JSON</button>
        </Card>}
      </div>
    </>
  );
}
