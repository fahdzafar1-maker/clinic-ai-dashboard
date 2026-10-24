/**
 * The one place to configure the clinic.
 *
 * These are the defaults. Anything changed on the Settings page is saved to the
 * Supabase `settings` table (or the browser, in offline demo mode) and overrides
 * the values here.
 */
import { PRESETS } from './lib/presets';
import type { ClinicConfig, PresetKey } from './lib/types';

const preset: PresetKey = 'dental'; // 'dental' | 'aesthetic' | 'physio' | 'general'

export const clinicConfig: ClinicConfig = {
  name: 'Elite Clinic Dubai',
  tagline: PRESETS[preset].tagline,
  logoUrl: '', // e.g. '/logo.svg' (put the file in /public) — empty uses the preset icon
  primary: '#1593a3',
  accent: '#2bb6c4',
  preset,
  timezone: 'Asia/Dubai',
  openHour: 9,
  closeHour: 18,
  doctors: PRESETS[preset].doctors,
  services: PRESETS[preset].services,
};
