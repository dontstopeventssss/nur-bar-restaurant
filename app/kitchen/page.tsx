'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type NotificationRow = {
  id: string;
  type: string | null;
  message: string | null;
  target_role: string | null;
  read: boolean | null;
  created_at: string | null;
};

export default function KitchenPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sortNotifications = useCallback((rows: NotificationRow[]) => {
    return [...rows].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    });
  }, []);

  const loadNotifications = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('target_role', 'kitchen')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Errore caricamento notifiche cucina', error);
      setErrorMessage('Errore nel caricamento notifiche cucina.');
      setNotifications([]);
    } else {
      setNotifications(sortNotifications((data as NotificationRow[]) ?? []));
    }

    if (showLoader) setLoading(false);
  }, [sortNotifications]);

  const scheduleSilentRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      loadNotifications(false);
    }, 700);
  }, [loadNotifications]);

  useEffect(() => {
    loadNotifications();

    const channel = supabase
      .channel('kitchen-notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: 'target_role=eq.kitchen',
        },
        (payload) => {
          const newRow = payload.new as NotificationRow;

          setNotifications((prev) => {
            const alreadyExists = prev.some((n) => n.id === newRow.id);
            if (alreadyExists) return prev;
            return sortNotifications([...prev, newRow]);
          });

          scheduleSilentRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: 'target_role=eq.kitchen',
        },
        (payload) => {
          const updatedRow = payload.new as NotificationRow;

          setNotifications((prev) =>
            sortNotifications(
              prev.map((n) => (n.id === updatedRow.id ? updatedRow : n))
            )
          );

          scheduleSilentRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: 'target_role=eq.kitchen',
        },
        (payload) => {
          const oldRow = payload.old as NotificationRow;
          setNotifications((prev) => prev.filter((n) => n.id !== oldRow.id));
          scheduleSilentRefresh();
        }
      )
      .subscribe((status) => {
        console.log('Kitchen realtime status:', status);
      });

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [loadNotifications, scheduleSilentRefresh, sortNotifications]);

  const pendingOrders = useMemo(
    () => notifications.filter((n) => n.type !== 'completed'),
    [notifications]
  );

  const completedOrders = useMemo(
    () => notifications.filter((n) => n.type === 'completed'),
    [notifications]
  );

  const markAsCompleted = async (id: string) => {
    setErrorMessage(null);

    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, type: 'completed', read: true } : n
      )
    );

    const { error } = await supabase
      .from('notifications')
      .update({ type: 'completed', read: true })
      .eq('id', id)
      .eq('target_role', 'kitchen');

    if (error) {
      console.error('Errore completamento notifica cucina', error);
      setErrorMessage('Impossibile segnare l’ordine come completato.');
      await loadNotifications(false);
      return;
    }

    scheduleSilentRefresh();
  };

  const clearCompleted = async () => {
    if (completedOrders.length === 0) return;

    setClearing(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc(
      'clear_kitchen_completed_notifications'
    );

    console.log('RPC clear kitchen result:', data);

    if (error) {
      console.error('Errore pulizia completati cucina', error);
      setErrorMessage('Impossibile pulire i completati cucina.');
      setClearing(false);
      return;
    }

    setNotifications((prev) => prev.filter((n) => n.type !== 'completed'));
    await loadNotifications(false);
    setClearing(false);
  };

  return (
    <main style={styles.page}>
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.title}>🍽️ CUCINA</h1>
          <p style={styles.subtitle}>
            Ordini in arrivo — dal più vecchio al più recente
          </p>
        </div>

        <div style={styles.topActions}>
          <button onClick={() => loadNotifications()} style={styles.secondaryButton}>
            🔄 Aggiorna
          </button>
          <button onClick={() => router.push('/')} style={styles.secondaryButton}>
            ← Home
          </button>
        </div>
      </div>

      {errorMessage && <div style={styles.errorBox}>{errorMessage}</div>}

      {loading ? (
        <div style={styles.card}>Caricamento ordini cucina…</div>
      ) : (
        <div style={styles.layout}>
          <section style={styles.section}>
            <div style={styles.headerYellow}>
              📋 Coda ordini ({pendingOrders.length})
            </div>

            {pendingOrders.length === 0 ? (
              <div style={styles.emptyCard}>✅ Nessun ordine in coda.</div>
            ) : (
              pendingOrders.map((item, index) => (
                <div
                  key={item.id}
                  style={index === 0 ? styles.orderCardFirst : styles.orderCard}
                >
                  <div style={styles.orderMeta}>
                    {index === 0 && <span style={styles.badgeFirst}>⚡ PRIMO</span>}
                    <span style={styles.orderTime}>
                      🕐 {formatDate(item.created_at)}
                    </span>
                  </div>

                  <div style={styles.orderText}>
                    {item.message ?? 'Ordine cucina'}
                  </div>

                  <button
                    onClick={() => markAsCompleted(item.id)}
                    style={styles.greenButton}
                  >
                    ✅ Fatto
                  </button>
                </div>
              ))
            )}
          </section>

          <section style={styles.section}>
            <div style={styles.headerGreen}>
              <span>✅ Completati ({completedOrders.length})</span>

              {completedOrders.length > 0 && (
                <button
                  onClick={clearCompleted}
                  disabled={clearing}
                  style={{
                    ...styles.clearButton,
                    opacity: clearing ? 0.7 : 1,
                    cursor: clearing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {clearing ? 'Pulizia…' : '🗑️ Pulisci schermata'}
                </button>
              )}
            </div>

            {completedOrders.length === 0 ? (
              <div style={styles.emptyCard}>Nessun ordine completato.</div>
            ) : (
              completedOrders.map((item) => (
                <div key={item.id} style={styles.orderCardDone}>
                  <div style={styles.orderMeta}>
                    <span style={styles.badgeGreen}>Completato</span>
                    <span style={styles.orderTime}>
                      🕐 {formatDate(item.created_at)}
                    </span>
                  </div>

                  <div style={styles.orderTextDone}>
                    {item.message ?? 'Ordine cucina'}
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f5f5f5', padding: 16 },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  topActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  title: { margin: 0, fontSize: 28, color: '#111' },
  subtitle: { marginTop: 6, color: '#666', fontSize: 14 },
  card: {
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 12,
    padding: 16,
  },
  errorBox: {
    marginBottom: 16,
    background: '#fef2f2',
    border: '1px solid '#fecaca',
    color: '#991b1b',
    borderRadius: 12,
    padding: 12,
    fontWeight: 600,
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  section: { display: 'flex', flexDirection: 'column', gap: 12 },
  headerYellow: {
    background: '#facc15',
    color: '#111',
    fontWeight: 700,
    padding: '12px 14px',
    borderRadius: 10,
    fontSize: 16,
  },
  headerGreen: {
    background: '#4ade80',
    color: '#111',
    fontWeight: 700,
    padding: '12px 14px',
    borderRadius: 10,
    fontSize: 16,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  emptyCard: {
    background: '#fff',
    border: '1px dashed #ccc',
    borderRadius: 10,
    padding: 14,
    color: '#777',
    fontSize: 14,
  },
  orderCard: {
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 12,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  orderCardFirst: {
    background: '#fffbeb',
    border: '2px solid #f59e0b',
    borderRadius: 12,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  orderCardDone: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: 12,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  orderMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  orderTime: { fontSize: 12, color: '#666' },
  orderText: { fontSize: 16, color: '#111', fontWeight: 700, lineHeight: 1.4 },
  orderTextDone: { fontSize: 14, color: '#555', fontWeight: 500, lineHeight: 1.4 },
  badgeFirst: {
    background: '#f59e0b',
    color: '#fff',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 700,
  },
  badgeGreen: {
    background: '#bbf7d0',
    color: '#111',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 700,
  },
  greenButton: {
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 12px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15,
  },
  secondaryButton: {
    background: '#fff',
    color: '#111',
    border: '1px solid #ccc',
    borderRadius: 8,
    padding: '10px 12px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  clearButton: {
    background: '#fff',
    color: '#dc2626',
    border: '1px solid #dc2626',
    borderRadius: 8,
    padding: '5px 12px',
    fontWeight: 700,
    fontSize: 13,
  },
};
