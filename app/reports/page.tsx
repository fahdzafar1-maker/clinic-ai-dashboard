'use client';

import { useMemo, useState } from 'react';
import { useClinic } from '@/components/ClinicProvider';
import { Chips } from '@/components/Filters';
import { CHANNEL_LABEL, Card, OUTCOME_LABEL, WeeklyChart } from '@/components/widgets';
import { countBy } from '@/lib/metrics';
import { addDays, dayKey } from '@/lib/time';
import type { Channel, Outcome } from '@/lib/types';

function Bars({ data, color }: { data: [string, number][]; color?: string }) {
  const max = Math.max(1, ...data.map(([, v]) => v));
  const total = data.reduce((s, [, v]) => s + v, 0) || 1;
  if (!data.length) return <p className="empty">No data for this period.</p>;
  return (
    <ul className="hbars">
      {data.map(([label, v]) => (
        <li key={label}>
          <span className="hb-label">{label}</span>
          <span className="hb-track"><span className="hb-fill" style={{ width: `${(v / max) * 100}%`, background: color }} /></span>
          <span className="hb-val">{v} <span className="muted">· {Math.round((v / total) * 100)}%</span></span>
        </li>
      ))}
    </ul>
  );
}

const sorted = <T extends string>(m: Map<T, number>, label: (k: T) => string = (k) => k): [string, number][] =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [label(k), v]);

export default function ReportsPage() {
  const { rows, today, config, labels } = useClinic();
  const [days, setDays] = useState<'7' | '14'>('7');
  const n = Number(days);

  const period = useMemo(
    () => rows.filter((r) => dayKey(r.created_at, config.timezone) >= addDays(today, -(n - 1))),
    [rows, today, n, config.timezone],
  );
  const convs = period.filter((r) => r.event === 'conversation');
  const handled = convs.filter((r) => r.outcome !== 'forwarded').length;
  const booked = period.filter((r) => r.outcome === 'booked').length;
  const durations = period.filter((r) => r.channel === 'call' && r.duration_sec != null).map((r) => r.duration_sec!);
  const avg = durations.length ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length) : 0;

  const stats = [
    { label: 'Conversations', value: convs.length },
    { label: 'AI resolution rate', value: `${convs.length ? Math.round((handled / convs.length) * 100) : 0}%` },
    { label: `${labels.appointments} booked`, value: booked },
    { label: 'Avg. call length', value: `${Math.floor(avg / 60)}m ${String(avg % 60).padStart(2, '0')}s` },
  ];

  return (
    <>
      <section className="page-head head-row">
        <div>
          <h1>Reports</h1>
          <p>How the AI front desk performed over the last {n} days.</p>
        </div>
        <Chips<'7' | '14'> value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }]} />
      </section>

      <section className="stats">
        {stats.map((s) => (
          <div className="card stat" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </section>

      <section className="row row-split">
        <WeeklyChart days={n} />
        <Card title="By channel" icon="pulse">
          <Bars data={sorted(countBy<Channel>(convs, (r) => r.channel), (k) => CHANNEL_LABEL[k])} />
        </Card>
      </section>

      <section className="row row-thirds">
        <Card title="Outcomes" icon="calendarCheck">
          <Bars data={sorted(countBy<Outcome>(convs, (r) => r.outcome), (k) => OUTCOME_LABEL[k])} />
        </Card>
        <Card title="Languages" icon="globe">
          <Bars data={sorted(countBy(convs, (r) => r.language)).slice(0, 7)} color="#5aa3f5" />
        </Card>
        <Card title={`Bookings by ${labels.practitioner.toLowerCase()}`} icon="userCheck">
          <Bars data={sorted(countBy(period.filter((r) => r.outcome === 'booked'), (r) => r.doctor))} color="#7c5ce0" />
        </Card>
      </section>
    </>
  );
}
