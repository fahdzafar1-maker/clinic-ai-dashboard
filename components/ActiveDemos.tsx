'use client';

import { useState } from 'react';
import { useClinic } from './ClinicProvider';
import { Icon } from './Icon';
import { Card } from './widgets';
import { DEMO_LINES, phoneDigits } from '@/lib/demoLines';
import { supabase } from '@/lib/supabase';
import type { ClinicRow } from '@/lib/types';

const daysLeft = (c: ClinicRow) =>
  c.expires_at ? Math.ceil((new Date(c.expires_at).getTime() - Date.now()) / 864e5) : null;

/** Agency view of the prospect demos: who has which demo line, how long is left, extend or end. */
export function ActiveDemos({ onNew }: { onNew: () => void }) {
  const { clinics, refreshClinics } = useClinic();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState<string | null>(null);
  const [error, setError] = useState('');

  const demos = clinics
    .filter((c) => (c.status === 'demo' || c.status === 'trial' || c.status === 'expired') && c.slug !== 'elite-clinic-dubai')
    .sort((a, b) => (a.status === 'expired' ? 1 : 0) - (b.status === 'expired' ? 1 : 0) || (a.expires_at ?? '').localeCompare(b.expires_at ?? ''));
  const live = demos.filter((c) => c.status !== 'expired');
  const lineOf = (c: ClinicRow) => c.config?.receptionist?.dedicatedNumber ?? '';
  const takenBy = (line: string) => live.find((c) => phoneDigits(lineOf(c)) === phoneDigits(line));
  const freeLines = DEMO_LINES.filter((l) => !takenBy(l));

  async function run(id: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    if (!supabase) return;
    setBusy(id);
    setError('');
    const { error } = await fn();
    if (error) setError(error.message);
    setBusy(null);
    setConfirmEnd(null);
    refreshClinics();
  }

  const setLine = (c: ClinicRow, line: string) =>
    run(c.id, () => supabase!.from('clinics')
      .update({ config: { ...(c.config ?? {}), receptionist: { ...(c.config?.receptionist ?? {}), dedicatedNumber: line } } })
      .eq('id', c.id));
  const extend = (c: ClinicRow) => run(c.id, () => supabase!.rpc('admin_demo_action', { p_clinic: c.id, p_action: 'extend', p_days: 7 }));
  const end = (c: ClinicRow) => run(c.id, () => supabase!.rpc('admin_demo_action', { p_clinic: c.id, p_action: 'end' }));

  return (
    <Card
      title={`Active demos · ${live.length} running · ${freeLines.length} of ${DEMO_LINES.length} demo lines free`}
      icon="phoneCall"
      action={<button className="link" onClick={onNew}>New demo <Icon name="plus" /></button>}
    >
      {error && <div className="banner banner-error demos-error">{error}</div>}
      {!demos.length ? <p className="empty">No prospect demos yet. Create one with “New demo”.</p> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Clinic</th><th>Status</th><th>Time left</th><th>Demo line</th><th>Demo</th><th className="ta-c">Actions</th></tr>
            </thead>
            <tbody>
              {demos.map((c) => {
                const left = daysLeft(c);
                const line = lineOf(c);
                const expired = c.status === 'expired';
                return (
                  <tr key={c.id} className={expired ? 'row-muted' : ''}>
                    <td><div className="strong">{c.name}</div><div className="muted">{c.config?.city ?? ''}</div></td>
                    <td><span className={`pill ${expired ? 'cancelled' : c.status === 'trial' ? 'info' : 'booked'}`}>{c.status}</span></td>
                    <td className="nowrap">
                      {expired ? <span className="muted">ended · data deleted 3 days later</span>
                        : left == null ? '—' : left <= 1 ? <b className="warn">{left <= 0 ? 'ends today' : '1 day'}</b> : `${left} days`}
                    </td>
                    <td>
                      <select className="select" value={line} disabled={busy === c.id || expired} onChange={(e) => setLine(c, e.target.value)}>
                        <option value="">Shared number only</option>
                        {DEMO_LINES.map((l) => {
                          const owner = takenBy(l);
                          return <option key={l} value={l} disabled={!!owner && owner.id !== c.id}>{l}{owner && owner.id !== c.id ? ` (${owner.name})` : ''}</option>;
                        })}
                        {line && !DEMO_LINES.some((l) => phoneDigits(l) === phoneDigits(line)) && <option value={line}>{line}</option>}
                      </select>
                    </td>
                    <td>{!expired && c.status === 'demo' && <a className="link" href={`/demo/${c.slug}`} target="_blank" rel="noreferrer">Open <Icon name="arrowRight" /></a>}</td>
                    <td className="ta-c nowrap">
                      <button className="btn btn-ghost btn-sm" disabled={busy === c.id} onClick={() => extend(c)}>{expired ? 'Reopen 7 days' : '+7 days'}</button>
                      {!expired && (confirmEnd === c.id
                        ? <button className="btn btn-danger btn-sm" disabled={busy === c.id} onClick={() => end(c)}>Confirm end</button>
                        : <button className="btn btn-ghost btn-sm" disabled={busy === c.id} onClick={() => setConfirmEnd(c.id)}>End now</button>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint demos-hint">
        Demo lines come from <code>lib/demoLines.ts</code> (or <code>NEXT_PUBLIC_DEMO_LINES</code>). A line is free again as soon as its demo ends.
        Ended demos are deleted automatically 3 days later; the lead stays in the list below.
      </p>
    </Card>
  );
}
