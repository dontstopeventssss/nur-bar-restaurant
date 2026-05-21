'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const FullCalendar = dynamic(() => import('@fullcalendar/react'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        padding: 16,
        border: '1px solid #d9d9d9',
        borderRadius: 10,
        background: '#fff',
        color: '#111',
        fontWeight: 600,
      }}
    >
      Caricamento calendario…
    </div>
  ),
});

type ReservationStatus = 'confirmed' | 'cancelled';

type Reservation = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  reservation_time: string;
  guests: number;
  table_id: string | null;
  notes: string | null;
  status: ReservationStatus;
  created_at?: string;
};

type TableRow = {
  id: string;
  name: string;
  seats?: number | null;
};

type AppSettingsRow = {
  key: string;
  value_number: number | null;
};

type ReservationForm = {
  customer_name: string;
  customer_phone: string;
  reservation_date: string;
  reservation_hour: string;
  guests: number;
  table_id: string;
  notes: string;
};

const UI = {
  bg: '#f6f3ee',
  surface: '#ffffff',
  surfaceAlt: '#faf8f5',
  border: '#ddd6cf',
  text: '#161616',
  textSoft: '#6f6a64',
  primary: '#111111',
  success: '#1f7a1f',
  danger: '#b42318',
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toLocalDateTimeString(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:00`;
}

function getDatePart(isoString: string) {
  return isoString.slice(0, 10);
}

function getTimePart(isoString: string) {
  return isoString.slice(11, 16);
}

function buildReservationDateTime(date: string, hour: string) {
  return `${date}T${hour}:00`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

function formatHumanDate(value: string) {
  const d = new Date(`${value}T12:00:00`);
  return d.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatHumanDateTime(value: string) {
  const d = new Date(value);
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CalendarPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [tables, setTables] = useState<TableRow[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [venueCapacity, setVenueCapacity] = useState<number>(0);

  const [selectedDate, setSelectedDate] = useState<string>(toDateInputValue(new Date()));
  const [currentView, setCurrentView] = useState<'timeGridDay' | 'listWeek'>(
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'listWeek' : 'timeGridDay'
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingReservationId, setEditingReservationId] = useState<string | null>(null);

  const [form, setForm] = useState<ReservationForm>({
    customer_name: '',
    customer_phone: '',
    reservation_date: toDateInputValue(new Date()),
    reservation_hour: '20:00',
    guests: 2,
    table_id: '',
    notes: '',
  });

  const [loadedRange, setLoadedRange] = useState<{ start: string; end: string } | null>(null);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    router.prefetch('/staff');
    router.prefetch('/owner');
  }, [router]);

  const loadStaticData = useCallback(async () => {
    const [{ data: tablesData, error: tablesError }, { data: settingsData, error: settingsError }] =
      await Promise.all([
        supabase.from('tables').select('id, name, seats').order('name', { ascending: true }),
        supabase.from('app_settings').select('key, value_number').eq('key', 'max_capacity').single(),
      ]);

    if (tablesError) {
      console.error('Errore caricamento tavoli', tablesError);
    } else {
      setTables((tablesData as TableRow[]) ?? []);
    }

    if (settingsError) {
      console.error('Errore caricamento capienza massima', settingsError);
    } else {
      setVenueCapacity(Number((settingsData as AppSettingsRow | null)?.value_number ?? 0));
    }
  }, []);

  const loadReservationsRange = useCallback(async (start: string, end: string) => {
    const { data, error } = await supabase
      .from('reservations')
      .select(
        'id, customer_name, customer_phone, reservation_time, guests, table_id, notes, status, created_at'
      )
      .gte('reservation_time', start)
      .lte('reservation_time', end)
      .order('reservation_time', { ascending: true });

    if (error) {
      console.error('Errore caricamento prenotazioni', error);
      return;
    }

    setReservations((data as Reservation[]) ?? []);
    setLoadedRange({ start, end });
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);

      const now = new Date();
      const initialStart = toLocalDateTimeString(addDays(startOfMonth(now), -14));
      const initialEnd = toLocalDateTimeString(addDays(endOfMonth(addDays(now, 60)), 14));

      await Promise.all([loadStaticData(), loadReservationsRange(initialStart, initialEnd)]);
      setLoading(false);
    };

    run();
  }, [loadReservationsRange, loadStaticData]);

  const calendarEvents = useMemo(() => {
    return reservations.map((reservation) => {
      const tableName = tables.find((t) => t.id === reservation.table_id)?.name;
      const titleParts = [
        reservation.customer_name,
        `${reservation.guests} pax`,
        tableName ? `Tavolo ${tableName}` : null,
      ].filter(Boolean);

      return {
        id: reservation.id,
        title: titleParts.join(' • '),
        start: reservation.reservation_time,
        allDay: false,
        backgroundColor: reservation.status === 'cancelled' ? '#f3b3b3' : '#111111',
        borderColor: reservation.status === 'cancelled' ? '#f3b3b3' : '#111111',
        textColor: reservation.status === 'cancelled' ? '#6a1b1b' : '#ffffff',
      };
    });
  }, [reservations, tables]);

  const reservationsOfSelectedDate = useMemo(() => {
    return reservations
      .filter((r) => getDatePart(r.reservation_time) === selectedDate)
      .sort((a, b) => a.reservation_time.localeCompare(b.reservation_time));
  }, [reservations, selectedDate]);

  const totalGuestsOfSelectedDay = useMemo(() => {
    return reservationsOfSelectedDate
      .filter((r) => r.status !== 'cancelled')
      .reduce((sum, r) => sum + Number(r.guests || 0), 0);
  }, [reservationsOfSelectedDate]);

  function resetForm(date?: string) {
    setEditingReservationId(null);
    setForm({
      customer_name: '',
      customer_phone: '',
      reservation_date: date ?? selectedDate ?? toDateInputValue(new Date()),
      reservation_hour: '20:00',
      guests: 2,
      table_id: '',
      notes: '',
    });
  }

  function openNewReservation(date?: Date) {
    const pickedDate = date ? toDateInputValue(date) : selectedDate;
    setSelectedDate(pickedDate);
    resetForm(pickedDate);
    setModalOpen(true);
  }

  function openEditReservation(reservation: Reservation) {
    setEditingReservationId(reservation.id);
    setForm({
      customer_name: reservation.customer_name ?? '',
      customer_phone: reservation.customer_phone ?? '',
      reservation_date: getDatePart(reservation.reservation_time),
      reservation_hour: getTimePart(reservation.reservation_time),
      guests: reservation.guests ?? 2,
      table_id: reservation.table_id ?? '',
      notes: reservation.notes ?? '',
    });
    setModalOpen(true);
  }

  function handleDateClick(arg: DateClickArg) {
    const clickedDate = arg.dateStr.slice(0, 10);
    setSelectedDate(clickedDate);

    if (isMobile && currentView !== 'timeGridDay') {
      setCurrentView('timeGridDay');
    }

    openNewReservation(arg.date);
  }

  async function handleSaveReservation(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim() || null,
      reservation_time: buildReservationDateTime(form.reservation_date, form.reservation_hour),
      guests: Number(form.guests),
      table_id: form.table_id || null,
      notes: form.notes.trim() || null,
      status: 'confirmed' as ReservationStatus,
    };

    if (!payload.customer_name) {
      alert('Inserisci il nome cliente');
      setSaving(false);
      return;
    }

    let error: any = null;

    if (editingReservationId) {
      const result = await supabase
        .from('reservations')
        .update(payload)
        .eq('id', editingReservationId);

      error = result.error;
    } else {
      const result = await supabase.from('reservations').insert(payload);
      error = result.error;
    }

    if (error) {
      console.error('Errore salvataggio prenotazione', error);
      alert('Errore durante il salvataggio della prenotazione');
      setSaving(false);
      return;
    }

    const refreshStart =
      loadedRange?.start ?? toLocalDateTimeString(addDays(startOfMonth(new Date(form.reservation_date)), -14));
    const refreshEnd =
      loadedRange?.end ?? toLocalDateTimeString(addDays(endOfMonth(new Date(form.reservation_date)), 14));

    await loadReservationsRange(refreshStart, refreshEnd);

    setModalOpen(false);
    setSaving(false);
  }

  async function handleDeleteReservation(id: string) {
    const confirmDelete = window.confirm('Vuoi davvero eliminare questa prenotazione?');
    if (!confirmDelete) return;

    setDeleting(true);

    const { error } = await supabase.from('reservations').delete().eq('id', id);

    if (error) {
      console.error('Errore cancellazione prenotazione', error);
      alert('Errore durante la cancellazione');
      setDeleting(false);
      return;
    }

    setReservations((prev) => prev.filter((r) => r.id !== id));

    if (editingReservationId === id) {
      setModalOpen(false);
    }

    setDeleting(false);
  }

  async function handleSoftCancelReservation(id: string) {
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      console.error('Errore annullamento prenotazione', error);
      alert('Errore durante l’annullamento');
      return;
    }

    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r))
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: UI.bg,
        color: UI.text,
        padding: isMobile ? 12 : 20,
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          display: 'grid',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'stretch' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, marginBottom: 4 }}>
              Calendar
            </h1>
            <p style={{ color: UI.textSoft, fontSize: 14 }}>
              Prenotazioni sala con vista giorno e settimana.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => router.push('/staff')}
              style={{
                padding: '10px 14px',
                minHeight: 42,
                borderRadius: 10,
                border: `1px solid ${UI.border}`,
                background: '#fff',
                color: UI.text,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Staff
            </button>

            <button
              type="button"
              onClick={() => router.push('/owner')}
              style={{
                padding: '10px 14px',
                minHeight: 42,
                borderRadius: 10,
                border: `1px solid ${UI.border}`,
                background: '#fff',
                color: UI.text,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Owner
            </button>

            <button
              type="button"
              onClick={() => openNewReservation(new Date())}
              style={{
                padding: '10px 14px',
                minHeight: 42,
                borderRadius: 10,
                border: '1px solid #111',
                background: '#111',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Nuova prenotazione
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.45fr) minmax(320px, 420px)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <div
            style={{
              backgroundColor: UI.surface,
              border: `1px solid ${UI.border}`,
              borderRadius: 12,
              padding: isMobile ? 8 : 12,
              overflow: 'hidden',
              minHeight: 420,
            }}
          >
            <style>{`
              .nur-calendar .fc .fc-toolbar {
                gap: 8px;
              }

              .nur-calendar .fc .fc-button {
                border-radius: 8px;
                padding: 8px 10px;
                font-size: 12px;
                font-weight: 700;
                border: 1px solid ${UI.border};
                background: ${UI.surface};
                color: ${UI.text};
                box-shadow: none;
              }

              .nur-calendar .fc .fc-button-primary:not(:disabled).fc-button-active,
              .nur-calendar .fc .fc-button-primary:not(:disabled):active {
                background: ${UI.primary};
                border-color: ${UI.primary};
                color: #fff;
              }

              .nur-calendar .fc .fc-button-primary:hover {
                background: #f7f7f7;
                border-color: ${UI.border};
                color: ${UI.text};
              }

              .nur-calendar .fc .fc-toolbar-title {
                font-size: 18px;
                font-weight: 800;
                color: ${UI.text};
              }

              .nur-calendar .fc .fc-col-header-cell-cushion,
              .nur-calendar .fc .fc-timegrid-axis-cushion,
              .nur-calendar .fc .fc-timegrid-slot-label-cushion,
              .nur-calendar .fc .fc-list-day-text,
              .nur-calendar .fc .fc-list-day-side-text {
                color: ${UI.text};
                text-decoration: none;
                font-weight: 700;
              }

              .nur-calendar .fc .fc-day-today {
                background: #f6efe8 !important;
              }

              .nur-calendar .fc .fc-event {
                border-radius: 8px;
                padding: 2px 4px;
              }

              @media (max-width: 767px) {
                .nur-calendar .fc .fc-header-toolbar {
                  display: flex;
                  flex-direction: column;
                  align-items: stretch;
                  gap: 8px;
                }

                .nur-calendar .fc .fc-toolbar-chunk {
                  display: flex;
                  justify-content: center;
                  flex-wrap: wrap;
                  gap: 6px;
                }

                .nur-calendar .fc .fc-toolbar-title {
                  font-size: 16px;
                  text-align: center;
                }

                .nur-calendar .fc .fc-button {
                  min-height: 40px;
                  padding: 8px 10px;
                  font-size: 12px;
                }

                .nur-calendar .fc .fc-list-event-title,
                .nur-calendar .fc .fc-list-event-time {
                  font-size: 13px;
                }
              }
            `}</style>

            <div className="nur-calendar">
              {loading ? (
                <div style={{ padding: 16, color: UI.text }}>Caricamento calendario…</div>
              ) : (
                <FullCalendar
                  plugins={[timeGridPlugin, interactionPlugin, listPlugin]}
                  initialView={isMobile ? 'listWeek' : 'timeGridDay'}
                  locale="it"
                  headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'timeGridDay,listWeek',
                  }}
                  buttonText={{
                    today: 'Oggi',
                    day: 'Giorno',
                    listWeek: 'Settimana',
                  }}
                  initialDate={selectedDate}
                  height="auto"
                  editable={false}
                  selectable
                  datesSet={async (info) => {
                    setCurrentView(info.view.type as 'timeGridDay' | 'listWeek');

                    const start = info.startStr.slice(0, 19);
                    const end = info.endStr.slice(0, 19);

                    if (!loadedRange || start < loadedRange.start || end > loadedRange.end) {
                      await loadReservationsRange(start, end);
                    }

                    if (info.view.type === 'timeGridDay') {
                      setSelectedDate(info.startStr.slice(0, 10));
                    }
                  }}
                  eventTimeFormat={{
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  }}
                  dateClick={(arg) => {
                    const clickedDate = arg.dateStr.slice(0, 10);
                    setSelectedDate(clickedDate);
                    handleDateClick(arg);
                  }}
                  eventClick={(arg) => {
                    const reservation = reservations.find((r) => r.id === arg.event.id);
                    if (!reservation) return;
                    setSelectedDate(getDatePart(reservation.reservation_time));
                    openEditReservation(reservation);
                  }}
                  events={calendarEvents}
                />
              )}
            </div>
          </div>

          <aside
            style={{
              display: 'grid',
              gap: 12,
            }}
          >
            <div
              style={{
                background: UI.surface,
                border: `1px solid ${UI.border}`,
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
                    Giorno selezionato
                  </h2>
                  <div style={{ color: UI.textSoft, fontSize: 13, fontWeight: 600 }}>
                    {formatHumanDate(selectedDate)}
                  </div>
                </div>

                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: `1px solid ${UI.border}`,
                    background: '#fff',
                    color: UI.text,
                    minHeight: 40,
                  }}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <div
                  style={{
                    background: UI.surfaceAlt,
                    border: `1px solid ${UI.border}`,
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <div style={{ fontSize: 12, color: UI.textSoft, fontWeight: 700 }}>
                    Prenotazioni
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>
                    {reservationsOfSelectedDate.length}
                  </div>
                </div>

                <div
                  style={{
                    background: UI.surfaceAlt,
                    border: `1px solid ${UI.border}`,
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <div style={{ fontSize: 12, color: UI.textSoft, fontWeight: 700 }}>
                    Coperti
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>
                    {totalGuestsOfSelectedDay}
                    {venueCapacity > 0 ? (
                      <span style={{ fontSize: 12, color: UI.textSoft, marginLeft: 6 }}>
                        / {venueCapacity}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                background: UI.surface,
                border: `1px solid ${UI.border}`,
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 8,
                  marginBottom: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800 }}>
                    Lista prenotazioni
                  </h2>
                  <div style={{ fontSize: 13, color: UI.textSoft, fontWeight: 600, marginTop: 4 }}>
                    Giorno selezionato: {formatHumanDate(selectedDate)}
                  </div>
                </div>
              </div>

              {reservationsOfSelectedDate.length === 0 ? (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    background: UI.surfaceAlt,
                    border: `1px dashed ${UI.border}`,
                    color: UI.textSoft,
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  Nessuna prenotazione per il giorno selezionato.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {reservationsOfSelectedDate.map((reservation) => {
                    const tableName = tables.find((t) => t.id === reservation.table_id)?.name ?? '—';

                    return (
                      <div
                        key={reservation.id}
                        style={{
                          border: `1px solid ${UI.border}`,
                          borderRadius: 10,
                          padding: 12,
                          background: reservation.status === 'cancelled' ? '#fff5f5' : '#fff',
                          opacity: reservation.status === 'cancelled' ? 0.75 : 1,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            alignItems: 'flex-start',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontWeight: 800, fontSize: 16 }}>
                              {reservation.customer_name}
                            </div>
                            <div style={{ color: UI.textSoft, fontSize: 13, fontWeight: 600 }}>
                              {formatHumanDateTime(reservation.reservation_time)}
                            </div>
                            <div style={{ color: UI.textSoft, fontSize: 13 }}>
                              {reservation.guests} coperti • Tavolo {tableName}
                            </div>
                            {reservation.customer_phone ? (
                              <div style={{ color: UI.textSoft, fontSize: 13 }}>
                                Tel: {reservation.customer_phone}
                              </div>
                            ) : null}
                            {reservation.notes ? (
                              <div style={{ color: UI.textSoft, fontSize: 13 }}>
                                Note: {reservation.notes}
                              </div>
                            ) : null}
                          </div>

                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {reservation.status !== 'cancelled' && (
                              <button
                                type="button"
                                onClick={() => handleSoftCancelReservation(reservation.id)}
                                style={{
                                  minHeight: 40,
                                  padding: '8px 10px',
                                  borderRadius: 8,
                                  border: '1px solid #f0c5c5',
                                  background: '#fff5f5',
                                  color: UI.danger,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Annulla
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openEditReservation(reservation)}
                              style={{
                                minHeight: 40,
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: `1px solid ${UI.border}`,
                                background: '#fff',
                                color: UI.text,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Modifica
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteReservation(reservation.id)}
                              disabled={deleting}
                              style={{
                                minHeight: 40,
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: '1px solid #f0c5c5',
                                background: '#fff',
                                color: UI.danger,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Elimina
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: isMobile ? 'flex-end' : 'center',
            justifyContent: 'center',
            padding: isMobile ? 0 : 16,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 560,
              background: '#fff',
              borderTopLeftRadius: isMobile ? 18 : 12,
              borderTopRightRadius: isMobile ? 18 : 12,
              borderBottomLeftRadius: isMobile ? 0 : 12,
              borderBottomRightRadius: isMobile ? 0 : 12,
              padding: 16,
              border: `1px solid ${UI.border}`,
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                marginBottom: 14,
              }}
            >
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800 }}>
                  {editingReservationId ? 'Modifica prenotazione' : 'Nuova prenotazione'}
                </h3>
                <div style={{ color: UI.textSoft, fontSize: 13 }}>
                  {editingReservationId
                    ? 'Modifica i dati della prenotazione'
                    : 'Prenotazione inserita come confermata'}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  minHeight: 40,
                  minWidth: 40,
                  borderRadius: 8,
                  border: `1px solid ${UI.border}`,
                  background: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveReservation} style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>Nome cliente</label>
                <input
                  value={form.customer_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, customer_name: e.target.value }))}
                  placeholder="Es. Rossi"
                  style={{
                    minHeight: 44,
                    borderRadius: 8,
                    border: `1px solid ${UI.border}`,
                    padding: '10px 12px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>Telefono</label>
                <input
                  value={form.customer_phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, customer_phone: e.target.value }))}
                  placeholder="Facoltativo"
                  style={{
                    minHeight: 44,
                    borderRadius: 8,
                    border: `1px solid ${UI.border}`,
                    padding: '10px 12px',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: 12,
                }}
              >
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700 }}>Data</label>
                  <input
                    type="date"
                    value={form.reservation_date}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, reservation_date: e.target.value }))
                    }
                    style={{
                      minHeight: 44,
                      borderRadius: 8,
                      border: `1px solid ${UI.border}`,
                      padding: '10px 12px',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700 }}>Ora</label>
                  <input
                    type="time"
                    value={form.reservation_hour}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, reservation_hour: e.target.value }))
                    }
                    style={{
                      minHeight: 44,
                      borderRadius: 8,
                      border: `1px solid ${UI.border}`,
                      padding: '10px 12px',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: 12,
                }}
              >
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700 }}>Coperti</label>
                  <input
                    type="number"
                    min={1}
                    value={form.guests}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, guests: Number(e.target.value) || 1 }))
                    }
                    style={{
                      minHeight: 44,
                      borderRadius: 8,
                      border: `1px solid ${UI.border}`,
                      padding: '10px 12px',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700 }}>Tavolo</label>
                  <select
                    value={form.table_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, table_id: e.target.value }))}
                    style={{
                      minHeight: 44,
                      borderRadius: 8,
                      border: `1px solid ${UI.border}`,
                      padding: '10px 12px',
                      background: '#fff',
                    }}
                  >
                    <option value="">Non assegnato</option>
                    {tables.map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>Note</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={4}
                  placeholder="Note cliente, richieste tavolo, orario..."
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${UI.border}`,
                    padding: '10px 12px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 4,
                }}
              >
                <div style={{ fontSize: 12, color: UI.textSoft }}>
                  Giorno selezionato: {formatHumanDate(form.reservation_date)}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    style={{
                      minHeight: 42,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${UI.border}`,
                      background: '#fff',
                      color: UI.text,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Chiudi
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      minHeight: 42,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid #111',
                      background: '#111',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {saving ? 'Salvataggio...' : editingReservationId ? 'Salva modifiche' : 'Crea prenotazione'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
