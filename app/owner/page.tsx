'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Destination = 'bar' | 'kitchen';

type MenuCategory = {
  id: string;
  name: string;
  color: string | null;
};

type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  price: number;
  destination: Destination | null;
  is_fuori_menu?: boolean;
  description?: string | null;
};

type OrderRow = {
  id: string;
  status?: string;
  created_at?: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  item_name: string;
  quantity: number;
  price: number;
  is_fuori_menu?: boolean;
};

type SalesReportRow = {
  item_name: string;
  total_quantity: number;
  total_revenue: number;
  is_fuori_menu: boolean;
};

type ReportRange = 'today' | 'week' | 'month' | 'all';

const DEFAULT_OWNER_USERNAME = 'Franco';
const DEFAULT_OWNER_PASSWORD = '0000';

const CATEGORY_PRESET_COLORS = [
  '#111111',
  '#dc2626',
  '#f59e0b',
  '#16a34a',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#0891b2',
  '#6b4f3a',
];

const DEFAULT_CATEGORY_COLOR = '#111111';

export default function OwnerPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [ownerUsername, setOwnerUsername] = useState(DEFAULT_OWNER_USERNAME);
  const [ownerPassword, setOwnerPassword] = useState(DEFAULT_OWNER_PASSWORD);

  const [settingsUsername, setSettingsUsername] = useState(DEFAULT_OWNER_USERNAME);
  const [settingsPassword, setSettingsPassword] = useState(DEFAULT_OWNER_PASSWORD);
  const [credentialsOpen, setCredentialsOpen] = useState(false);

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [reportRows, setReportRows] = useState<SalesReportRow[]>([]);
  const [reportOrderIds, setReportOrderIds] = useState<string[]>([]);

  const [search, setSearch] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [reportRange, setReportRange] = useState<ReportRange>('all');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(DEFAULT_CATEGORY_COLOR);

  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductCategoryId, setNewProductCategoryId] = useState('');
  const [newProductDestination, setNewProductDestination] =
    useState<Destination>('bar');
  const [newProductDescription, setNewProductDescription] = useState('');

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDestination, setEditDestination] = useState<Destination>('bar');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedUsername =
      window.localStorage.getItem('nur_owner_username') || DEFAULT_OWNER_USERNAME;
    const savedPassword =
      window.localStorage.getItem('nur_owner_password') || DEFAULT_OWNER_PASSWORD;
    const savedAuth = window.localStorage.getItem('nur_owner_logged_in') === 'true';

    setOwnerUsername(savedUsername);
    setOwnerPassword(savedPassword);
    setSettingsUsername(savedUsername);
    setSettingsPassword(savedPassword);
    setIsAuthenticated(savedAuth);

    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, reportRange]);

  const isInSelectedRange = (dateString?: string) => {
    if (!dateString) return reportRange === 'all';
    if (reportRange === 'all') return true;

    const now = new Date();
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return false;

    if (reportRange === 'today') {
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      );
    }

    if (reportRange === 'week') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      return date >= sevenDaysAgo && date <= now;
    }

    if (reportRange === 'month') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      return date >= thirtyDaysAgo && date <= now;
    }

    return true;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('menu_categories')
        .select('*')
        .order('name', { ascending: true });

      if (categoriesError) {
        console.error('Errore caricamento categorie', categoriesError);
        return;
      }

      const loadedCategories = (categoriesData as MenuCategory[]) ?? [];
      setCategories(loadedCategories);

      if (!newProductCategoryId && loadedCategories.length > 0) {
        setNewProductCategoryId(loadedCategories[0].id);
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from('menu_items')
        .select('*')
        .order('name', { ascending: true });

      if (itemsError) {
        console.error('Errore caricamento prodotti', itemsError);
        return;
      }

      setMenuItems((itemsData as MenuItem[]) ?? []);

      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*');

      if (ordersError) {
        console.error('Errore caricamento ordini per report', ordersError);
        return;
      }

      const orders = (ordersData as OrderRow[]) ?? [];

      const filteredOrders = orders.filter((order) => {
        const statusOk = order.status === 'chiuso' || !order.status;
        const dateOk = isInSelectedRange(order.created_at);
        return statusOk && dateOk;
      });

      const validOrderIds = new Set(filteredOrders.map((order) => order.id));
      setReportOrderIds(filteredOrders.map((order) => order.id));

      const { data: orderItemsData, error: orderItemsError } = await supabase
        .from('order_items')
        .select('*');

      if (orderItemsError) {
        console.error('Errore caricamento report order_items', orderItemsError);
      } else {
        const rows = (orderItemsData ?? []) as OrderItemRow[];

        const grouped: Record<
          string,
          {
            item_name: string;
            total_quantity: number;
            total_revenue: number;
            is_fuori_menu: boolean;
          }
        > = {};

        rows
          .filter((row) => validOrderIds.has(row.order_id))
          .forEach((row) => {
            const cleanName = row.item_name ?? 'Prodotto sconosciuto';
            const isFuoriMenu = Boolean(row.is_fuori_menu);
            const key = `${isFuoriMenu ? 'fuori' : 'menu'}::${cleanName}`;

            if (!grouped[key]) {
              grouped[key] = {
                item_name: cleanName,
                total_quantity: 0,
                total_revenue: 0,
                is_fuori_menu: isFuoriMenu,
              };
            }

            grouped[key].total_quantity += Number(row.quantity ?? 0);
            grouped[key].total_revenue +=
              Number(row.quantity ?? 0) * Number(row.price ?? 0);
          });

        const finalRows = Object.values(grouped).sort(
          (a, b) => b.total_quantity - a.total_quantity
        );

        setReportRows(finalRows);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      const matchesSearch = !q || item.name.toLowerCase().includes(q);
      const matchesCategory =
        selectedCategoryFilter === 'all' ||
        item.category_id === selectedCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [menuItems, search, selectedCategoryFilter]);

  const filteredReportRows = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    if (!q) return reportRows;
    return reportRows.filter((row) =>
      row.item_name.toLowerCase().includes(q)
    );
  }, [reportRows, reportSearch]);

  const getCategoryName = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    return category?.name ?? 'Senza categoria';
  };

  const handleLogin = () => {
    if (
      loginUsername.trim() === ownerUsername &&
      loginPassword.trim() === ownerPassword
    ) {
      setIsAuthenticated(true);
      window.localStorage.setItem('nur_owner_logged_in', 'true');
      setLoginPassword('');
      return;
    }
    alert('Credenziali non corrette.');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    window.localStorage.setItem('nur_owner_logged_in', 'false');
    setLoginUsername('');
    setLoginPassword('');
  };

  const handleSaveOwnerCredentials = () => {
    const newUser = settingsUsername.trim();
    const newPass = settingsPassword.trim();

    if (!newUser) {
      alert('Inserisci un nome utente valido.');
      return;
    }
    if (!newPass) {
      alert('Inserisci una password valida.');
      return;
    }

    setOwnerUsername(newUser);
    setOwnerPassword(newPass);
    window.localStorage.setItem('nur_owner_username', newUser);
    window.localStorage.setItem('nur_owner_password', newPass);
    alert('Credenziali owner aggiornate con successo.');
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    const color = newCategoryColor.trim() || DEFAULT_CATEGORY_COLOR;

    if (!name) {
      alert('Inserisci il nome della categoria.');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('menu_categories')
        .insert({ name, color })
        .select()
        .single();

      if (error) {
        console.error('Errore creazione categoria', error);
        alert('Errore nella creazione della categoria.');
        return;
      }

      const created = data as MenuCategory;
      const updated = [...categories, created].sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      setCategories(updated);
      setNewCategoryName('');
      setNewCategoryColor(DEFAULT_CATEGORY_COLOR);
      setNewProductCategoryId(created.id);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const linkedItems = menuItems.filter((item) => item.category_id === categoryId);
    if (linkedItems.length > 0) {
      alert('Non puoi eliminare una categoria che contiene prodotti.');
      return;
    }

    if (!window.confirm('Vuoi eliminare questa categoria?')) return;
    if (
      !window.confirm(
        'Confermi di voler eliminare definitivamente questa categoria vuota?'
      )
    )
      return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('menu_categories')
        .delete()
        .eq('id', categoryId);

      if (error) {
        console.error('Errore eliminazione categoria', error);
        alert("Errore durante l'eliminazione della categoria.");
        return;
      }

      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
      if (selectedCategoryFilter === categoryId) setSelectedCategoryFilter('all');
      if (newProductCategoryId === categoryId) setNewProductCategoryId('');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProduct = async () => {
    const name = newProductName.trim();
    const price = Number(newProductPrice.replace(',', '.'));
    const categoryId = newProductCategoryId;
    const description = newProductDescription.trim();

    if (!name) {
      alert('Inserisci il nome del prodotto.');
      return;
    }
    if (!categoryId) {
      alert('Seleziona una categoria.');
      return;
    }
    if (!price || price <= 0) {
      alert('Inserisci un prezzo valido.');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .insert({
          name,
          price,
          category_id: categoryId,
          destination: newProductDestination,
          is_fuori_menu: false,
          description: description || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Errore creazione prodotto', error);
        alert('Errore nella creazione del prodotto.');
        return;
      }

      const created = data as MenuItem;
      setMenuItems((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      );

      setNewProductName('');
      setNewProductPrice('');
      setNewProductDestination('bar');
      setNewProductDescription('');
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const startEditItem = (item: MenuItem) => {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditPrice(String(item.price));
    setEditCategoryId(item.category_id);
    setEditDestination(item.destination ?? 'bar');
    setEditDescription(item.description ?? '');
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditName('');
    setEditPrice('');
    setEditCategoryId('');
    setEditDestination('bar');
    setEditDescription('');
  };

  const handleSaveItem = async () => {
    if (!editingItemId) return;

    const name = editName.trim();
    const price = Number(editPrice.replace(',', '.'));
    const categoryId = editCategoryId;
    const description = editDescription.trim();

    if (!name) {
      alert('Inserisci il nome del prodotto.');
      return;
    }
    if (!categoryId) {
      alert('Seleziona una categoria.');
      return;
    }
    if (!price || price <= 0) {
      alert('Inserisci un prezzo valido.');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .update({
          name,
          price,
          category_id: categoryId,
          destination: editDestination,
          description: description || null,
        })
        .eq('id', editingItemId)
        .select()
        .single();

      if (error) {
        console.error('Errore modifica prodotto', error);
        alert('Errore durante il salvataggio del prodotto.');
        return;
      }

      const updated = data as MenuItem;
      setMenuItems((prev) =>
        prev
          .map((item) => (item.id === editingItemId ? updated : item))
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      cancelEditItem();
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (!window.confirm(`Vuoi eliminare il prodotto "${itemName}" dal menu?`)) return;
    if (
      !window.confirm(
        `Conferma definitiva: eliminare davvero "${itemName}"? Questa azione non si può annullare.`
      )
    )
      return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', itemId);

      if (error) {
        console.error('Errore eliminazione prodotto', error);
        alert("Errore durante l'eliminazione del prodotto.");
        return;
      }

      setMenuItems((prev) => prev.filter((item) => item.id !== itemId));
      if (editingItemId === itemId) cancelEditItem();
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHistoricalReportData = async () => {
    if (reportOrderIds.length === 0) {
      alert('Non ci sono dati storici da eliminare nel periodo selezionato.');
      return;
    }

    if (
      !window.confirm(
        'ATTENZIONE: stai per eliminare i dati storici del report per il periodo selezionato. Vuoi continuare?'
      )
    )
      return;
    if (
      !window.confirm(
        'Seconda conferma: verranno eliminati ordini e righe ordine collegate al report. Sei sicuro?'
      )
    )
      return;

    const typed = window.prompt(
      'Terza conferma obbligatoria: scrivi ELIMINA per procedere definitivamente.'
    );
    if (typed !== 'ELIMINA') {
      alert('Conferma finale non valida. Nessun dato eliminato.');
      return;
    }

    setSaving(true);
    try {
      const { error: orderItemsDeleteError } = await supabase
        .from('order_items')
        .delete()
        .in('order_id', reportOrderIds);

      if (orderItemsDeleteError) {
        console.error(
          'Errore eliminazione order_items storico',
          orderItemsDeleteError
        );
        alert("Errore durante l'eliminazione delle righe storiche del report.");
        return;
      }

      const { error: ordersDeleteError } = await supabase
        .from('orders')
        .delete()
        .in('id', reportOrderIds);

      if (ordersDeleteError) {
        console.error('Errore eliminazione orders storico', ordersDeleteError);
        alert("Errore durante l'eliminazione degli ordini storici.");
        return;
      }

      alert('Storico report eliminato con successo.');
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const DestinationToggle = ({
    value,
    onChange,
  }: {
    value: Destination;
    onChange: (v: Destination) => void;
  }) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 6,
        width: '100%',
        minWidth: 0,
      }}
    >
      <button
        type="button"
        onClick={() => onChange('bar')}
        style={{
          padding: '7px 6px',
          borderRadius: 6,
          border: `1.5px solid ${value === 'bar' ? '#1e40af' : '#ccc'}`,
          backgroundColor: value === 'bar' ? '#dbeafe' : '#fff',
          color: value === 'bar' ? '#1e40af' : '#666',
          fontWeight: 700,
          fontSize: 11,
          cursor: 'pointer',
          minHeight: 34,
          minWidth: 0,
        }}
      >
        BAR
      </button>
      <button
        type="button"
        onClick={() => onChange('kitchen')}
        style={{
          padding: '7px 6px',
          borderRadius: 6,
          border: `1.5px solid ${value === 'kitchen' ? '#92400e' : '#ccc'}`,
          backgroundColor: value === 'kitchen' ? '#fef3c7' : '#fff',
          color: value === 'kitchen' ? '#92400e' : '#666',
          fontWeight: 700,
          fontSize: 11,
          cursor: 'pointer',
          minHeight: 34,
          minWidth: 0,
        }}
      >
        CUCINA
      </button>
    </div>
  );

  if (!isAuthenticated) {
    return (
      <main style={styles.loginPage}>
        <div style={styles.loginCard}>
          <h1 style={styles.title}>Accesso Owner</h1>
          <p style={styles.subtitle}>
            Inserisci credenziali per entrare nell&apos;area amministrazione
          </p>

          <div style={styles.formGrid}>
            <div>
              <label style={styles.label}>Nome utente</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Franco"
                style={styles.input}
              />
            </div>
            <div>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="0000"
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.stackButtonsCompact}>
            <button
              type="button"
              onClick={handleLogin}
              style={styles.primaryButtonWide}
            >
              Entra
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              style={styles.secondaryButtonWide}
            >
              Torna home
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.pageWrap}>
      <div style={styles.topBar}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={styles.title}>Dashboard Owner</h1>
          <p style={styles.subtitle}>
            Gestione menu, credenziali e report prodotti più consumati
          </p>
        </div>

        <div style={isMobile ? styles.topButtonsMobile : styles.topButtonsDesktop}>
          <button
            type="button"
            onClick={() => router.push('/')}
            style={isMobile ? styles.secondaryButtonHalf : styles.secondaryButton}
          >
            ← Home
          </button>
          <button
            type="button"
            onClick={handleLogout}
            style={isMobile ? styles.secondaryButtonHalf : styles.secondaryButton}
          >
            Logout
          </button>
        </div>
      </div>

      {loading ? (
        <div style={styles.card}>Caricamento dati…</div>
      ) : (
        <div
          style={{
            ...styles.layout,
            gridTemplateColumns: isMobile ? '1fr' : '290px minmax(0, 1fr)',
          }}
        >
          <section style={styles.leftColumn}>
            <div style={styles.cardCompact}>
              <button
                type="button"
                onClick={() => setCredentialsOpen((v) => !v)}
                style={styles.accordionButton}
              >
                <span>Credenziali owner</span>
                <span>{credentialsOpen ? '▴' : '▾'}</span>
              </button>

              {credentialsOpen && (
                <div style={{ marginTop: 10 }}>
                  <div style={styles.formGrid}>
                    <div>
                      <label style={styles.label}>Nome utente</label>
                      <input
                        type="text"
                        value={settingsUsername}
                        onChange={(e) => setSettingsUsername(e.target.value)}
                        style={styles.input}
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Password</label>
                      <input
                        type="password"
                        value={settingsPassword}
                        onChange={(e) => setSettingsPassword(e.target.value)}
                        style={styles.input}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={handleSaveOwnerCredentials}
                      style={styles.primaryButtonWide}
                    >
                      Salva credenziali
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={styles.cardCompact}>
              <h2 style={styles.sectionTitle}>Categorie</h2>

              <div style={styles.formColumnTight}>
                <input
                  type="text"
                  placeholder="Nuova categoria"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  style={styles.input}
                />

                <div>
                  <label style={styles.label}>Colore categoria</label>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                      gap: 6,
                    }}
                  >
                    {CATEGORY_PRESET_COLORS.map((color) => {
                      const selected = newCategoryColor === color;

                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewCategoryColor(color)}
                          title={color}
                          style={{
                            height: 32,
                            borderRadius: 8,
                            border: selected ? '3px solid #111' : '1px solid #d1d5db',
                            backgroundColor: color,
                            cursor: 'pointer',
                            minWidth: 0,
                          }}
                        />
                      );
                    })}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        backgroundColor: newCategoryColor,
                        border: '1px solid #ccc',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        color: '#444',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {newCategoryColor}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreateCategory}
                  style={styles.primaryButtonWide}
                >
                  Aggiungi
                </button>
              </div>

              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('all')}
                  style={{
                    ...styles.categoryLineButton,
                    backgroundColor: selectedCategoryFilter === 'all' ? '#111' : '#fff',
                    color: selectedCategoryFilter === 'all' ? '#fff' : '#111',
                    borderColor: selectedCategoryFilter === 'all' ? '#111' : '#ddd',
                  }}
                >
                  Tutte le categorie
                </button>

                {categories.map((category) => {
                  const count = menuItems.filter(
                    (item) => item.category_id === category.id
                  ).length;

                  const active = selectedCategoryFilter === category.id;
                  const categoryColor = category.color || DEFAULT_CATEGORY_COLOR;

                  return (
                    <div key={category.id} style={styles.categoryRowSingle}>
                      <button
                        type="button"
                        onClick={() => setSelectedCategoryFilter(category.id)}
                        style={{
                          ...styles.categoryLineButton,
                          flex: 1,
                          minWidth: 0,
                          backgroundColor: active ? categoryColor : '#fff',
                          color: active ? '#fff' : '#111',
                          borderColor: active ? categoryColor : '#ddd',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            flexWrap: 'wrap',
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              backgroundColor: categoryColor,
                              display: 'inline-block',
                              border: '1px solid rgba(0,0,0,0.15)',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ overflowWrap: 'anywhere' }}>
                            {category.name} ({count})
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(category.id)}
                        style={styles.redButtonMini}
                        title="Elimina categoria"
                      >
                        Elimina
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={styles.cardCompact}>
              <h2 style={styles.sectionTitle}>Nuovo prodotto</h2>

              <div style={styles.formGrid}>
                <div>
                  <label style={styles.label}>Nome prodotto</label>
                  <input
                    type="text"
                    placeholder="Es. Americano"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>Prezzo</label>
                  <input
                    type="text"
                    placeholder="Es. 7.50"
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>Categoria</label>
                  <select
                    value={newProductCategoryId}
                    onChange={(e) => setNewProductCategoryId(e.target.value)}
                    style={styles.input}
                  >
                    <option value="">Seleziona categoria</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={styles.label}>Destinazione</label>
                  <DestinationToggle
                    value={newProductDestination}
                    onChange={setNewProductDestination}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={styles.label}>Descrizione / ingredienti</label>
                  <textarea
                    value={newProductDescription}
                    onChange={(e) => setNewProductDescription(e.target.value)}
                    placeholder="Es. Hamburger di manzo, cheddar, lattuga, pomodoro, salsa burger"
                    style={styles.textarea}
                  />
                </div>
              </div>

              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={handleCreateProduct}
                  style={styles.primaryButtonWide}
                >
                  Salva prodotto
                </button>
              </div>
            </div>
          </section>

          <section style={styles.rightColumn}>
            <div style={styles.cardCompact}>
              <div
                style={
                  isMobile ? styles.productsHeaderMobile : styles.productsHeader
                }
              >
                <div style={{ minWidth: 0 }}>
                  <h2 style={styles.sectionTitle}>Prodotti menu</h2>
                  <p style={styles.smallText}>
                    Modifica nome, prezzo, categoria, destinazione e descrizione.
                  </p>
                </div>

                <input
                  type="text"
                  placeholder="Cerca prodotto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    ...styles.input,
                    minWidth: isMobile ? 0 : 200,
                    width: isMobile ? '100%' : undefined,
                  }}
                />
              </div>

              {saving && (
                <div style={{ ...styles.smallText, marginBottom: 8 }}>
                  Salvataggio in corso…
                </div>
              )}

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Nome</th>
                      <th style={styles.th}>Categoria</th>
                      <th style={styles.th}>Prezzo</th>
                      <th style={styles.th}>Dest.</th>
                      <th style={styles.th}>Descrizione</th>
                      <th style={styles.th}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td style={styles.emptyTd} colSpan={6}>
                          Nessun prodotto trovato.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => {
                        const isEditing = editingItemId === item.id;

                        return (
                          <tr key={item.id}>
                            <td style={styles.td}>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  style={styles.input}
                                />
                              ) : (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    flexWrap: 'wrap',
                                    minWidth: 0,
                                  }}
                                >
                                  <span style={{ overflowWrap: 'anywhere' }}>{item.name}</span>
                                  {item.is_fuori_menu && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        padding: '3px 6px',
                                        borderRadius: 999,
                                        backgroundColor: '#fee2e2',
                                        color: '#991b1b',
                                        whiteSpace: 'nowrap',
                                        display: 'inline-block',
                                      }}
                                    >
                                      FUORI MENÙ
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td style={styles.td}>
                              {isEditing ? (
                                <select
                                  value={editCategoryId}
                                  onChange={(e) => setEditCategoryId(e.target.value)}
                                  style={styles.input}
                                >
                                  <option value="">Seleziona categoria</option>
                                  {categories.map((category) => (
                                    <option key={category.id} value={category.id}>
                                      {category.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                getCategoryName(item.category_id)
                              )}
                            </td>

                            <td style={styles.td}>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editPrice}
                                  onChange={(e) => setEditPrice(e.target.value)}
                                  style={styles.input}
                                />
                              ) : (
                                `€ ${Number(item.price).toFixed(2)}`
                              )}
                            </td>

                            <td style={styles.td}>
                              {isEditing ? (
                                <DestinationToggle
                                  value={editDestination}
                                  onChange={setEditDestination}
                                />
                              ) : (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '3px 6px',
                                    borderRadius: 999,
                                    backgroundColor:
                                      item.destination === 'kitchen'
                                        ? '#fef3c7'
                                        : '#dbeafe',
                                    color:
                                      item.destination === 'kitchen'
                                        ? '#92400e'
                                        : '#1e40af',
                                    whiteSpace: 'nowrap',
                                    display: 'inline-block',
                                  }}
                                >
                                  {item.destination === 'kitchen' ? 'CUCINA' : 'BAR'}
                                </span>
                              )}
                            </td>

                            <td style={styles.td}>
                              {isEditing ? (
                                <textarea
                                  value={editDescription}
                                  onChange={(e) => setEditDescription(e.target.value)}
                                  placeholder="Descrizione / ingredienti"
                                  style={styles.textareaSmall}
                                />
                              ) : item.description ? (
                                <div style={styles.descriptionPreview}>
                                  {item.description}
                                </div>
                              ) : (
                                <span style={{ color: '#999', fontSize: 12 }}>—</span>
                              )}
                            </td>

                            <td style={styles.td}>
                              <div
                                style={
                                  isMobile ? styles.actionsColumn : styles.actionsRow
                                }
                              >
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={handleSaveItem}
                                      style={
                                        isMobile
                                          ? styles.primaryButtonMiniWide
                                          : styles.primaryButtonMini
                                      }
                                    >
                                      Salva
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditItem}
                                      style={
                                        isMobile
                                          ? styles.secondaryButtonMiniWide
                                          : styles.secondaryButtonMini
                                      }
                                    >
                                      Annulla
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => startEditItem(item)}
                                      style={
                                        isMobile
                                          ? styles.secondaryButtonMiniWide
                                          : styles.secondaryButtonMini
                                      }
                                    >
                                      Modifica
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteItem(item.id, item.name)
                                      }
                                      style={
                                        isMobile
                                          ? styles.redButtonMiniWide
                                          : styles.redButtonMini
                                      }
                                    >
                                      Elimina
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={styles.cardCompact}>
              <div
                style={
                  isMobile ? styles.productsHeaderMobile : styles.productsHeader
                }
              >
                <div style={{ minWidth: 0 }}>
                  <h2 style={styles.sectionTitle}>Report prodotti più venduti</h2>
                  <p style={styles.smallText}>
                    Classifica consumi per singolo prodotto.
                  </p>
                </div>

                <div
                  style={
                    isMobile ? styles.reportControlsMobile : styles.reportControls
                  }
                >
                  <select
                    value={reportRange}
                    onChange={(e) =>
                      setReportRange(e.target.value as ReportRange)
                    }
                    style={{
                      ...styles.input,
                      minWidth: isMobile ? 0 : 130,
                      width: isMobile ? '100%' : undefined,
                    }}
                  >
                    <option value="today">Oggi</option>
                    <option value="week">Ultimi 7 giorni</option>
                    <option value="month">Ultimi 30 giorni</option>
                    <option value="all">Tutto</option>
                  </select>

                  <input
                    type="text"
                    placeholder="Cerca nel report..."
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    style={{
                      ...styles.input,
                      minWidth: isMobile ? 0 : 180,
                      width: isMobile ? '100%' : undefined,
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={handleDeleteHistoricalReportData}
                  style={styles.bigDangerButtonWide}
                >
                  ELIMINA DATI STORICI REPORT
                </button>
                <p
                  style={{
                    ...styles.smallText,
                    marginTop: 6,
                    color: '#991b1b',
                  }}
                >
                  Elimina ordini e righe ordine del periodo selezionato.
                </p>
              </div>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>Prodotto</th>
                      <th style={styles.th}>Q.tà</th>
                      <th style={styles.th}>Incasso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReportRows.length === 0 ? (
                      <tr>
                        <td style={styles.emptyTd} colSpan={4}>
                          Nessun dato disponibile per il periodo selezionato.
                        </td>
                      </tr>
                    ) : (
                      filteredReportRows.map((row, index) => (
                        <tr key={`${row.item_name}-${index}`}>
                          <td style={styles.td}>{index + 1}</td>
                          <td style={styles.td}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                flexWrap: 'wrap',
                                minWidth: 0,
                              }}
                            >
                              <span style={{ overflowWrap: 'anywhere' }}>
                                {row.item_name}
                              </span>
                              {row.is_fuori_menu && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '3px 6px',
                                    borderRadius: 999,
                                    backgroundColor: '#fee2e2',
                                    color: '#991b1b',
                                    whiteSpace: 'nowrap',
                                    display: 'inline-block',
                                  }}
                                >
                                  FUORI MENÙ
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={styles.td}>{row.total_quantity}</td>
                          <td style={styles.td}>
                            € {row.total_revenue.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrap: {
    padding: 10,
    width: '100%',
    maxWidth: 1100,
    margin: '0 auto',
    backgroundColor: '#f5f5f5',
    minHeight: '100vh',
    color: '#111',
    overflowX: 'hidden',
    boxSizing: 'border-box',
  },
  loginPage: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    padding: 14,
    boxSizing: 'border-box',
  },
  loginCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: 10,
    padding: 14,
    boxSizing: 'border-box',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  title: {
    fontSize: 22,
    margin: 0,
    color: '#111',
  },
  subtitle: {
    margin: '4px 0 0 0',
    color: '#555',
    fontSize: 13,
    lineHeight: 1.3,
  },
  layout: {
    display: 'grid',
    gap: 10,
    minWidth: 0,
  },
  leftColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minWidth: 0,
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minWidth: 0,
  },
  card: {
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: 10,
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  cardCompact: {
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: 8,
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  accordionButton: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #d6d6d6',
    backgroundColor: '#fafafa',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  sectionTitle: {
    fontSize: 15,
    margin: '0 0 8px 0',
    color: '#111',
  },
  formGrid: {
    display: 'grid',
    gap: 8,
    minWidth: 0,
  },
  formColumnTight: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
  },
  input: {
    width: '100%',
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 13,
    backgroundColor: '#fff',
    color: '#111',
    minHeight: 32,
    minWidth: 0,
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    minHeight: 82,
    resize: 'vertical',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 13,
    backgroundColor: '#fff',
    color: '#111',
    fontFamily: 'inherit',
    lineHeight: 1.4,
    minWidth: 0,
    boxSizing: 'border-box',
  },
  textareaSmall: {
    width: '100%',
    minHeight: 70,
    resize: 'vertical',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 12,
    backgroundColor: '#fff',
    color: '#111',
    fontFamily: 'inherit',
    lineHeight: 1.4,
    minWidth: 0,
    boxSizing: 'border-box',
  },
  descriptionPreview: {
    maxWidth: 260,
    fontSize: 12,
    color: '#444',
    lineHeight: 1.35,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  },
  label: {
    display: 'block',
    marginBottom: 3,
    fontSize: 11,
    color: '#444',
    fontWeight: 600,
  },
  primaryButtonWide: {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#111',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    minHeight: 34,
    boxSizing: 'border-box',
  },
  secondaryButton: {
    padding: '7px 10px',
    borderRadius: 6,
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    color: '#111',
    cursor: 'pointer',
    fontSize: 13,
    minHeight: 34,
    boxSizing: 'border-box',
  },
  secondaryButtonWide: {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 6,
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    color: '#111',
    cursor: 'pointer',
    fontSize: 13,
    minHeight: 34,
    boxSizing: 'border-box',
  },
  secondaryButtonHalf: {
    flex: 1,
    minWidth: 0,
    padding: '7px 8px',
    borderRadius: 6,
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    color: '#111',
    cursor: 'pointer',
    fontSize: 12,
    minHeight: 34,
    boxSizing: 'border-box',
  },
  primaryButtonMini: {
    padding: '5px 7px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#111',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    minHeight: 28,
    boxSizing: 'border-box',
  },
  primaryButtonMiniWide: {
    width: '100%',
    padding: '5px 7px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#111',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    minHeight: 28,
    boxSizing: 'border-box',
  },
  secondaryButtonMini: {
    padding: '5px 7px',
    borderRadius: 6,
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    color: '#111',
    cursor: 'pointer',
    fontSize: 11,
    minHeight: 28,
    boxSizing: 'border-box',
  },
  secondaryButtonMiniWide: {
    width: '100%',
    padding: '5px 7px',
    borderRadius: 6,
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    color: '#111',
    cursor: 'pointer',
    fontSize: 11,
    minHeight: 28,
    boxSizing: 'border-box',
  },
  redButtonMini: {
    padding: '5px 8px',
    borderRadius: 6,
    border: '1px solid #b91c1c',
    backgroundColor: '#e12424',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    minHeight: 28,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    boxSizing: 'border-box',
  },
  redButtonMiniWide: {
    width: '100%',
    padding: '5px 8px',
    borderRadius: 6,
    border: '1px solid #b91c1c',
    backgroundColor: '#e12424',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    minHeight: 28,
    boxSizing: 'border-box',
  },
  bigDangerButtonWide: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '2px solid #991b1b',
    backgroundColor: '#dc2626',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    minHeight: 38,
    boxSizing: 'border-box',
  },
  categoryRowSingle: {
    display: 'flex',
    gap: 6,
    alignItems: 'stretch',
    minWidth: 0,
    width: '100%',
    flexWrap: 'nowrap',
  },
  categoryLineButton: {
    padding: '7px 9px',
    borderRadius: 6,
    border: '1px solid #ddd',
    backgroundColor: '#fff',
    color: '#111',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: 12,
    minHeight: 34,
    minWidth: 0,
    width: '100%',
    boxSizing: 'border-box',
    overflowWrap: 'anywhere',
  },
  productsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    marginBottom: 8,
    minWidth: 0,
  },
  productsHeaderMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'stretch',
    marginBottom: 8,
    minWidth: 0,
  },
  reportControls: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
    minWidth: 0,
  },
  reportControlsMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: '100%',
    minWidth: 0,
  },
  smallText: {
    fontSize: 11,
    color: '#666',
    margin: 0,
    lineHeight: 1.3,
  },
  tableWrap: {
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    maxWidth: '100%',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    fontSize: 10,
    color: '#666',
    borderBottom: '1px solid #ddd',
    padding: '7px 5px',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '7px 5px',
    borderBottom: '1px solid #eee',
    verticalAlign: 'top',
    fontSize: 12,
    color: '#111',
  },
  emptyTd: {
    padding: '14px 8px',
    textAlign: 'center',
    color: '#777',
    fontSize: 12,
  },
  actionsRow: {
    display: 'flex',
    gap: 5,
    alignItems: 'center',
    flexWrap: 'wrap',
    minWidth: 0,
  },
  actionsColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    alignItems: 'stretch',
    minWidth: 78,
  },
  topButtonsDesktop: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    minWidth: 0,
  },
  topButtonsMobile: {
    display: 'flex',
    gap: 6,
    width: '100%',
    minWidth: 0,
  },
  stackButtonsCompact: {
    marginTop: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: '100%',
    minWidth: 0,
  },
};
