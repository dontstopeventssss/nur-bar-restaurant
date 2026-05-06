'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

// Canvas piantina (px)
const W = 700;
const H = 360;
const GRID = 20;

type TableRow = {
  id: string;
  name: string;
  status: string;
  x: number | null;
  y: number | null;
};

type DeletedTable = {
  name: string;
  status: string;
  x: number | null;
  y: number | null;
};

export default function StaffPage() {
  const router = useRouter();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [search, setSearch] = useState('');
  const [newTableName, setNewTableName] = useState('');
  const [lastDeleted, setLastDeleted] = useState<DeletedTable | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchTables();
  }, []);

  async function fetchTables() {
    const { data, error } = await supabase.from('tables').select('*');
    if (error) {
      console.error('Errore caricamento tavoli', error);
      return;
    }
    if (data) setTables(data as TableRow[]);
  }

  function getPos(t: TableRow) {
    return { x: t.x ?? 100, y: t.y ?? 100 };
  }

  function getColor(status: string) {
    if (status === 'occupato') return '#ff4d4d';
    if (status === 'prenotato') return '#ffa500';
    return '#4caf50';
  }

  function sortKeyFromName(name: string) {
    const m = name.match(/\d+/);
    if (m) return parseInt(m[0], 10);
    return Number.MAX_SAFE_INTEGER;
  }

  const sortedTables = useMemo(() => {
    return [...tables].sort((a, b) => {
      const ka = sortKeyFromName(a.name);
      const kb = sortKeyFromName(b.name);
      if (ka !== kb) return ka - kb;
      return a.name.localeCompare(b.name);
    });
  }, [tables]);

  const filteredTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedTables;
    return sortedTables.filter((t) => t.name.toLowerCase().includes(q));
  }, [sortedTables, search]);

  async function changeStatus(id: string, newStatus: string) {
    setIsSaving(true);
    const { error } = await supabase
      .from('tables')
      .update({ status: newStatus })
      .eq('id', id);
    setIsSaving(false);
    if (error) {
      console.error('Errore cambio stato tavolo', error);
      alert('Errore nel cambio stato tavolo.');
      return;
    }
    fetchTables();
  }

  async function handleAddTable(e: React.FormEvent) {
    e.preventDefault();
    const name = newTableName.trim();
    if (!name) return;

    setIsSaving(true);
    const { error } = await supabase.from('tables').insert({
      name,
      status: 'libero',
      x: 100,
      y: 100,
    });
    setIsSaving(false);

    if (error) {
      console.error('Errore aggiunta tavolo', error);
      alert("Errore nell'aggiunta del tavolo (controlla schema Supabase).");
      return;
    }

    setNewTableName('');
    fetchTables();
  }

  async function handleDeleteTable(id: string) {
    const t = tables.find((r) => r.id === id);
    if (!t) return;

    const ok = window.confirm(
      `Vuoi davvero eliminare il tavolo ${t.name}? (Puoi annullare subito dopo)`
    );
    if (!ok) return;

    setIsSaving(true);
    const { error } = await supabase.from('tables').delete().eq('id', id);
    setIsSaving(false);

    if (error) {
      console.error('Errore eliminazione tavolo', error);
      alert('Errore nella eliminazione del tavolo.');
      return;
    }

    setLastDeleted({
      name: t.name,
      status: t.status,
      x: t.x,
      y: t.y,
    });

    fetchTables();
  }

  async function handleUndoDelete() {
    if (!lastDeleted) return;

    setIsSaving(true);
    const { error } = await supabase.from('tables').insert({
      name: lastDeleted.name,
      status: lastDeleted.status,
      x: lastDeleted.x ?? 100,
      y: lastDeleted.y ?? 100,
    });
    setIsSaving(false);

    if (error) {
      console.error('Errore annulla eliminazione', error);
      alert("Errore nell'annullare l'eliminazione.");
      return;
    }

    setLastDeleted(null);
    fetchTables();
  }

  // Drag & drop tavoli sulla mappa
  useEffect(() => {
    if (!draggingId) return;

    const handleMove = (event: any) => {
      const container = containerRef.current;
      if (!container) return;

      if (event.cancelable) event.preventDefault();

      const rect = container.getBoundingClientRect();
      const touch = event.touches ? event.touches[0] : null;
      const clientX = touch ? touch.clientX : event.clientX;
      const clientY = touch ? touch.clientY : event.clientY;
      if (clientX == null || clientY == null) return;

      let x = clientX - rect.left;
      let y = clientY - rect.top;

      const padding = 20;
      x = Math.max(padding, Math.min(W - padding, x));
      y = Math.max(padding, Math.min(H - padding, y));

      x = Math.round(x / GRID) * GRID;
      y = Math.round(y / GRID) * GRID;

      setTables((prev) =>
        prev.map((t) => (t.id === draggingId ? { ...t, x, y } : t))
      );
    };

    const handleUp = async () => {
      const t = tables.find((tbl) => tbl.id === draggingId);
      setDraggingId(null);
      if (!t) return;

      setIsSaving(true);
      const { error } = await supabase
        .from('tables')
        .update({ x: t.x, y: t.y })
        .eq('id', draggingId);
      setIsSaving(false);

      if (error) {
        console.error('Errore salvataggio posizione tavolo', error);
        alert('Errore nel salvataggio della posizione del tavolo.');
        return;
      }

      fetchTables();
    };

    window.addEventListener('mousemove', handleMove, { passive: false } as any);
    window.addEventListener('touchmove', handleMove, { passive: false } as any);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchend', handleUp);
    };
  }, [draggingId, tables]);

  return (
    <main style={{ padding: 16, maxWidth: 960, margin: '0 auto' }}>
      <a href="/" style={{ display: 'inline-block', marginBottom: 12 }}>
        ← Torna indietro
      </a>

      <h1 style={{ marginBottom: 4 }}>Area Staff – Tavoli</h1>
      {isSaving && (
        <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
          Salvataggio in corso…
        </div>
      )}

      {/* Barra comandi */}
      <section
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <label
            htmlFor="search-table"
            style={{ fontSize: 12, display: 'block', marginBottom: 2 }}
          >
            Cerca tavolo
          </label>
          <input
            id="search-table"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Es. 1, 12, T4…"
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid #ccc',
              fontSize: 13,
            }}
          />
        </div>

        <form
          onSubmit={handleAddTable}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            minWidth: 220,
          }}
        >
          <div style={{ flex: 1 }}>
            <label
              htmlFor="new-table"
              style={{ fontSize: 12, display: 'block', marginBottom: 2 }}
            >
              Nuovo tavolo
            </label>
            <input
              id="new-table"
              type="text"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              placeholder="Numero o nome (es. 15)"
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid #ccc',
                fontSize: 13,
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: '#01696f',
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            + Aggiungi
          </button>
        </form>

        {lastDeleted && (
          <button
            type="button"
            onClick={handleUndoDelete}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #f97316',
              backgroundColor: '#ffedd5',
              color: '#f14f0f',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ↩️ Annulla ultima eliminazione ({lastDeleted.name})
          </button>
        )}
      </section>

      {/* Toggle mappa tavoli */}
      <section style={{ marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setMapOpen((v) => !v)}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #fffcfc',
            backgroundColor: '#000000',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {mapOpen ? 'Nascondi mappa tavoli ▲' : 'Mostra mappa tavoli ▼'}
        </button>
      </section>

      {/* PIANTINA + TAVOLI DRAGGABILI (solo se aperta) */}
      {mapOpen && (
        <section
          style={{
            marginBottom: 16,
            border: '1px solid #bbb',
            borderRadius: 8,
            padding: 8,
            backgroundColor: '#3f3636',
          }}
        >
          <div
            style={{
              fontSize: 12,
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>Mappa tavoli (trascina per spostare, snap 20px)</span>
          </div>

          <div
            ref={containerRef}
            style={{
              position: 'relative',
              width: W,
              height: H,
              borderRadius: 6,
              overflow: 'hidden',
              margin: '0 auto',
            }}
          >
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none',
              }}
              width={W}
              height={H}
            >
              <defs>
                <pattern
                  id="grid"
                  width={GRID}
                  height={GRID}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
                    fill="none"
                    stroke="#e0e0e0"
                    strokeWidth="0.5"
                  />
                </pattern>
              </defs>

              <rect width={W} height={H} fill="url(#grid)" />

              <rect
                x={40}
                y={40}
                width={260}
                height={200}
                fill="none"
                stroke="#0044ff"
                strokeWidth={2.5}
              />
              <rect
                x={300}
                y={80}
                width={340}
                height={80}
                fill="none"
                stroke="#0044ff"
                strokeWidth={2.5}
              />
            </svg>

            {filteredTables.map((t) => {
              const { x, y } = getPos(t);
              const isDragging = draggingId === t.id;
              return (
                <button
                  key={t.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDraggingId(t.id);
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    setDraggingId(t.id);
                  }}
                  style={{
                    position: 'absolute',
                    left: x,
                    top: y,
                    transform: 'translate(-50%, -50%)',
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: isDragging ? '3px solid #f3d422' : '2px solid #111',
                    backgroundColor: getColor(t.status),
                    color: '#111',
                    fontSize: 12,
                    fontWeight: 'bold',
                    cursor: 'grab',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                    whiteSpace: 'nowrap',
                    zIndex: 10,
                  }}
                  title={`Trascina per spostare ${t.name}`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 8,
              display: 'flex',
              gap: 12,
              fontSize: 12,
              justifyContent: 'center',
            }}
          >
            <span>🟢 Libero</span>
            <span>🟠 Prenotato</span>
            <span>🔴 Occupato</span>
          </div>
        </section>
      )}

      {/* LISTA TAVOLI CON ORDINE, STATO, ELIMINA */}
      <section>
        <h2 style={{ marginBottom: 8, fontSize: 16 }}>
          Tavoli (ordinati per numero)
        </h2>
        {filteredTables.length === 0 ? (
          <p style={{ fontSize: 13, color: '#bd9292' }}>
            Nessun tavolo trovato con questa ricerca.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {filteredTables.map((t) => {
              const pos = getPos(t);
              const isDragging = t.id === draggingId;
              return (
                <li
                  key={t.id}
                  style={{
                    marginBottom: 8,
                    padding: 8,
                    borderRadius: 6,
                    border: isDragging ? '2px solid #01696f' : '1px solid #ddd',
                    backgroundColor: '#919092',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      Tavolo {t.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#554141' }}>
                      Stato: <strong>{t.status}</strong> • x:{' '}
                      {pos.x}px, y: {pos.y}px
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 4,
                      justifyContent: 'flex-end',
                    }}
                  >
                    <button
                      onClick={() => changeStatus(t.id, 'libero')}
                      style={statusBtnStyle}
                    >
                      🟢
                    </button>
                    <button
                      onClick={() => changeStatus(t.id, 'prenotato')}
                      style={statusBtnStyle}
                    >
                      🟠
                    </button>
                    <button
                      onClick={() => changeStatus(t.id, 'occupato')}
                      style={statusBtnStyle}
                    >
                      🔴
                    </button>

                    <button
                      onClick={() => router.push(`/staff/table/${t.id}`)}
                      style={{
                        ...statusBtnStyle,
                        backgroundColor: '#01696f',
                        color: 'white',
                      }}
                    >
                      📋 Ordine
                    </button>

                    <button
                      onClick={() => handleDeleteTable(t.id)}
                      style={{
                        ...statusBtnStyle,
                        backgroundColor: '#f13434',
                        color: '#f5d7d7',
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

const statusBtnStyle = {
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
  border: '1px solid #ffffff',
  backgroundColor: 'white',
} as const;