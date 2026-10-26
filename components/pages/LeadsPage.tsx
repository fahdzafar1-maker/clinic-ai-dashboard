'use client';

import { useEffect, useState } from 'react';
import { ActiveDemos } from '@/components/ActiveDemos';
import { useClinic } from '@/components/ClinicProvider';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/widgets';
import { useSearch } from '@/components/Shell';
import { PRESETS } from '@/lib/presets';
import { supabase } from '@/lib/supabase';
import type { PresetKey } from '@/lib/types';

interface Lead {
  id: string;
  created_at: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  clinic_name: string | null;
  clinic_type: string | null;
  city: string | null;
  website: string | null;
  source: string;
  status: string;
  demo_views: number;
  last_viewed_at: string | null;
  clinics: { slug: string; status: string } | null;
}

const STATUSES = ['new', 'demo_sent', 'contacted', 'trial', 'won', 'lost'];

function ago(iso: string | null) {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** Hot = opened the demo several times, or within the last hour. */
const isHot = (l: Lead) => l.demo_views >= 3 || (!!l.last_viewed_at && Date.now() - new Date(l.last_viewed_at).getTime() < 3600_000);

export default function LeadsPage() {
  const { isAdmin, mode } = useClinic();
  const q = useSearch();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase || !isAdmin) return;
    const load = () =>
      supabase!.from('leads').select('*, clinics(slug, status)').order('created_at', { ascending: false }).limit(500)
        .then(({ data, error }) => { if (error) setError(error.message); else setLeads((data ?? []) as Lead[]); });
    load();
    const ch = supabase.channel('leads').on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, load).subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [isAdmin]);

  if (mode !== 'app' || !isAdmin) return <p className="empty">Only agency admins can see leads.</p>;

  async function setStatus(id: string, status: string) {
    setLeads((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await supabase!.from('leads').update({ status }).eq('id', id);
    if (error) setError(error.message);
  }

  const list = leads.filter((l) => !q || [l.clinic_name, l.contact_name, l.phone, l.email, l.city].some((v) => v?.toLowerCase().includes(q)));
  const hot = leads.filter(isHot).length;

  return (
    <>
      <section className="page-head">
        <h1>Leads & demos</h1>
        <p>Every demo request, who opened their demo, and where each lead is in the pipeline.</p>
      </section>
      <section className="stats">
        <div className="card stat"><div className="stat-label">Demo requests</div><div className="stat-value">{leads.length}</div></div>
        <div className="card stat"><div className="stat-label">Opened their demo</div><div className="stat-value">{leads.filter((l) => l.demo_views > 0).length}</div></div>
        <div className="card stat"><div className="stat-label">🔥 Hot right now</div><div className="stat-value">{hot}</div></div>
        <div className="card stat"><div className="stat-label">In trial / won</div><div className="stat-value">{leads.filter((l) => l.status === 'trial' || l.status === 'won').length}</div></div>
      </section>
      {error && <div className="banner banner-error">{error}</div>}
      <div className="demos-block"><ActiveDemos /></div>
      <Card title={`${list.length} leads`} icon="users">
        {!list.length ? <p className="empty">No demo requests yet. Share your /get-demo link to start.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Received</th><th>Clinic</th><th>Contact</th><th>Source</th><th>Demo views</th><th>Last opened</th><th>Status</th><th>Demo</th></tr>
              </thead>
              <tbody>
                {list.map((l) => (
                  <tr key={l.id}>
                    <td className="nowrap">{ago(l.created_at)}</td>
                    <td>
                      <div className="strong">{isHot(l) && '🔥 '}{l.clinic_name}</div>
                      <div className="muted">{PRESETS[l.clinic_type as PresetKey]?.label ?? l.clinic_type} · {l.city}</div>
                    </td>
                    <td className="nowrap">
                      <div>{l.contact_name}</div>
                      {l.phone && <a className="link" href={`https://wa.me/${l.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{l.phone}</a>}
                      {l.email && <div className="muted">{l.email}</div>}
                    </td>
                    <td>{l.source}</td>
                    <td className="ta-c">{l.demo_views}</td>
                    <td className="nowrap">{ago(l.last_viewed_at)}</td>
                    <td>
                      <select className="select" value={l.status} onChange={(e) => setStatus(l.id, e.target.value)}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                    </td>
                    <td>
                      {l.clinics?.status === 'demo'
                        ? <a className="link" href={`/demo/${l.clinics.slug}`} target="_blank" rel="noreferrer">Open <Icon name="arrowRight" /></a>
                        : <span className="muted">{l.clinics?.status ?? '—'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
