'use client';

import { useMemo, useState } from 'react';
import { useClinic } from '@/components/ClinicProvider';
import { Chips } from '@/components/Filters';
import { CallsTable, Card } from '@/components/widgets';
import { addDays, dayKey } from '@/lib/time';
import type { Outcome } from '@/lib/types';

type Range = 'today' | '7d' | 'all';

export default function AiCallsPage() {
  const { rows, today, config } = useClinic();
  const [range, setRange] = useState<Range>('today');
  const [outcome, setOutcome] = useState<Outcome | 'all'>('all');

  const inRange = useMemo(() => {
    const from = range === 'today' ? today : range === '7d' ? addDays(today, -6) : '0000-00-00';
    return rows.filter((r) => (r.channel === 'call' || r.channel === 'voice_note') && dayKey(r.created_at, config.timezone) >= from);
  }, [rows, range, today, config.timezone]);
  const list = outcome === 'all' ? inRange : inRange.filter((r) => r.outcome === outcome);
  const count = (o: Outcome) => inRange.filter((r) => r.outcome === o).length;

  return (
    <>
      <section className="page-head">
        <h1>AI Calls</h1>
        <p>Every phone call and voice note the AI receptionist handled.</p>
      </section>
      <div className="toolbar">
        <Chips<Range>
          value={range}
          onChange={setRange}
          options={[{ value: 'today', label: 'Today' }, { value: '7d', label: 'Last 7 days' }, { value: 'all', label: 'All' }]}
        />
        <Chips<Outcome | 'all'>
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: 'all', label: 'All', count: inRange.length },
            { value: 'booked', label: 'Booked', count: count('booked') },
            { value: 'info', label: 'Info given', count: count('info') },
            { value: 'forwarded', label: 'Forwarded', count: count('forwarded') },
            { value: 'cancelled', label: 'Cancelled', count: count('cancelled') },
          ]}
        />
      </div>
      <Card title={`${list.length} calls`} icon="phoneCall">
        <CallsTable rows={list} showDate={range !== 'today'} showSummary />
      </Card>
    </>
  );
}
