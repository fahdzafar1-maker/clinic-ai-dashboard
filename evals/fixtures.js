// Fixture clinics for the evals (copies of real demo configs, no secrets). "now" is fixed so dates are repeatable.
module.exports = {
  now: { iso: '2026-10-30T10:00:00Z', label: 'Friday 30 October 2026, 10:00' }, // clinic local time (Europe/London, GMT)

  bushy: {
    id: '00000000-0000-0000-0000-00000000b001',
    name: 'Bushy Park Dental Clinic',
    slug: 'eval-bushy',
    callerPhone: '+447700900123',
    config: {
      preset: 'dental', countryCode: '44', timezone: 'Europe/London', city: 'Hampton Hill', enrichedAt: '2026-10-29T20:00:25Z',
      schedule: { tue: '10:00-20:00', wed: '09:00-15:00', thu: '09:00-17:00', fri: '09:00-17:00' },
      doctors: [
        { name: 'Dr. Smret Zerai', role: 'Dentist' },
        { name: 'Dr. Alex Weeks', role: 'Dentist (Oral Surgery)' },
        { name: 'Collin', role: 'Dental Hygienist' }
      ],
      services: [
        { name: 'New Patient Comprehensive Examination', minutes: 30 }, { name: 'Emergency Appointment', minutes: 30 },
        { name: 'Guided Biofilm Therapy (GBT Clean)', minutes: 45 }, { name: 'Composite Fillings', minutes: 45 },
        { name: 'Crowns', minutes: 60 }, { name: 'Ceramic Veneers', minutes: 60 }, { name: 'Tooth Whitening', minutes: 60 },
        { name: 'Tooth Extraction', minutes: 30 }, { name: 'Root Canal Treatment', minutes: 60 }, { name: 'Dental Implants', minutes: 90 }
      ],
      receptionist: {
        name: 'Sara', languages: ['en'], voice: 'vapi',
        greeting: 'Hello, Bushy Park Dental Clinic, this is Sara. How can I help you?',
        knowledge: [
          'OPENING HOURS: Tuesday 10:00-20:00, Wednesday 09:00-15:00, Thursday & Friday 09:00-17:00, Saturday by appointment, Sunday closed.',
          'ADDRESS: 25 High Street, Hampton Hill, Middlesex, TW12 1NB.',
          'CONTACT: Phone 020 8941 9090, email reception@bushyparkdental.co.uk.',
          'TEAM: Dr. Smret Zerai (Dentist), Dr. Alex Weeks (Dentist with special interest in Oral Surgery), Collin (Dental Hygienist).',
          'NEW PATIENT OFFER: THURSDAYS ONLY - £59 comprehensive examination including 2 X-rays.',
          'FEES: New patient comprehensive examination (includes 2 X-rays) £80. Existing patient examination £65.',
          'FEES: New patient emergency appointment £90. Existing patient emergency appointment £75.',
          'FEES: Composite fillings from £195. Crowns from £850. Ceramic veneers from £950. Tooth whitening from £395.',
          'FEES: Root canal treatment from £495 (front tooth) to £695 (molar). Implant consultation £100, placement and crown from £3200.',
          'PAYMENT: Payment on the day of treatment; most major cards or cash.',
          'CANCELLATION: No charge with at least 2 full working days notice; missed appointments are charged.'
        ].join('\n')
      }
    },
    // Already booked in the mock calendar (local time).
    booked: [
      { day: '2026-11-03', time: '12:00', doctor: 'Dr. Smret Zerai', minutes: 30 },
      { day: '2026-11-05', time: '10:00', doctor: 'Dr. Smret Zerai', minutes: 30 },
      { day: '2026-11-05', time: '10:00', doctor: 'Dr. Alex Weeks', minutes: 30 },
      { day: '2026-11-05', time: '10:00', doctor: 'Collin', minutes: 30 }
    ]
  }
};
