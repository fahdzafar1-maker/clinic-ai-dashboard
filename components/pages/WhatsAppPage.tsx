'use client';

import { useMemo, useState } from 'react';
import { useClinic } from '@/components/ClinicProvider';
import { Chips } from '@/components/Filters';
import { ActivityFeed, Card } from '@/components/widgets';
import { addDays, dayKey } from '@/lib/time';
import type { Activity } from '@/lib/types';

type Kind = 'chats' | 'reminders' | 'web';

export default function WhatsAppPage() {
  const { rows, today, config } = useClinic();
  const [kind, setKind] = useState<Kind>('chats');
  const lists = useMemo(() => {
    const recent = rows.filter((r) => dayKey(r.created_at, config.timezone) >= addDays(today, -6));
    return {
      chats: recent.filter((r) => r.channel === 'whatsapp' && r.event !== 'reminder'),
      reminders: recent.filter((r) => r.event === 'reminder'),
      web: recent.filter((r) => r.channel === 'web'),
    } satisfies Record<Kind, Activity[]>;
  }, [rows, today, config.timezone]);

  return (
    <>
      <section className="page-head">
        <h1>WhatsApp</h1>
        <p>Conversations from the WhatsApp bot and website assistant, last 7 days.</p>
      </section>
      <div className="toolbar">
        <Chips<Kind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'chats', label: 'WhatsApp chats', count: lists.chats.length },
            { value: 'reminders', label: 'Reminders sent', count: lists.reminders.length },
            { value: 'web', label: 'Website chats', count: lists.web.length },
          ]}
        />
      </div>
      <Card title="Conversations" icon="whatsapp" className="activity">
        <ActivityFeed rows={lists[kind]} limit={200} empty="Nothing here in the last 7 days." />
      </Card>
    </>
  );
}
