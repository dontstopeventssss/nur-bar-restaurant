'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Table = {
  id: string;
  name: string;
  status: 'libero' | 'prenotato' | 'occupato';
};

type Reservation = {
  id: string;
  table_id: string | null;
  customer_name: string;
  people_count: number | null;
  reservation_time: string;
  phone: string | null;
  notes: string | null;
  status: string | null;
  created_at: string | null;
};

const UI = {
  bg: '#ffffff',
  surface: '#ffffff',
  border: '#dddddd',
  borderSoft: '#eeeeee',
  text: '#111111',
  textMuted: '#666666',
  primary: '#01696f',
  primaryText: '#ffffff',
  success: '#059669',
  danger: '#dc2626',
  dangerText: '#ffffff',
  inputBg: '#ffffff',
  inputBorder: '#cccccc',
  overlay: 'rgba(0,0,0,0.35)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  color: UI.text,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 10px',
  borderRadius: 6,
  border: `1px solid ${UI.inputBorder}`,
  fontSize: 14,
  color: UI.text,
  backgroundColor: UI.inputBg,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 80,
  resize: 'vertical',
};

function toDateTimeLocalString(value: string) {
  const d = new Date(value);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getDatePart(value: string) {
  return value.slice(0, 10);
}

function getTimePart(value: string) {
  const local = toDateTimeLocalString(value);
  return local.slice(11, 16);
}

function mergeDateAndTime(dateStr: string, timeStr: string) {
  return `${dateStr}T${timeStr}`;
}

function sameDay(dateTimeA: string, dateTimeB: string) {
  return dateTimeA.slice(0, 10) === dateTimeB.slice(0, 10);
}

export default function CalendarPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tables, setTables] = useState<Table[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingReservationId, setEditingReservationId] = useState<string | null>(
    null
  );

  const [selectedDate, setSelectedDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('20:00');
  const [customerName, setCustomerName] = useState('');
  const [peopleCount, setPeopleCount] = useState('2');
  const [phone, setPhone] = useState('');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: tablesData, error: tablesError } = await supabase
          .from('tables')
          .select('*')
          .order('name', { ascending: true });

        if (tablesError) {
          console.error('Errore caricamento tavoli', tablesError);
          return;
        }

        const { data: reservationsData, error: reservationsError } = await supabase
          .from('reservations')
          .select('*')
          .order('reservation_time', { ascending: true });

        if (reservationsError) {
          console.error('Errore caricamento prenotazioni', reservationsError);
          return;
        }

        setTables((tablesData as Table[]) ?? []);
        setReservations((reservationsData as Reservation[]) ?? []);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const resetForm = () => {
    setEditingReservationId(null);
    setSelectedDate('');
    setArrivalTime('20:00');
    setCustomerName('');
    setPeopleCount('2');
    setPhone('');
    setSelectedTableId('');
    setNotes('');
  };

  const openNewReservation = (date: Date) => {
    resetForm();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    setSelectedDate(`${year}-${month}-${day}`);
    setArrivalTime('20:00');
    setShowModal(true);
  };

  const openEditReservation = (reservation: Reservation) => {
    setEditingReservationId(reservation.id);
    setSelectedDate(getDatePart(reservation.reservation_time));
    setArrivalTime(getTimePart(reservation.reservation_time));
    setCustomerName(reservation.customer_name ?? '');
    setPeopleCount(String(reservation.people_count ?? 1));
    setPhone(reservation.phone ?? '');
    setSelectedTableId(reservation.table_id ?? '');
    setNotes(reservation.notes ?? '');
    setShowModal(true);
  };

  const busyTableIds = useMemo(() => {
    if (!selectedDate) return [];

    return reservations
      .filter(
        (r) =>
          r.id !== editingReservationId &&
          r.status !== 'annullata' &&
          sameDay(r.reservation_time, `${selectedDate}T00:00`)
      )
      .map((r) => r.table_id)
      .filter(Boolean) as string[];
  }, [reservations, selectedDate, editingReservationId]);

  const visibleReservations = useMemo(() => {
    return reservations.filter((r) => r.status !== 'annullata');
  }, [reservations]);

  const calendarEvents = useMemo(() => {
    return visibleReservations.map((reservation) => {
      const table = tables.find((t) => t.id === reservation.table_id);
      const tableName = table?.name ?? 'Senza tavolo';

      return {
        id: reservation.id,
        title: `${getTimePart(reservation.reservation_time)} • ${
          reservation.customer_name
        } • ${tableName} • ${reservation.people_count ?? 0} persone`,
        start: reservation.reservation_time,
        allDay: false,
        backgroundColor: UI.primary,
        borderColor: UI.primary,
        textColor: '#ffffff',
      };
    });
  }, [visibleReservations, tables]);

  const handleDateClick = (arg: DateClickArg) => {
    openNewReservation(arg.date);
  };

  const handleEventClick = (arg: any) => {
    const reservation = reservations.find((r) => r.id === arg.event.id);
    if (!reservation) return;
    openEditReservation(reservation);
  };

  const handleSaveReservation = async () => {
    const parsedPeopleCount = Number(peopleCount);

    if (!selectedDate) {
      alert('Seleziona un giorno dal calendario.');
      return;
    }

    if (!arrivalTime) {
      alert("Inserisci l’orario.");
      return;
    }

    if (!customerName.trim()) {
      alert('Inserisci il nome del cliente.');
      return;
    }

    if (!parsedPeopleCount || parsedPeopleCount <= 0) {
      alert('Inserisci un numero persone valido.');
      return;
    }

    if (!phone.trim()) {
      alert('Inserisci un recapito telefonico.');
      return;
    }

    if (!selectedTableId) {
      alert('Seleziona un tavolo.');
      return;
    }

    const reservationDateTime = mergeDateAndTime(selectedDate, arrivalTime);

    setSaving(true);

    try {
      const payload = {
        customer_name: customerName.trim(),
        reservation_time: reservationDateTime,
        people_count: parsedPeopleCount,
        phone: phone.trim(),
        table_id: selectedTableId,
        notes: notes.trim() || null,
      };

      if (editingReservationId) {
        const { data, error } = await supabase
          .from('reservations')
          .update(payload)
          .eq('id', editingReservationId)
          .select()
          .single();

        if (error) {
          console.error('Errore aggiornamento prenotazione', error);
          alert('Errore durante il salvataggio della prenotazione.');
          return;
        }

        const updated = data as Reservation;
        setReservations((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r))
        );
      } else {
        const { data, error } = await supabase
          .from('reservations')
          .insert({
            ...payload,
            status: 'confermata',
          })
          .select()
          .single();

        if (error) {
          console.error('Errore creazione prenotazione', error);
          alert('Errore durante la creazione della prenotazione.');
          return;
        }

        const created = data as Reservation;
        setReservations((prev) =>
          [...prev, created].sort((a, b) =>
            a.reservation_time.localeCompare(b.reservation_time)
          )
        );
      }

      setShowModal(false);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReservation = async () => {
    if (!editingReservationId) return;

    const confirmed = window.confirm('Vuoi davvero annullare questa prenotazione?');
    if (!confirmed) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('reservations')
        .update({ status: 'annullata' })
        .eq('id', editingReservationId)
        .select()
        .single();

      if (error) {
        console.error('Errore annullamento prenotazione', error);
        alert('Errore durante l’annullamento della prenotazione.');
        return;
      }

      const updated = data as Reservation;
      setReservations((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      setShowModal(false);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 16, color: UI.text }}>
        Caricamento calendario…
      </div>
    );
  }

  return (
    <main
      style={{
        padding: 16,
        backgroundColor: UI.bg,
        color: UI.text,
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>Calendario prenotazioni</h1>
          <div style={{ marginTop: 4, fontSize: 13, color: UI.textMuted }}>
            Clicca un giorno per creare una prenotazione, clicca una prenotazione per
            modificarla.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => router.push('/staff')}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: `1px solid ${UI.border}`,
              backgroundColor: UI.surface,
              color: UI.text,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ← Staff
          </button>

          <button
            type="button"
            onClick={() => router.push('/owner')}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: `1px solid ${UI.border}`,
              backgroundColor: UI.surface,
              color: UI.text,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Owner →
          </button>
        </div>
      </div>

      <div
        style={{
          backgroundColor: UI.surface,
          border: `1px solid ${UI.border}`,
          borderRadius: 10,
          padding: 12,
          overflow: 'hidden',
        }}
      >
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="dayGridMonth"
          locale="it"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridDay,listDay',
          }}
          buttonText={{
            today: 'Oggi',
            month: 'Mese',
            day: 'Giorno',
            listDay: 'Prenotazioni giorno',
          }}
          height="auto"
          editable={false}
          selectable={true}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          events={calendarEvents}
        />
      </div>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: UI.overlay,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 580,
              backgroundColor: UI.surface,
              borderRadius: 10,
              border: `1px solid ${UI.border}`,
              padding: 16,
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
                <h2 style={{ margin: 0, fontSize: 20 }}>
                  {editingReservationId
                    ? 'Modifica prenotazione'
                    : 'Nuova prenotazione'}
                </h2>
                <div
                  style={{ fontSize: 12, color: UI.textMuted, marginTop: 3 }}
                >
                  Giorno selezionato: {selectedDate || '-'}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: `1px solid ${UI.border}`,
                  backgroundColor: UI.surface,
                  color: UI.text,
                  fontSize: 16,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>Orario</label>
                <input
                  type="time"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Nome cliente</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Es. Mario Rossi"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Numero persone</label>
                <input
                  type="number"
                  min="1"
                  value={peopleCount}
                  onChange={(e) => setPeopleCount(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Telefono</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Es. 3331234567"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Tavolo</label>
                <select
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Seleziona tavolo</option>
                  {tables.map((table) => {
                    const isBusy = busyTableIds.includes(table.id);

                    return (
                      <option key={table.id} value={table.id} disabled={isBusy}>
                        {table.name}
                        {isBusy ? ' — già prenotato in questo giorno' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Note</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Es. tavolo esterno, compleanno, passeggino..."
                  style={textareaStyle}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: `1px solid ${UI.borderSoft}`,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <div>
                {editingReservationId && (
                  <button
                    type="button"
                    onClick={handleDeleteReservation}
                    disabled={saving}
                    style={{
                      padding: '9px 12px',
                      borderRadius: 6,
                      border: 'none',
                      backgroundColor: UI.danger,
                      color: UI.dangerText,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Annulla prenotazione
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 6,
                    border: `1px solid ${UI.border}`,
                    backgroundColor: UI.surface,
                    color: UI.text,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Chiudi
                </button>

                <button
                  type="button"
                  onClick={handleSaveReservation}
                  disabled={saving}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: UI.primary,
                    color: UI.primaryText,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving
                    ? 'Salvataggio…'
                    : editingReservationId
                    ? 'Salva modifiche'
                    : 'Crea prenotazione'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
