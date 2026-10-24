'use client';

import { useMemo, useState } from 'react';
import { useClinic } from '@/components/ClinicProvider';
import { Icon } from '@/components/Icon';
import { Card, Schedule } from '@/components/widgets';
import { appointmentsOn } from '@/lib/metrics';
import { addDays, formatDayLong, formatDayShort } from '@/lib/time';

export default function CalendarPage() {
  const { rows, today, config, labels } = useClinic();
  const [day, setDay] = useState(today);
  const appointments = useMemo(() => appointmentsOn(rows, day, config.timezone), [rows, day, config.timezone]);
  const strip = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(day, i - 3)), [day]);
  const counts = useMemo(
    () => Object.fromEntries(strip.map((k) => [k, appointmentsOn(rows, k, config.timezone).length])),
    [rows, strip, config.timezone],
  );

  return (
    <>
      <section className="page-head">
        <h1>Calendar</h1>
        <p>{labels.appointments} booked by the AI front desk, by {labels.practitioner.toLowerCase()}.</p>
      </section>

      <div className="day-strip card">
        <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day"><Icon name="chevronLeft" /></button>
        {strip.map((k) => {
          const { weekday, date } = formatDayShort(k);
          return (
            <button key={k} className={`day-chip ${k === day ? 'active' : ''} ${k === today ? 'is-today' : ''}`} onClick={() => setDay(k)}>
              <span className="wd">{k === today ? 'Today' : weekday}</span>
              <span className="dt">{date}</span>
              <span className="ct">{counts[k]} booked</span>
            </button>
          );
        })}
        <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} aria-label="Next day"><Icon name="chevronRight" /></button>
      </div>

      <Card
        title={formatDayLong(day)}
        icon="calendar"
        className="appts"
        action={day !== today && <button className="btn btn-ghost" onClick={() => setDay(today)}>Back to today</button>}
      >
        <Schedule appointments={appointments} day={day} />
        {!appointments.length && <p className="empty">No {labels.appointments.toLowerCase()} booked for this day.</p>}
      </Card>
    </>
  );
}
