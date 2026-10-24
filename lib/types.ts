export type Channel = 'call' | 'whatsapp' | 'voice_note' | 'web';
export type Outcome = 'booked' | 'forwarded' | 'info' | 'cancelled';
/** conversation = normal inbound contact; the other two power the "missed calls recovered" and "reminders sent" KPIs. */
export type EventKind = 'conversation' | 'missed_call_recovered' | 'reminder';

/** One row of the Supabase `activity` table. */
export interface Activity {
  id: string;
  created_at: string;
  channel: Channel;
  patient_name: string | null;
  phone_masked: string | null;
  language: string | null;
  summary: string | null;
  outcome: Outcome;
  duration_sec: number | null;
  recording_url: string | null;
  appointment_time: string | null;
  doctor: string | null;
  event: EventKind;
  service: string | null;
}

export interface Doctor {
  name: string;
  role: string;
}

export interface Service {
  name: string;
  minutes: number;
}

export type PresetKey = 'dental' | 'aesthetic' | 'physio' | 'general';

export interface Labels {
  /** "Patient" / "Client" */
  patient: string;
  patients: string;
  /** "Doctor" / "Therapist" / "Specialist" */
  practitioner: string;
  /** "Appointment" / "Session" / "Treatment" */
  appointment: string;
  appointments: string;
}

export interface ClinicConfig {
  name: string;
  tagline: string;
  /** Image URL (or /public path). Empty = the preset's built-in icon. */
  logoUrl: string;
  primary: string;
  accent: string;
  preset: PresetKey;
  /** IANA timezone the clinic runs in; "today" and calendar hours use it. */
  timezone: string;
  /** Opening hours shown on the calendar, 24h clock. */
  openHour: number;
  closeHour: number;
  doctors: Doctor[];
  services: Service[];
}

export interface AppSettings {
  demo_mode: boolean;
  retention_days: 3 | 7;
}
