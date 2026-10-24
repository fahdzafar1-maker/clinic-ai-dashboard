import type { Doctor, Labels, Outcome, PresetKey, Service } from './types';

export interface Preset {
  key: PresetKey;
  label: string;
  tagline: string;
  icon: 'tooth' | 'sparkle' | 'activity' | 'stethoscope';
  labels: Labels;
  doctors: Doctor[];
  services: Service[];
  /** Sample conversation summaries used for demo data, per outcome. */
  quotes: Record<Outcome, string[]>;
}

const people: Labels = { patient: 'Patient', patients: 'Patients', practitioner: 'Doctor', appointment: 'Appointment', appointments: 'Appointments' };

export const PRESETS: Record<PresetKey, Preset> = {
  dental: {
    key: 'dental',
    label: 'Dental',
    tagline: 'Healthy Smiles. Brighter Futures.',
    icon: 'tooth',
    labels: people,
    doctors: [
      { name: 'Dr. Ahmed Khan', role: 'General Dentist' },
      { name: 'Dr. Sara Malik', role: 'Cosmetic Dentist' },
      { name: 'Dr. Omar Sheikh', role: 'Orthodontist' },
      { name: 'Dr. Layla Hassan', role: 'Periodontist' },
    ],
    services: [
      { name: 'General Checkup', minutes: 45 },
      { name: 'Cleaning', minutes: 45 },
      { name: 'Filling', minutes: 45 },
      { name: 'Teeth Whitening', minutes: 45 },
      { name: 'Braces Adjustment', minutes: 45 },
      { name: 'Extraction', minutes: 45 },
      { name: 'Veneers', minutes: 60 },
      { name: 'Consultation', minutes: 30 },
    ],
    quotes: {
      booked: ['Looking for teeth whitening. Booked for tomorrow.', 'Booked a cleaning for Saturday morning.', 'Toothache since yesterday, booked earliest slot.', 'Braces adjustment booked with the orthodontist.'],
      info: ['Do you offer Invisalign? What’s the price?', 'General inquiry about dental cleaning.', 'Asked if Daman insurance is accepted.', 'Wanted to know parking options near the clinic.'],
      forwarded: ['Requested appointment with Dr. Ahmed.', 'I want to reschedule my appointment.', 'Can I get a later slot this evening?', 'Swelling after extraction, wants to talk to the dentist.'],
      cancelled: ['Cancelled checkup, travelling this week.', 'Cancelled whitening, will rebook next month.'],
    },
  },
  aesthetic: {
    key: 'aesthetic',
    label: 'Aesthetic & Skin',
    tagline: 'Confidence, Naturally.',
    icon: 'sparkle',
    labels: { patient: 'Client', patients: 'Clients', practitioner: 'Specialist', appointment: 'Treatment', appointments: 'Treatments' },
    doctors: [
      { name: 'Dr. Nadia Rahman', role: 'Dermatologist' },
      { name: 'Dr. Elena Petrova', role: 'Aesthetic Physician' },
      { name: 'Dr. Karim Haddad', role: 'Plastic Surgeon' },
      { name: 'Mira Costa', role: 'Laser Therapist' },
    ],
    services: [
      { name: 'Skin Consultation', minutes: 30 },
      { name: 'Botox', minutes: 30 },
      { name: 'Dermal Fillers', minutes: 45 },
      { name: 'HydraFacial', minutes: 60 },
      { name: 'Laser Hair Removal', minutes: 45 },
      { name: 'Chemical Peel', minutes: 45 },
      { name: 'PRP Therapy', minutes: 60 },
    ],
    quotes: {
      booked: ['Booked a HydraFacial for Friday afternoon.', 'Botox follow-up booked with Dr. Elena.', 'Laser hair removal session 3 booked.', 'Booked a skin consultation for acne scars.'],
      info: ['How much is a full-face laser package?', 'Is there downtime after a chemical peel?', 'Asked about filler aftercare.', 'Do you have offers on HydraFacial this month?'],
      forwarded: ['Wants to discuss rhinoplasty with the surgeon.', 'Redness after peel, asked for the doctor.', 'Requested a call back about PRP results.', 'Needs a quote for a combined treatment plan.'],
      cancelled: ['Cancelled laser session, feeling unwell.', 'Cancelled Botox, will rebook after Ramadan.'],
    },
  },
  physio: {
    key: 'physio',
    label: 'Physiotherapy',
    tagline: 'Move Better. Live Better.',
    icon: 'activity',
    labels: { patient: 'Patient', patients: 'Patients', practitioner: 'Therapist', appointment: 'Session', appointments: 'Sessions' },
    doctors: [
      { name: 'Lukas Weber', role: 'Sports Physiotherapist' },
      { name: 'Aisha Noor', role: 'Musculoskeletal Physio' },
      { name: 'Tom Hendriks', role: 'Rehabilitation Specialist' },
      { name: 'Dr. Priya Menon', role: 'Chiropractor' },
    ],
    services: [
      { name: 'Initial Assessment', minutes: 60 },
      { name: 'Follow-up Session', minutes: 45 },
      { name: 'Sports Massage', minutes: 45 },
      { name: 'Dry Needling', minutes: 30 },
      { name: 'Post-op Rehab', minutes: 60 },
      { name: 'Chiropractic Adjustment', minutes: 30 },
    ],
    quotes: {
      booked: ['Lower back pain, booked an initial assessment.', 'Booked sports massage before the marathon.', 'Knee rehab follow-up booked for Monday.', 'Booked dry needling with Aisha.'],
      info: ['Do you need a referral for physio?', 'Is physiotherapy covered by my insurance?', 'Asked how many sessions are usually needed.', 'What should I wear for the first session?'],
      forwarded: ['Post-surgery patient wants to speak to the therapist.', 'Sharp shoulder pain, asked for advice.', 'Wants to change therapist for ongoing plan.', 'Requested a home-visit quote.'],
      cancelled: ['Cancelled session due to work travel.', 'Cancelled follow-up, pain has improved.'],
    },
  },
  general: {
    key: 'general',
    label: 'General Clinic',
    tagline: 'Caring for Every Generation.',
    icon: 'stethoscope',
    labels: people,
    doctors: [
      { name: 'Dr. Hassan Ali', role: 'General Practitioner' },
      { name: 'Dr. Sophie Laurent', role: 'Family Medicine' },
      { name: 'Dr. Rami Aziz', role: 'Paediatrician' },
      { name: 'Dr. Fatima Zahra', role: 'Internal Medicine' },
    ],
    services: [
      { name: 'GP Consultation', minutes: 30 },
      { name: 'Follow-up', minutes: 15 },
      { name: 'Health Check', minutes: 60 },
      { name: 'Vaccination', minutes: 15 },
      { name: 'Child Wellness Visit', minutes: 30 },
      { name: 'Blood Test Review', minutes: 30 },
    ],
    quotes: {
      booked: ['Fever for two days, booked GP consultation.', 'Booked annual health check for next week.', 'Child vaccination booked with Dr. Rami.', 'Booked blood test review for Thursday.'],
      info: ['What are your opening hours on Friday?', 'Do you offer walk-in appointments?', 'Asked about the cost of a full health check.', 'Do you issue sick leave certificates?'],
      forwarded: ['Chest discomfort, forwarded to the doctor urgently.', 'Wants to discuss lab results with the doctor.', 'Prescription refill request for the doctor.', 'Parent asking about a child’s rash.'],
      cancelled: ['Cancelled consultation, feeling better.', 'Cancelled health check, will rebook.'],
    },
  },
};

export const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[];
