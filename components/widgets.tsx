'use client';

import { useMemo, useState } from 'react';
import { useClinic } from './ClinicProvider';
import { Icon, type IconName } from './Icon';
import { useSearch } from './Shell';
import { computeKpis, dailyHandled, type KpiKey } from '@/lib/metrics';
import { maskPhone } from '@/lib/phone';
import { dayKey, formatDayShort, formatDuration, formatDurationLong, formatHM, formatTime, minutesOfDay } from '@/lib/time';
import type { Activity, Channel, Outcome } from '@/lib/types';

export const OUTCOME_LABEL: Record<Outcome, string> = { booked: 'Booked', info: 'Info given', forwarded: 'Forwarded', cancelled: 'Cancelled' };
export const CHANNEL_LABEL: Record<Channel, string> = { call: 'AI handled call', whatsapp: 'WhatsApp chat', voice_note: 'Voice note', web: 'Website chat' };
const CHANNEL_ICON: Record<Channel, IconName> = { call: 'phone', whatsapp: 'whatsapp', voice_note: 'mic', web: 'globe' };

export const matches = (a: Activity, q: string) =>
  !q || [a.patient_name, a.phone_masked, maskPhone(a.phone_masked), a.summary, a.doctor, a.service, a.language]
    .some((v) => v?.toLowerCase().includes(q));

export function OutcomePill({ outcome }: { outcome: Outcome }) {
  return <span className={`pill ${outcome}`}>{OUTCOME_LABEL[outcome]}</span>;
}

export function PlayButton({ row }: { row: Activity }) {
  const { playingId, togglePlay } = useClinic();
  if (!row.recording_url) return <span className="muted">—</span>;
  const playing = playingId === row.id;
  return (
    <button className={`play ${playing ? 'playing' : ''}`} onClick={() => togglePlay(row)} aria-label={playing ? 'Pause recording' : 'Play recording'}>
      <Icon name={playing ? 'pause' : 'play'} />
    </button>
  );
}

export function Card({ title, icon, action, className, children }: {
  title: string; icon: IconName; action?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <article className={`card ${className ?? ''}`}>
      <div className="card-head">
        <h2><Icon name={icon} />{title}</h2>
        {action}
      </div>
      {children}
    </article>
  );
}

// ---------- KPIs ----------
export function KpiGrid() {
  const { rows, config, labels, now } = useClinic();
  const k = useMemo(() => computeKpis(rows, config.timezone, now), [rows, config.timezone, now]);
  const cards: { key: KpiKey; label: string; icon: IconName; tone: string; tint: string }[] = [
    { key: 'aiCalls', label: 'Calls handled by AI', icon: 'phone', tone: '#2f80ed', tint: '#e6f0fd' },
    { key: 'forwarded', label: `Forwarded to ${labels.practitioner.toLowerCase()}`, icon: 'userCheck', tone: '#22a35a', tint: '#e4f6ea' },
    { key: 'booked', label: `${labels.appointments} booked`, icon: 'calendarCheck', tone: '#2f6fd6', tint: '#e7effd' },
    { key: 'cancelled', label: 'Cancellations / reschedules', icon: 'stopwatch', tone: '#e5484d', tint: '#fde8e9' },
    { key: 'whatsapp', label: 'WhatsApp chats', icon: 'whatsapp', tone: '#1fa65a', tint: '#e2f6ea' },
    { key: 'recovered', label: 'Missed calls recovered', icon: 'phoneIncoming', tone: '#7c5ce0', tint: '#efeafd' },
    { key: 'reminders', label: 'No-show reminders sent', icon: 'bell', tone: '#e8a317', tint: '#fdf3dc' },
  ];
  return (
    <section className="kpis">
      {cards.map((c) => {
        const v = k[c.key];
        // For cancellations, going down is good.
        const good = c.key === 'cancelled' ? (v.deltaPct ?? 0) <= 0 : (v.deltaPct ?? 1) >= 0;
        const up = v.deltaPct == null || v.deltaPct >= 0;
        return (
          <div className="card kpi" key={c.key}>
            <div className="kpi-icon" style={{ ['--tone' as string]: c.tone, ['--tint' as string]: c.tint }}><Icon name={c.icon} /></div>
            <div className="kpi-label">{c.label}</div>
            <div className="kpi-body">
              <div className="kpi-value">
                <strong>{v.today}</strong>
                <span className={`delta ${good ? 'up' : 'down'}`}>
                  <Icon name={up ? 'arrowUp' : 'arrowDown'} />
                  {v.deltaPct == null ? 'new' : `${Math.abs(v.deltaPct)}%`}
                </span>
              </div>
              <div className="kpi-sub" title={`${v.yesterday} by this time yesterday`}>vs. this time yesterday</div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ---------- Appointments by doctor ----------
const COLORS = ['blue', 'green', 'violet', 'red'];
const HOUR_PX = 64;

export function Schedule({ appointments, day }: { appointments: Activity[]; day: string }) {
  const { config, today, now } = useClinic();
  const q = useSearch();
  const tz = config.timezone;
  const minutesFor = (service: string | null) => config.services.find((s) => s.name === service)?.minutes ?? 30;
  const colorFor = (service: string | null) => {
    const i = config.services.findIndex((s) => s.name === service);
    return COLORS[(i < 0 ? 0 : i) % COLORS.length];
  };

  const items = appointments.map((a) => {
    const start = minutesOfDay(a.appointment_time!, tz);
    return { a, start, end: start + minutesFor(a.service) };
  });

  // Columns: configured doctors, then any extra names seen in the data.
  const columns = config.doctors.map((d) => ({ name: d.name, role: d.role }));
  for (const it of items) {
    const name = it.a.doctor ?? 'Unassigned';
    if (!columns.some((c) => c.name === name)) columns.push({ name, role: '' });
  }

  // Hour range covers opening hours and every appointment; each label rendered once.
  const firstHour = Math.min(config.openHour, ...items.map((i) => Math.floor(i.start / 60)));
  const lastHour = Math.max(config.closeHour, ...items.map((i) => Math.ceil(i.end / 60)));
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);
  const pad = 10;
  const height = (lastHour - firstHour) * HOUR_PX + pad * 2;
  const y = (min: number) => ((min - firstHour * 60) / 60) * HOUR_PX + pad;
  const nowMin = minutesOfDay(now, tz);
  const showNow = day === today && nowMin >= firstHour * 60 && nowMin <= lastHour * 60;

  return (
    <div className="schedule" style={{ gridTemplateColumns: `52px repeat(${columns.length}, minmax(150px, 1fr))` }}>
      <div className="corner" />
      {columns.map((c) => (
        <div className="doc-head" key={c.name}>
          <span className="avatar">{c.name.replace(/^Dr\.?\s*/, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('')}</span>
          <div><div className="name">{c.name}</div><div className="role">{c.role}</div></div>
        </div>
      ))}
      <div className="time-col" style={{ height }}>
        {hours.map((h) => <span key={h} style={{ top: y(h * 60) }}>{formatHM(h * 60)}</span>)}
      </div>
      {columns.map((c) => {
        const mine = items.filter((i) => (i.a.doctor ?? 'Unassigned') === c.name).sort((a, b) => a.start - b.start);
        // Side-by-side lanes for overlapping bookings.
        const laneEnds: number[] = [];
        const placed = mine.map((it) => {
          let lane = laneEnds.findIndex((e) => e <= it.start);
          if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
          laneEnds[lane] = it.end;
          return { ...it, lane };
        });
        const lanes = Math.max(1, laneEnds.length);
        return (
          <div className="day-col" key={c.name} style={{ height, ['--hour' as string]: `${HOUR_PX}px`, backgroundPositionY: pad }}>
            {showNow && <div className="now-line" style={{ top: y(nowMin) }} />}
            {placed.map(({ a, start, end, lane }) => {
              const hit = matches(a, q);
              return (
                <div
                  key={a.id}
                  className={`appt ${colorFor(a.service)} ${end - start < 45 ? 'compact' : ''} ${q ? (hit ? 'hit' : 'dim') : ''}`}
                  style={{
                    top: y(start) + 1, height: Math.max(y(end) - y(start) - 3, 22),
                    left: `calc(6px + (100% - 12px) * ${lane / lanes})`, width: `calc((100% - 12px) / ${lanes} - 2px)`,
                  }}
                  title={`${a.patient_name ?? maskPhone(a.phone_masked)} · ${a.service ?? ''} · ${formatHM(start)}–${formatHM(end)}`}
                >
                  <div className="t">{formatHM(start)} - {formatHM(end)}</div>
                  <div className="p">{a.patient_name ?? maskPhone(a.phone_masked)}</div>
                  <div className="s">{a.service ?? a.summary}</div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Live feed ----------
export function ActivityFeed({ rows, limit = 7, empty = 'No activity yet today.' }: { rows: Activity[]; limit?: number; empty?: string }) {
  const { config, newIds } = useClinic();
  const q = useSearch();
  const list = rows.filter((a) => matches(a, q)).slice(0, limit);
  if (!list.length) return <p className="empty">{q ? 'No matches.' : empty}</p>;
  return (
    <ul className="feed">
      {list.map((a) => (
        <li key={a.id} className={newIds.has(a.id) ? 'new' : ''}>
          <span className={`feed-icon ${a.channel}`}><Icon name={CHANNEL_ICON[a.channel]} /></span>
          <div className="feed-body">
            <div className="who">{a.patient_name ?? maskPhone(a.phone_masked)}</div>
            <div className="meta">
              {a.event === 'reminder' ? 'Reminder' : a.event === 'missed_call_recovered' ? 'Missed call recovered' : CHANNEL_LABEL[a.channel]}
              {a.duration_sec != null && ` · ${formatDurationLong(a.duration_sec)}`}
              {a.language && ` · ${a.language}`}
            </div>
            {a.summary && <div className="quote">“{a.summary}”</div>}
          </div>
          <div className="right">
            <span className="time">{formatTime(a.created_at, config.timezone)}</span>
            <OutcomePill outcome={a.outcome} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- Weekly chart ----------
export function WeeklyChart({ days = 7 }: { days?: number }) {
  const { rows, config, labels, now, today } = useClinic();
  const [range, setRange] = useState<'current' | 'previous'>('current');
  const [tip, setTip] = useState<{ x: number; y: number; i: number } | null>(null);
  const data = useMemo(
    () => dailyHandled(rows, config.timezone, days, range === 'current' ? 0 : days, now),
    [rows, config.timezone, days, range, now],
  );

  const W = 680, H = 200, padL = 28, padB = 36, padT = 18;
  const peak = Math.max(10, ...data.map((d) => Math.max(d.handled, d.forwarded)));
  const step = [2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => s * 5 >= peak) ?? Math.ceil(peak / 5);
  const max = step * 5;
  const plotH = H - padB - padT, groupW = (W - padL) / data.length;
  const barW = Math.min(26, groupW * 0.3);
  const yv = (v: number) => padT + plotH - (v / max) * plotH;

  return (
    <Card
      title={`AI Handled vs Forwarded`}
      icon="barChart"
      className="chart-card"
      action={
        <select className="select" value={range} onChange={(e) => setRange(e.target.value as 'current' | 'previous')}>
          <option value="current">Last {days} days</option>
          <option value="previous">Previous {days} days</option>
        </select>
      }
    >
      <div className="legend">
        <span><i className="sw sw-ai" />AI Handled</span>
        <span><i className="sw sw-fw" />Forwarded to {labels.practitioner}</span>
      </div>
      <div className="chart" onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="AI handled versus forwarded conversations per day">
          <defs>
            <linearGradient id="gAi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--primary)" /></linearGradient>
            <linearGradient id="gFw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5aa3f5" /><stop offset="1" stopColor="#2f80ed" /></linearGradient>
          </defs>
          {Array.from({ length: 6 }, (_, i) => i * step).map((v) => (
            <g key={v}>
              <line className="grid" x1={padL} x2={W} y1={yv(v)} y2={yv(v)} />
              <text className="axis" x={0} y={yv(v) + 3}>{v}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = padL + groupW * i + groupW / 2;
            const x1 = cx - barW - 1, x2 = cx + 1;
            const { weekday, date } = formatDayShort(d.key);
            const isToday = d.key === today;
            const hover = (e: React.MouseEvent) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, i });
            return (
              <g key={d.key} onMouseMove={hover}>
                <rect className="hit-area" x={padL + groupW * i} y={padT} width={groupW} height={plotH} />
                <rect className="bar" x={x1} y={yv(d.handled)} width={barW} height={yv(0) - yv(d.handled)} rx={3} fill="url(#gAi)" />
                <rect className="bar" x={x2} y={yv(d.forwarded)} width={barW} height={yv(0) - yv(d.forwarded)} rx={3} fill="url(#gFw)" />
                <text className="val" x={x1 + barW / 2} y={yv(d.handled) - 5}>{d.handled}</text>
                <text className="val" x={x2 + barW / 2} y={yv(d.forwarded) - 5}>{d.forwarded}</text>
                <text className={`day ${isToday ? 'today' : ''}`} x={cx} y={H - 20}>{isToday ? 'Today' : weekday}</text>
                <text className={`day ${isToday ? 'today' : ''}`} x={cx} y={H - 6}>{date}</text>
              </g>
            );
          })}
        </svg>
        {tip && (() => {
          const d = data[tip.i], total = d.handled + d.forwarded;
          return (
            <div className="tooltip" style={{ left: tip.x + 14, top: tip.y - 10 }}>
              <b>{formatDayShort(d.key).weekday}, {formatDayShort(d.key).date}</b><br />
              AI handled: {d.handled}<br />Forwarded: {d.forwarded}<br />
              AI resolution: {total ? Math.round((d.handled / total) * 100) : 0}%
            </div>
          );
        })()}
      </div>
    </Card>
  );
}

// ---------- Calls table ----------
export function CallsTable({ rows, showDate = false, showSummary = false }: { rows: Activity[]; showDate?: boolean; showSummary?: boolean }) {
  const { config } = useClinic();
  const q = useSearch();
  const list = rows.filter((a) => matches(a, q));
  if (!list.length) return <p className="empty">{q ? 'No matches.' : 'No calls yet.'}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th><th>Caller</th><th>Duration</th><th>Language</th>
            {showSummary && <th>Summary</th>}
            <th>Outcome</th><th className="ta-c">Recording</th>
          </tr>
        </thead>
        <tbody>
          {list.map((a) => (
            <tr key={a.id}>
              <td className="nowrap">
                {showDate && <span className="muted">{formatDayShort(dayKey(a.created_at, config.timezone)).date} · </span>}
                {formatTime(a.created_at, config.timezone)}
              </td>
              <td className="nowrap">
                {a.patient_name && <div className="strong">{a.patient_name}</div>}
                <div className={a.patient_name ? 'muted' : ''}>{maskPhone(a.phone_masked)}</div>
              </td>
              <td>{formatDuration(a.duration_sec)}</td>
              <td>{a.language ?? '—'}</td>
              {showSummary && <td className="summary">{a.summary}</td>}
              <td><OutcomePill outcome={a.outcome} /></td>
              <td className="ta-c"><PlayButton row={a} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
