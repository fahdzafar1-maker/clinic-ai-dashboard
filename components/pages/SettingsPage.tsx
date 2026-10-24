'use client';

import { useEffect, useState } from 'react';
import { clinicConfig as fileDefaults } from '@/clinic.config';
import { useClinic } from '@/components/ClinicProvider';
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
