'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type TableStatus = 'libero' | 'occupato' | 'prenotato';

type TableRow = {
  id: string;
  name: string;
  x: number;
  y: number;
  status: TableStatus;
};

const GRID_SIZE = 20;
const MAP_WIDTH = 980;
const MAP_HEIGHT = 620;
const TABLE_WIDTH = 35;
const TABLE_HEIGHT = 35;
const DRAG_THRESHOLD = 8;

const FLOOR_ROTATION = -44;
const FLOOR_SCALE = 1.03;
const FLOOR_OFFSET_X = -33;
const FLOOR_OFFSET_Y = -9;

const CLIP_TOP = 31;
const CLIP_RIGHT = 15;
const CLIP_BOTTOM = 23;
const CLIP_LEFT = 8;

export default function StaffPage() {
  const router = useRouter();

  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [newTableName, setNewTableName] = useState('');
  const [statusMenuTableId, setStatusMenuTableId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showMap, setShowMap] = useState(true);

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
    loadTables();
  }, []);

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

  async function loadTables() {
    setLoading(true);

    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Errore caricamento tavoli', error);
      setLoading(false);
      return;
    }

    setTables((data as TableRow[]) ?? []);
    setLoading(false);
  }

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

    const startX = snapToGrid(PLAYABLE_MIN_X + 20);
    const startY = snapToGrid(PLAYABLE_MIN_Y + 20);

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
      alert('Errore nella creazione del tavolo.');
      return;
    }

    setTables((prev) =>
      [...prev, data as TableRow].sort((a, b) => a.name.localeCompare(b.name))
    );
    setNewTableName('');
  }

  async function handleChangeStatus(tableId: string, status: TableStatus) {
    const { error } = await supabase
      .from('tables')
      .update({ status })
      .eq('id', tableId);

    if (error) {
      console.error('Errore cambio stato tavolo', error);
      alert('Errore nel cambio stato tavolo.');
      return;
    }

    setTables((prev) =>
      prev.map((table) =>
        table.id === tableId ? { ...table, status } : table
      )
    );
    setStatusMenuTableId(null);
  }

  async function persistTablePosition(tableId: string, x: number, y: number) {
    const { error } = await supabase
      .from('tables')
      .update({ x, y })
      .eq('id', tableId);

    if (error) {
      console.error('Errore salvataggio posizione tavolo', error);
    }
  }

  function updateTablePosition(tableId: string, x: number, y: number) {
    setTables((prev) =>
      prev.map((table) =>
        table.id === tableId ? { ...table, x, y } : table
      )
    );
  }

  function handlePointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    table: TableRow
  ) {
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
    table: TableRow
  ) {
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
    table: TableRow
  ) {
    const drag = dragStateRef.current;
    if (drag.tableId !== table.id || drag.pointerId !== e.pointerId) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (drag.moved) {
      await persistTablePosition(table.id, drag.liveX, drag.liveY);
    } else {
      router.push(`/staff/table/${table.id}`);
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
    table: TableRow
  ) {
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
    if (!q) return tables;
    return tables.filter((table) => table.name.toLowerCase().includes(q));
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
                Tocca un tavolo per aprire l’ordine, trascinalo per spostarlo.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

          {showMap && (
            <div style={{ width: '100%' }}>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: isMobile ? '100%' : 1840,
                  aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
                  minHeight: isMobile ? '72vw' : undefined,
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
                      linear-gradient(to right, rgba(100,116,139,0.12) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(100,116,139,0.12) 1px, transparent 1px)
                    `,
                    backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                />

                {tables.map((table) => {
                  const colors = getStatusColors(table.status);

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
                        minWidth: isMobile ? 24 : 35,
                        minHeight: isMobile ? 24 : 35,
                        maxWidth: isMobile ? 30 : 44,
                        maxHeight: isMobile ? 30 : 44,
                        borderRadius: 6,
                        border: `2px solid ${colors.border}`,
                        background: colors.bg,
                        color: colors.text,
                        cursor: 'grab',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        userSelect: 'none',
                        touchAction: 'none',
                        padding: 2,
                        zIndex: 3,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.10)',
                        overflow: 'hidden',
                      }}
                      title={`${table.name} - ${table.status}`}
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
                          fontSize: isMobile ? 6 : 7,
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
                placeholder="Es. T12"
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
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#111',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Aggiungi
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
              placeholder="Es. T1, Banco..."
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
                const colors = getStatusColors(table.status);

                return (
                  <div
                    key={table.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr auto auto',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/staff/table/${table.id}`)}
                      style={{
                        gridColumn: isMobile ? '1 / -1' : 'auto',
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
                      {table.name} · {table.status}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStatusMenuTableId((prev) =>
                          prev === table.id ? null : table.id
                        );
                      }}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #ccc',
                        background: '#fff',
                        color: '#111',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      Stato
                    </button>

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
                      }}
                    >
                      Ordine
                    </button>

                    {statusMenuTableId === table.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          gridColumn: '1 / -1',
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                          gap: 8,
                          padding: 8,
                          borderRadius: 10,
                          background: '#fff',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleChangeStatus(table.id, 'libero')}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '2px solid #16a34a',
                            background: '#dcfce7',
                            color: '#166534',
                            fontWeight: 700,
                            cursor: 'pointer',
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
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '2px solid #dc2626',
                            background: '#fee2e2',
                            color: '#991b1b',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Occupato
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
