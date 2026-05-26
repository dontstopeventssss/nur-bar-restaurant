'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Variabili Supabase mancanti: configura NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY su Vercel.'
    );
  }

  return createClient(url, key);
}

type TableStatus = 'libero' | 'occupato' | 'prenotato';

type TableRow = {
  id: string;
  name: string;
  x: number;
  y: number;
  status: TableStatus;
};

type TableLayoutOverrideRow = {
  id: string;
  service_date: string;
  table_id: string;
  x: number;
  y: number;
};

type ReservationRow = {
  id: string;
  table_id: string | null;
  customer_name: string | null;
  people_count: number | null;
  reservation_time: string;
  phone: string | null;
  notes: string | null;
  status: string | null;
  created_at: string | null;
};

type DerivedTableRow = TableRow & {
  derivedStatus: TableStatus;
  hasReservationForSelectedDate: boolean;
};

const GRID_SIZE = 20;
const MAP_WIDTH = 980;
const MAP_HEIGHT = 620;
const TABLE_WIDTH = 38;
const TABLE_HEIGHT = 38;
const DRAG_THRESHOLD = 8;

const FLOOR_ROTATION = -44;
const FLOOR_SCALE = 1.03;
const FLOOR_OFFSET_X = -33;
const FLOOR_OFFSET_Y = -9;

const CLIP_TOP = 31;
const CLIP_RIGHT = 15;
const CLIP_BOTTOM = 23;
const CLIP_LEFT = 8;

function getDatePart(value: string) {
  return value.slice(0, 10);
}

function isReservationActive(status: string | null | undefined) {
  const normalized = (status ?? '').trim().toLowerCase();
  return normalized !== 'annullata' && normalized !== 'cancellata';
}

function normalizeTableName(value: string) {
  return value.trim();
}

function getNumericTableName(value: string) {
  const normalized = normalizeTableName(value);
  const match = normalized.match(/^\d+$/);

  if (!match) return null;

  return Number(match[0]);
}

function compareTableNamesForList(aName: string, bName: string) {
  const aNumber = getNumericTableName(aName);
  const bNumber = getNumericTableName(bName);

  const aIsNumeric = aNumber !== null;
  const bIsNumeric = bNumber !== null;

  if (aIsNumeric && bIsNumeric) {
    return aNumber - bNumber;
  }

  if (aIsNumeric && !bIsNumeric) {
    return -1;
  }

  if (!aIsNumeric && bIsNumeric) {
    return 1;
  }

  return aName.localeCompare(bName, 'it', {
    sensitivity: 'base',
    numeric: false,
  });
}

export default function StaffPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [baseTables, setBaseTables] = useState<TableRow[]>([]);
  const [layoutOverrides, setLayoutOverrides] = useState<TableLayoutOverrideRow[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [dayReservations, setDayReservations] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [newTableName, setNewTableName] = useState('');
  const [statusMenuTableId, setStatusMenuTableId] = useState<string | null>(null);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingTableName, setEditingTableName] = useState('');
  const [tableActionLoadingId, setTableActionLoadingId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [isLayoutMode, setIsLayoutMode] = useState(false);

  const dragStateRef = useRef<{
    tableId: string | null;
    pointerId: number | null;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
    liveX: number;
    liveY: number;
  }>({
    tableId: null,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startX: 0,
    startY: 0,
    moved: false,
    liveX: 0,
    liveY: 0,
  });

  const PLAYABLE_MIN_X = Math.round((CLIP_LEFT / 100) * MAP_WIDTH);
  const PLAYABLE_MAX_X = Math.round(
    MAP_WIDTH - (CLIP_RIGHT / 100) * MAP_WIDTH - TABLE_WIDTH
  );
  const PLAYABLE_MIN_Y = Math.round((CLIP_TOP / 100) * MAP_HEIGHT);
  const PLAYABLE_MAX_Y = Math.round(
    MAP_HEIGHT - (CLIP_BOTTOM / 100) * MAP_HEIGHT - TABLE_HEIGHT
  );

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    async function loadOverridesForDate() {
      if (!selectedDate) {
        setLayoutOverrides([]);
        return;
      }

      const { data, error } = await supabase
        .from('table_layout_overrides')
        .select('*')
        .eq('service_date', selectedDate);

      if (error) {
        console.error('Errore caricamento layout del giorno', error);
        setLayoutOverrides([]);
        return;
      }

      setLayoutOverrides((data as TableLayoutOverrideRow[]) ?? []);
    }

    loadOverridesForDate();
  }, [selectedDate, supabase]);

  useEffect(() => {
    async function loadReservationsForDate() {
      if (!selectedDate) {
        setDayReservations([]);
        return;
      }

      const dayStart = `${selectedDate}T00:00:00`;
      const dayEnd = `${selectedDate}T23:59:59`;

      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .gte('reservation_time', dayStart)
        .lte('reservation_time', dayEnd)
        .not('table_id', 'is', null)
        .order('reservation_time', { ascending: true });

      if (error) {
        console.error('Errore caricamento prenotazioni giorno', error);
        setDayReservations([]);
        return;
      }

      const rows = ((data as ReservationRow[]) ?? []).filter((reservation) =>
        isReservationActive(reservation.status)
      );

      setDayReservations(rows);
    }

    loadReservationsForDate();
  }, [selectedDate, supabase]);

  useEffect(() => {
    const closeMenus = () => setStatusMenuTableId(null);
    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 960);
    };

    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('staff-live-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tables' },
        async () => {
          await loadBaseTables();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_layout_overrides' },
        async () => {
          if (!selectedDate) return;

          const { data, error } = await supabase
            .from('table_layout_overrides')
            .select('*')
            .eq('service_date', selectedDate);

          if (error) {
            console.error('Errore realtime layout overrides', error);
            return;
          }

          setLayoutOverrides((data as TableLayoutOverrideRow[]) ?? []);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        async () => {
          if (!selectedDate) return;

          const dayStart = `${selectedDate}T00:00:00`;
          const dayEnd = `${selectedDate}T23:59:59`;

          const { data, error } = await supabase
            .from('reservations')
            .select('*')
            .gte('reservation_time', dayStart)
            .lte('reservation_time', dayEnd)
            .not('table_id', 'is', null)
            .order('reservation_time', { ascending: true });

          if (error) {
            console.error('Errore realtime reservations', error);
            return;
          }

          const rows = ((data as ReservationRow[]) ?? []).filter((reservation) =>
            isReservationActive(reservation.status)
          );

          setDayReservations(rows);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate, supabase]);

  async function loadInitialData() {
    setLoading(true);
    await loadBaseTables();
    setLoading(false);
  }

  async function loadBaseTables() {
    const { data, error } = await supabase.from('tables').select('*');

    if (error) {
      console.error('Errore caricamento tavoli', error);
      return;
    }

    const sortedRows = ((data as TableRow[]) ?? []).sort((a, b) =>
      compareTableNamesForList(a.name, b.name)
    );

    setBaseTables(sortedRows);
  }

  const reservedTableIds = useMemo(() => {
    return new Set(
      dayReservations
        .map((reservation) => reservation.table_id)
        .filter(Boolean) as string[]
    );
  }, [dayReservations]);

  const tables = useMemo<DerivedTableRow[]>(() => {
    const overridesMap = new Map(
      layoutOverrides.map((item) => [item.table_id, item])
    );

    return baseTables.map((table) => {
      const override = selectedDate ? overridesMap.get(table.id) : undefined;
      const hasReservationForSelectedDate = selectedDate
        ? reservedTableIds.has(table.id)
        : false;

      return {
        ...table,
        x: override ? override.x : table.x,
        y: override ? override.y : table.y,
        derivedStatus: hasReservationForSelectedDate ? 'prenotato' : table.status,
        hasReservationForSelectedDate,
      };
    });
  }, [baseTables, layoutOverrides, selectedDate, reservedTableIds]);

  function snapToGrid(value: number) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  }

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function getStatusColors(status: TableStatus) {
    if (status === 'libero') {
      return {
        bg: '#dcfce7',
        border: '#16a34a',
        text: '#166534',
      };
    }

    if (status === 'prenotato') {
      return {
        bg: '#fed7aa',
        border: '#ea580c',
        text: '#9a3412',
      };
    }

    return {
      bg: '#fee2e2',
      border: '#dc2626',
      text: '#991b1b',
    };
  }

  async function handleAddTable() {
    const name = newTableName.trim();

    if (!name) {
      alert('Inserisci il nome del tavolo.');
      return;
    }

    const duplicated = baseTables.some(
      (table) => table.name.trim().toLowerCase() === name.toLowerCase()
    );

    if (duplicated) {
      alert('Esiste già un tavolo con questo nome.');
      return;
    }

    const startX = snapToGrid(PLAYABLE_MIN_X + 20);
    const startY = snapToGrid(PLAYABLE_MIN_Y + 20);

    setTableActionLoadingId('new-table');

    try {
      const { data, error } = await supabase
        .from('tables')
        .insert({
          name,
          x: startX,
          y: startY,
          status: 'libero',
        })
        .select()
        .single();

      if (error) {
        console.error('Errore creazione tavolo', error);
        alert(
          `Errore creazione tavolo:\n${error.message}${error.code ? `\ncode: ${error.code}` : ''}`
        );
        return;
      }

      setBaseTables((prev) =>
        [...prev, data as TableRow].sort((a, b) =>
          compareTableNamesForList(a.name, b.name)
        )
      );

      setNewTableName('');
    } finally {
      setTableActionLoadingId(null);
    }
  }

  function startRenameTable(table: DerivedTableRow) {
    setEditingTableId(table.id);
    setEditingTableName(table.name);
    setStatusMenuTableId(null);
  }

  function cancelRenameTable() {
    setEditingTableId(null);
    setEditingTableName('');
  }

  async function handleRenameTable(tableId: string) {
    const nextName = editingTableName.trim();

    if (!nextName) {
      alert('Inserisci un nome tavolo valido.');
      return;
    }

    const duplicated = baseTables.some(
      (table) =>
        table.id !== tableId && table.name.trim().toLowerCase() === nextName.toLowerCase()
    );

    if (duplicated) {
      alert('Esiste già un tavolo con questo nome.');
      return;
    }

    setTableActionLoadingId(tableId);

    try {
      const { data, error } = await supabase
        .from('tables')
        .update({ name: nextName })
        .eq('id', tableId)
        .select()
        .single();

      if (error) {
        console.error('Errore rinomina tavolo', error);
        alert(
          `Errore rinomina tavolo:\n${error.message}${error.code ? `\ncode: ${error.code}` : ''}`
        );
        return;
      }

      const updated = data as TableRow;

      setBaseTables((prev) =>
        prev
          .map((table) => (table.id === tableId ? updated : table))
          .sort((a, b) => compareTableNamesForList(a.name, b.name))
      );

      setEditingTableId(null);
      setEditingTableName('');
    } finally {
      setTableActionLoadingId(null);
    }
  }

  async function handleDeleteTable(table: DerivedTableRow) {
    const hasOpenReservation = table.hasReservationForSelectedDate;
    const hasAnyOrderRisk =
      table.derivedStatus === 'occupato' || table.derivedStatus === 'prenotato';

    if (hasOpenReservation) {
      alert(
        'Non puoi eliminare un tavolo prenotato nel giorno selezionato. Rimuovi o annulla prima la prenotazione.'
      );
      return;
    }

    if (hasAnyOrderRisk) {
      const confirmBusy = window.confirm(
        `Il tavolo "${table.name}" non risulta libero. Vuoi davvero continuare?`
      );
      if (!confirmBusy) return;
    }

    const confirmDelete = window.confirm(
      `Vuoi eliminare definitivamente il tavolo "${table.name}"?`
    );
    if (!confirmDelete) return;

    const secondConfirm = window.confirm(
      `Conferma definitiva: eliminare "${table.name}" dalla sala?`
    );
    if (!secondConfirm) return;

    setTableActionLoadingId(table.id);

    try {
      const { error } = await supabase.from('tables').delete().eq('id', table.id);

      if (error) {
        console.error('Errore eliminazione tavolo', error);
        alert('Errore durante l’eliminazione del tavolo.');
        return;
      }

      setBaseTables((prev) => prev.filter((item) => item.id !== table.id));

      if (editingTableId === table.id) {
        setEditingTableId(null);
        setEditingTableName('');
      }

      if (statusMenuTableId === table.id) {
        setStatusMenuTableId(null);
      }
    } finally {
      setTableActionLoadingId(null);
    }
  }

  async function handleChangeStatus(tableId: string, status: TableStatus) {
    const targetTable = tables.find((table) => table.id === tableId);

    if (selectedDate && targetTable?.hasReservationForSelectedDate) {
      alert(
        'Questo tavolo è prenotato nel giorno selezionato. Modifica o annulla la prenotazione dal calendario.'
      );
      setStatusMenuTableId(null);
      return;
    }

    const { error } = await supabase
      .from('tables')
      .update({ status })
      .eq('id', tableId);

    if (error) {
      console.error('Errore cambio stato tavolo', error);
      alert('Errore nel cambio stato tavolo.');
      return;
    }

    setBaseTables((prev) =>
      prev.map((table) =>
        table.id === tableId ? { ...table, status } : table
      )
    );
    setStatusMenuTableId(null);
  }

  async function persistTablePosition(tableId: string, x: number, y: number) {
    if (selectedDate) {
      const { data, error } = await supabase
        .from('table_layout_overrides')
        .upsert(
          {
            service_date: selectedDate,
            table_id: tableId,
            x,
            y,
          },
          {
            onConflict: 'service_date,table_id',
          }
        )
        .select()
        .single();

      if (error) {
        console.error('Errore salvataggio posizione tavolo per data', error);
        return;
      }

      const saved = data as TableLayoutOverrideRow;

      setLayoutOverrides((prev) => {
        const exists = prev.some(
          (item) =>
            item.service_date === saved.service_date &&
            item.table_id === saved.table_id
        );

        if (exists) {
          return prev.map((item) =>
            item.service_date === saved.service_date &&
            item.table_id === saved.table_id
              ? saved
              : item
          );
        }

        return [...prev, saved];
      });

      return;
    }

    const { error } = await supabase
      .from('tables')
      .update({ x, y })
      .eq('id', tableId);

    if (error) {
      console.error('Errore salvataggio posizione tavolo base', error);
      return;
    }

    setBaseTables((prev) =>
      prev.map((table) =>
        table.id === tableId ? { ...table, x, y } : table
      )
    );
  }

  function updateTablePosition(tableId: string, x: number, y: number) {
    if (selectedDate) {
      setLayoutOverrides((prev) => {
        const existing = prev.find(
          (item) =>
            item.table_id === tableId && item.service_date === selectedDate
        );

        if (existing) {
          return prev.map((item) =>
            item.table_id === tableId && item.service_date === selectedDate
              ? { ...item, x, y }
              : item
          );
        }

        return [
          ...prev,
          {
            id: `temp-${tableId}-${selectedDate}`,
            service_date: selectedDate,
            table_id: tableId,
            x,
            y,
          },
        ];
      });

      return;
    }

    setBaseTables((prev) =>
      prev.map((table) =>
        table.id === tableId ? { ...table, x, y } : table
      )
    );
  }

  function handlePointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    table: DerivedTableRow
  ) {
    if (!isLayoutMode) {
      e.preventDefault();
      e.stopPropagation();
      router.push(`/staff/table/${table.id}`);
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    dragStateRef.current = {
      tableId: table.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: table.x,
      startY: table.y,
      moved: false,
      liveX: table.x,
      liveY: table.y,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(
    e: React.PointerEvent<HTMLButtonElement>,
    table: DerivedTableRow
  ) {
    if (!isLayoutMode) return;

    const drag = dragStateRef.current;
    if (drag.tableId !== table.id || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    const distance = Math.abs(dx) + Math.abs(dy);

    if (!drag.moved && distance >= DRAG_THRESHOLD) {
      drag.moved = true;
    }

    if (!drag.moved) return;

    const nextX = clamp(
      snapToGrid(drag.startX + dx),
      PLAYABLE_MIN_X,
      PLAYABLE_MAX_X
    );
    const nextY = clamp(
      snapToGrid(drag.startY + dy),
      PLAYABLE_MIN_Y,
      PLAYABLE_MAX_Y
    );

    drag.liveX = nextX;
    drag.liveY = nextY;

    updateTablePosition(table.id, nextX, nextY);
  }

  async function handlePointerUp(
    e: React.PointerEvent<HTMLButtonElement>,
    table: DerivedTableRow
  ) {
    if (!isLayoutMode) return;

    const drag = dragStateRef.current;
    if (drag.tableId !== table.id || drag.pointerId !== e.pointerId) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (drag.moved) {
      await persistTablePosition(table.id, drag.liveX, drag.liveY);
    }

    dragStateRef.current = {
      tableId: null,
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      startX: 0,
      startY: 0,
      moved: false,
      liveX: 0,
      liveY: 0,
    };
  }

  function handlePointerCancel(
    e: React.PointerEvent<HTMLButtonElement>,
    table: DerivedTableRow
  ) {
    if (!isLayoutMode) return;

    const drag = dragStateRef.current;
    if (drag.tableId !== table.id || drag.pointerId !== e.pointerId) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    updateTablePosition(table.id, drag.startX, drag.startY);

    dragStateRef.current = {
      tableId: null,
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      startX: 0,
      startY: 0,
      moved: false,
      liveX: 0,
      liveY: 0,
    };
  }

  const filteredTables = useMemo(() => {
    const q = search.trim().toLowerCase();

    const nextTables = !q
      ? [...tables]
      : tables.filter((table) => table.name.toLowerCase().includes(q));

    return nextTables.sort((a, b) =>
      compareTableNamesForList(a.name, b.name)
    );
  }, [tables, search]);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f5f5f5',
        color: '#111',
        padding: isMobile ? 4 : 6,
      }}
    >
      <div
        style={{
          maxWidth: 1880,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <section
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: isMobile ? 4 : 6,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24 }}>
                Gestione tavoli
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#666' }}>
                {isLayoutMode
                  ? 'Modalità layout: trascina i tavoli per cambiare posizione.'
                  : 'Tocca un tavolo per aprire l’ordine.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => router.push('/calendar')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #ccc',
                  background: '#fff',
                  color: '#111',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Calendario
              </button>

              <button
                type="button"
                onClick={() => setShowMap((prev) => !prev)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #ccc',
                  background: '#fff',
                  color: '#111',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {showMap ? 'Nascondi mappa' : 'Mostra mappa'}
              </button>

              <button
                type="button"
                onClick={() => setIsLayoutMode((prev) => !prev)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: isLayoutMode ? '1px solid #111' : '1px solid #ccc',
                  background: isLayoutMode ? '#111' : '#fff',
                  color: isLayoutMode ? '#fff' : '#111',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {isLayoutMode ? 'Fine modifica layout' : 'Modifica layout'}
              </button>

              <button
                type="button"
                onClick={() => router.push('/')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #ccc',
                  background: '#fff',
                  color: '#111',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ← Home
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>
                Layout del giorno
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #ccc',
                  fontSize: 14,
                  background: '#fff',
                  color: '#111',
                }}
              />
            </div>

            {selectedDate && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDate('');
                  setLayoutOverrides([]);
                  setDayReservations([]);
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #ccc',
                  background: '#fff',
                  color: '#111',
                  cursor: 'pointer',
                  fontWeight: 600,
                  alignSelf: 'flex-end',
                }}
              >
                Torna layout base
              </button>
            )}

            <div
              style={{
                alignSelf: 'flex-end',
                fontSize: 12,
                color: '#666',
                fontWeight: 600,
              }}
            >
              {selectedDate
                ? `Stai vedendo il layout e le prenotazioni del ${selectedDate}`
                : 'Stai modificando la mappa base'}
            </div>
          </div>

          {showMap && (
            <div style={{ width: '100%' }}>
              {isMobile ? (
                <div
                  style={{
                    width: '100%',
                    overflow: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    borderRadius: 12,
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: 980,
                      height: 620,
                      minWidth: 980,
                      minHeight: 620,
                      overflow: 'hidden',
                      borderRadius: 12,
                      background: '#ffffff',
                    }}
                  >
                    <img
                      src="/piantina-nur.jpeg"
                      alt="Piantina locale NUR"
                      draggable={false}
                      style={{
                        position: 'absolute',
                        inset: '-4%',
                        width: '108%',
                        height: '108%',
                        objectFit: 'cover',
                        transform: `translate(${FLOOR_OFFSET_X}px, ${FLOOR_OFFSET_Y}px) rotate(${FLOOR_ROTATION}deg) scale(${FLOOR_SCALE})`,
                        transformOrigin: 'center center',
                        pointerEvents: 'none',
                        zIndex: 1,
                      }}
                    />

                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `
                          linear-gradient(to right, rgba(100,116,139,0.14) 1px, transparent 1px),
                          linear-gradient(to bottom, rgba(100,116,139,0.14) 1px, transparent 1px)
                        `,
                        backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                        pointerEvents: 'none',
                        zIndex: 2,
                      }}
                    />

                    {tables.map((table) => {
                      const colors = getStatusColors(table.derivedStatus);

                      return (
                        <button
                          key={table.id}
                          type="button"
                          onPointerDown={(e) => handlePointerDown(e, table)}
                          onPointerMove={(e) => handlePointerMove(e, table)}
                          onPointerUp={(e) => handlePointerUp(e, table)}
                          onPointerCancel={(e) => handlePointerCancel(e, table)}
                          style={{
                            position: 'absolute',
                            left: table.x,
                            top: table.y,
                            width: TABLE_WIDTH,
                            height: TABLE_HEIGHT,
                            borderRadius: 6,
                            border: `2px solid ${colors.border}`,
                            background: colors.bg,
                            color: colors.text,
                            cursor: isLayoutMode ? 'grab' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            userSelect: 'none',
                            touchAction: 'none',
                            padding: 2,
                            zIndex: 3,
                            boxShadow: isLayoutMode
                              ? '0 0 0 2px rgba(59,130,246,0.4)'
                              : '0 2px 6px rgba(0,0,0,0.10)',
                            overflow: 'hidden',
                          }}
                          title={`${table.name} - ${table.derivedStatus}`}
                        >
                          <span
                            style={{
                              display: 'block',
                              width: '100%',
                              maxWidth: '100%',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              fontWeight: 800,
                              fontSize: 7,
                              lineHeight: 1,
                              textAlign: 'center',
                            }}
                          >
                            {table.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 1840,
                    aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
                    margin: '0 auto',
                    overflow: 'hidden',
                    borderRadius: 12,
                    background: '#ffffff',
                  }}
                >
                  <img
                    src="/piantina-nur.jpeg"
                    alt="Piantina locale NUR"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      inset: '-4%',
                      width: '108%',
                      height: '108%',
                      objectFit: 'cover',
                      transform: `translate(${FLOOR_OFFSET_X}px, ${FLOOR_OFFSET_Y}px) rotate(${FLOOR_ROTATION}deg) scale(${FLOOR_SCALE})`,
                      transformOrigin: 'center center',
                      pointerEvents: 'none',
                      zIndex: 1,
                    }}
                  />

                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundImage: `
                        linear-gradient(to right, rgba(100,116,139,0.14) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(100,116,139,0.14) 1px, transparent 1px)
                      `,
                      backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}
                  />

                  {tables.map((table) => {
                    const colors = getStatusColors(table.derivedStatus);

                    return (
                      <button
                        key={table.id}
                        type="button"
                        onPointerDown={(e) => handlePointerDown(e, table)}
                        onPointerMove={(e) => handlePointerMove(e, table)}
                        onPointerUp={(e) => handlePointerUp(e, table)}
                        onPointerCancel={(e) => handlePointerCancel(e, table)}
                        style={{
                          position: 'absolute',
                          left: `${(table.x / MAP_WIDTH) * 100}%`,
                          top: `${(table.y / MAP_HEIGHT) * 100}%`,
                          width: `${(TABLE_WIDTH / MAP_WIDTH) * 100}%`,
                          height: `${(TABLE_HEIGHT / MAP_HEIGHT) * 100}%`,
                          minWidth: 35,
                          minHeight: 35,
                          maxWidth: 44,
                          maxHeight: 44,
                          borderRadius: 6,
                          border: `2px solid ${colors.border}`,
                          background: colors.bg,
                          color: colors.text,
                          cursor: isLayoutMode ? 'grab' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          userSelect: 'none',
                          touchAction: 'none',
                          padding: 2,
                          zIndex: 3,
                          boxShadow: isLayoutMode
                            ? '0 0 0 2px rgba(59,130,246,0.4)'
                            : '0 2px 6px rgba(0,0,0,0.10)',
                          overflow: 'hidden',
                        }}
                        title={`${table.name} - ${table.derivedStatus}`}
                      >
                        <span
                          style={{
                            display: 'block',
                            width: '100%',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            fontWeight: 800,
                            fontSize: 7,
                            lineHeight: 1,
                            textAlign: 'center',
                          }}
                        >
                          {table.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        <section
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: isMobile ? 8 : 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <section
            style={{
              borderRadius: 12,
              padding: 10,
              background: '#fafafa',
            }}
          >
            <h2 style={{ margin: '0 0 8px 0', fontSize: 16 }}>
              Aggiungi tavolo
            </h2>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="Es. 12 o Banco"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #ccc',
                  fontSize: 14,
                }}
              />
              <button
                type="button"
                onClick={handleAddTable}
                disabled={tableActionLoadingId === 'new-table'}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#111',
                  color: '#fff',
                  cursor: tableActionLoadingId === 'new-table' ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  opacity: tableActionLoadingId === 'new-table' ? 0.6 : 1,
                }}
              >
                {tableActionLoadingId === 'new-table' ? 'Salvataggio…' : 'Aggiungi'}
              </button>
            </div>
          </section>

          <section
            style={{
              borderRadius: 12,
              padding: 10,
              background: '#fafafa',
            }}
          >
            <h2 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Cerca tavolo</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Es. 1, 12, Banco..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #ccc',
                fontSize: 14,
              }}
            />
          </section>

          <section
            style={{
              borderRadius: 12,
              padding: 10,
              background: '#fafafa',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 16 }}>Lista tavoli</h2>
              <span style={{ fontSize: 12, color: '#666' }}>
                {loading ? 'Caricamento…' : `${filteredTables.length} tavoli`}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredTables.map((table) => {
                const colors = getStatusColors(table.derivedStatus);
                const isEditing = editingTableId === table.id;
                const isBusy = tableActionLoadingId === table.id;

                return (
                  <div
                    key={table.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatusMenuTableId((prev) =>
                            prev === table.id ? null : table.id
                          );
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: `2px solid ${colors.border}`,
                          background: colors.bg,
                          color: colors.text,
                          fontWeight: 800,
                          fontSize: 14,
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        {table.name} · {table.derivedStatus}
                        {table.hasReservationForSelectedDate ? ' · da calendario' : ''}
                      </button>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <input
                          type="text"
                          value={editingTableName}
                          onChange={(e) => setEditingTableName(e.target.value)}
                          disabled={isBusy}
                          style={{
                            flex: 1,
                            minWidth: 180,
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px solid #ccc',
                            fontSize: 14,
                            background: '#fff',
                            color: '#111',
                          }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleRenameTable(table.id);
                            }
                            if (e.key === 'Escape') {
                              cancelRenameTable();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameTable(table.id)}
                          disabled={isBusy}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#111',
                            color: '#fff',
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            opacity: isBusy ? 0.6 : 1,
                          }}
                        >
                          Salva
                        </button>
                        <button
                          type="button"
                          onClick={cancelRenameTable}
                          disabled={isBusy}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px solid #ccc',
                            background: '#fff',
                            color: '#111',
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            opacity: isBusy ? 0.6 : 1,
                          }}
                        >
                          Annulla
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => router.push(`/staff/table/${table.id}`)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #111',
                        background: '#111',
                        color: '#fff',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Ordine
                    </button>

                    {statusMenuTableId === table.id && !isEditing && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          gridColumn: '1 / -1',
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)',
                          gap: 8,
                          padding: 8,
                          borderRadius: 10,
                          background: '#fff',
                          border: '1px solid #eee',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleChangeStatus(table.id, 'libero')}
                          disabled={table.hasReservationForSelectedDate}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '2px solid #16a34a',
                            background: '#dcfce7',
                            color: '#166534',
                            fontWeight: 700,
                            cursor: table.hasReservationForSelectedDate ? 'not-allowed' : 'pointer',
                            opacity: table.hasReservationForSelectedDate ? 0.5 : 1,
                          }}
                        >
                          Libero
                        </button>

                        <button
                          type="button"
                          onClick={() => handleChangeStatus(table.id, 'prenotato')}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '2px solid #ea580c',
                            background: '#fed7aa',
                            color: '#9a3412',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Prenotato
                        </button>

                        <button
                          type="button"
                          onClick={() => handleChangeStatus(table.id, 'occupato')}
                          disabled={table.hasReservationForSelectedDate}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '2px solid #dc2626',
                            background: '#fee2e2',
                            color: '#991b1b',
                            fontWeight: 700,
                            cursor: table.hasReservationForSelectedDate ? 'not-allowed' : 'pointer',
                            opacity: table.hasReservationForSelectedDate ? 0.5 : 1,
                          }}
                        >
                          Occupato
                        </button>

                        <button
                          type="button"
                          onClick={() => startRenameTable(table)}
                          disabled={isBusy}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px solid #111',
                            background: '#fff',
                            color: '#111',
                            fontWeight: 700,
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            opacity: isBusy ? 0.5 : 1,
                          }}
                        >
                          Rinomina
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTable(table)}
                          disabled={isBusy}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px solid #dc2626',
                            background: '#fff',
                            color: '#dc2626',
                            fontWeight: 700,
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            opacity: isBusy ? 0.5 : 1,
                          }}
                        >
                          Elimina
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {!loading && filteredTables.length === 0 && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: '#fff',
                    color: '#666',
                    fontSize: 13,
                  }}
                >
                  Nessun tavolo trovato.
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
