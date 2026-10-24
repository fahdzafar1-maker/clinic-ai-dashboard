'use client';

import { useParams } from 'next/navigation';
import AiCallsPage from '@/components/pages/AiCallsPage';
import CalendarPage from '@/components/pages/CalendarPage';
import Dashboard from '@/components/pages/Dashboard';
import ReportsPage from '@/components/pages/ReportsPage';
import SettingsPage from '@/components/pages/SettingsPage';
import WhatsAppPage from '@/components/pages/WhatsAppPage';

// /demo/<slug>            → Dashboard
// /demo/<slug>/calendar   → Calendar, etc. Branding comes from ClinicProvider (demo mode).
const PAGES: Record<string, React.ComponentType> = {
  calendar: CalendarPage,
  'ai-calls': AiCallsPage,
  whatsapp: WhatsAppPage,
  reports: ReportsPage,
  settings: SettingsPage,
};

export default function DemoPage() {
  const params = useParams<{ slug: string; page?: string[] }>();
  const Page = (params.page?.[0] && PAGES[params.page[0]]) || Dashboard;
  return <Page />;
}
