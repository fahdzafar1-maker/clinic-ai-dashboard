'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useClinic } from '@/components/ClinicProvider';
import { Icon } from '@/components/Icon';
import { ActivityFeed, CallsTable, Card, KpiGrid, Schedule, WeeklyChart } from '@/components/widgets';
import { appointmentsOn } from '@/lib/metrics';

export default function Dashboard() {
  const { rows, today, config, labels, href } = useClinic();
  const appointments = useMemo(() => appointmentsOn(rows, today, config.timezone), [rows, today, config.timezone]);
  const conversations = useMemo(() => rows.filter((r) => r.event === 'conversation'), [rows]);
  const calls = useMemo(() => rows.filter((r) => r.channel === 'call' || r.channel === 'voice_note').slice(0, 6), [rows]);

  return (
    <>
      <section className="page-head">
        <h1>Today&apos;s Overview</h1>
        <p>AI agents are working 24/7 to bring more {labels.patients.toLowerCase()} to your clinic.</p>
      </section>

      <KpiGrid />

      <section className="row row-top">
        <Card
          title={`Today's ${labels.appointments}`}
          icon="calendar"
          className="appts"
          action={<Link href={href('/calendar')} className="link">View calendar <Icon name="arrowRight" /></Link>}
        >
          <Schedule appointments={appointments} day={today} />
        </Card>

        <Card title="Live AI Activity" icon="activity" className="activity" action={<span className="live"><i />Live</span>}>
          <ActivityFeed rows={conversations} />
        </Card>
      </section>

      <section className="row row-bottom">
        <WeeklyChart />
        <Card
          title="Recent Calls"
          icon="phone"
          className="calls"
          action={<Link href={href('/ai-calls')} className="link">View all <Icon name="arrowRight" /></Link>}
        >
          <CallsTable rows={calls} />
        </Card>
      </section>
    </>
  );
}
