'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type TableStatus = 'libero' | 'prenotato' | 'occupato';
type OrderStatus = 'aperto' | 'in_preparazione' | 'pronto' | 'chiuso';

type Table = {
  id: string;
  name: string;
  status: TableStatus;
};

type Order = {
  id: string;
  table_id: string;
  status: OrderStatus;
  created_at: string;
};

type MenuCategory = {
  id: string;
  name: string;
};

type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  price: number;
  destination: string | null;
  is_fuori_menu?: boolean;
};

type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string;
  item_name: string;
  price: number;
  quantity: number;
  notes: string | null;
  is_fuori_menu?: boolean;
};

type OrderItemsMap = Record<string, OrderItem>;

export default function TableOrderPage() {
  const router = useRouter();
  const params = useParams<{ tableId: string }>();
  const tableId = params.tableId;

  const [table, setTable] = useState<Table | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sending, setSending] = useState(false);

  const [pendingItems, setPendingItems] = useState<Record<string, number>>({});
  const [productSearch, setProductSearch] = useState('');
  const [showCreateProduct, setShowCreateProduct] = useState(false);

  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newProductDestination, setNewProductDestination] = useState<'bar' | 'kitchen'>('bar');

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: tableData, error: tableError } = await supabase
          .from('tables')
          .select('*')
          .eq('id', tableId)
          .single();

        if (tableError) {
          console.error('Errore caricamento tavolo', tableError);
          return;
        }

        setTable(tableData as Table);

        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select('*')
          .eq('table_id', tableId)
          .neq('status', 'chiuso')
          .order('created_at', { ascending: false })
          .limit(1);

        if (ordersError) {
          console.error('Errore caricamento ordini', ordersError);
          return;
        }

        let currentOrder: Order | null = null;
        if (ordersData && ordersData.length > 0) {
          currentOrder = ordersData[0] as Order;
          setOrder(currentOrder);
        }

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

        if (loadedCategories.length > 0 && !selectedCategoryId) {
          setSelectedCategoryId(loadedCategories[0].id);
        }

        const { data: itemsData, error: itemsError } = await supabase
          .from('menu_items')
          .select('id, category_id, name, price, destination, is_fuori_menu')
          .order('name', { ascending: true });

        if (itemsError) {
          console.error('Errore caricamento menu items', itemsError);
          return;
        }

        setMenuItems((itemsData as MenuItem[]) ?? []);

        if (currentOrder) {
          const { data: orderItemsData, error: orderItemsError } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', currentOrder.id);

          if (orderItemsError) {
            console.error('Errore caricamento order_items', orderItemsError);
          } else if (orderItemsData) {
            const map: OrderItemsMap = {};
            (orderItemsData as OrderItem[]).forEach((oi) => {
              map[oi.menu_item_id] = oi;
            });
            setOrderItems(map);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    if (tableId) {
      loadData();
    }
  }, [tableId, selectedCategoryId]);

  const filteredMenuItems = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter((item) => item.name.toLowerCase().includes(q));
  }, [menuItems, productSearch]);

  const categoriesWithItems = useMemo(
    () =>
      categories.map((cat) => ({
        ...cat,
        items: filteredMenuItems.filter((item) => item.category_id === cat.id),
      })),
    [categories, filteredMenuItems]
  );

  const total = useMemo(() => {
    return Object.values(orderItems).reduce((sum, oi) => {
      return sum + oi.quantity * Number(oi.price ?? 0);
    }, 0);
  }, [orderItems]);

  const pendingTotal = useMemo(() => {
    return Object.entries(pendingItems).reduce((sum, [menuItemId, qty]) => {
      const item = menuItems.find((m) => m.id === menuItemId);
      return sum + (item?.price ?? 0) * qty;
    }, 0);
  }, [pendingItems, menuItems]);

  const ensureOrder = async (): Promise<Order | null> => {
    if (order) return order;

    const { data, error } = await supabase
      .from('orders')
      .insert({ table_id: tableId, status: 'aperto' })
      .select()
      .single();

    if (error) {
      console.error('Errore creazione ordine', error);
      return null;
    }

    const newOrder = data as Order;
    setOrder(newOrder);

    if (table && table.status === 'libero') {
      const { error: tableError } = await supabase
        .from('tables')
        .update({ status: 'occupato' })
        .eq('id', table.id);

      if (tableError) {
        console.error('Errore aggiornamento stato tavolo', tableError);
      } else {
        setTable({ ...table, status: 'occupato' });
      }
    }

    return newOrder;
  };

  const handleChangeQuantity = (item: MenuItem, delta: number) => {
    setOrderItems((prev) => {
      const existing = prev[item.id];
      const currentQty = existing ? existing.quantity : 0;
      const newQty = Math.max(currentQty + delta, 0);

      if (!existing && newQty === 0) return prev;

      if (newQty === 0) {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      }

      return {
        ...prev,
        [item.id]: {
          id: existing?.id ?? '',
          order_id: order?.id ?? '',
          menu_item_id: item.id,
          item_name: item.name,
          price: item.price,
          quantity: newQty,
          notes: null,
          is_fuori_menu: item.is_fuori_menu ?? false,
        },
      };
    });

    if (delta > 0) {
      setPendingItems((prev) => ({
        ...prev,
        [item.id]: (prev[item.id] ?? 0) + delta,
      }));
    } else {
      setPendingItems((prev) => {
        const current = prev[item.id] ?? 0;
        const newPending = Math.max(current + delta, 0);
        if (newPending === 0) {
          const copy = { ...prev };
          delete copy[item.id];
          return copy;
        }
        return { ...prev, [item.id]: newPending };
      });
    }
  };

  const handleSendOrder = async () => {
    if (Object.keys(pendingItems).length === 0) return;

    setSending(true);
    try {
      const currentOrder = await ensureOrder();
      if (!currentOrder) return;

      for (const [menuItemId, addedQty] of Object.entries(pendingItems)) {
        const item = menuItems.find((m) => m.id === menuItemId);
        if (!item) continue;

        const localItem = orderItems[menuItemId];
        const finalQty = localItem?.quantity ?? addedQty;

        const { data: existingRows } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', currentOrder.id)
          .eq('menu_item_id', menuItemId)
          .limit(1);

        const existingRow = existingRows?.[0] as OrderItem | undefined;

        if (existingRow) {
          const { error: updateError } = await supabase
            .from('order_items')
            .update({
              quantity: finalQty,
              price: item.price,
              item_name: item.name,
              is_fuori_menu: item.is_fuori_menu ?? false,
            })
            .eq('id', existingRow.id);

          if (updateError) {
            console.error('Errore aggiornamento order_item', updateError);
          } else {
            setOrderItems((prev) => ({
              ...prev,
              [menuItemId]: {
                ...existingRow,
                quantity: finalQty,
                price: item.price,
                item_name: item.name,
                is_fuori_menu: item.is_fuori_menu ?? false,
              },
            }));
          }
        } else {
          const { data: newRow, error: insertError } = await supabase
            .from('order_items')
            .insert({
              order_id: currentOrder.id,
              menu_item_id: item.id,
              item_name: item.name,
              price: item.price,
              quantity: finalQty,
              notes: null,
              is_fuori_menu: item.is_fuori_menu ?? false,
            })
            .select()
            .single();

          if (insertError) {
            console.error('Errore inserimento order_item', insertError);
          } else if (newRow) {
            setOrderItems((prev) => ({
              ...prev,
              [menuItemId]: newRow as OrderItem,
            }));
          }
        }

        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            type: 'ordine',
            message: `Tavolo ${table?.name ?? tableId}: ${addedQty}x ${item.name}${
              item.is_fuori_menu ? ' (fuori menù)' : ''
            }`,
            target_role: item.destination ?? 'bar',
            read: false,
          });

        if (notifError) {
          console.error('Errore creazione notifica', notifError);
        }
      }

      const count = Object.keys(pendingItems).length;
      setPendingItems({});
      alert(
        `✅ Ordine inviato! ${count} prodott${
          count === 1 ? 'o inviato' : 'i inviati'
        } a bar/cucina.`
      );
    } finally {
      setSending(false);
    }
  };

  const handleDeleteOrderItem = async (menuItemId: string) => {
    const existing = orderItems[menuItemId];
    if (!existing) return;

    setPendingItems((prev) => {
      const copy = { ...prev };
      delete copy[menuItemId];
      return copy;
    });

    if (existing.id) {
      setSaving(true);
      try {
        const { error } = await supabase
          .from('order_items')
          .delete()
          .eq('id', existing.id);

        if (error) {
          console.error('Errore eliminazione order_item', error);
          return;
        }
      } finally {
        setSaving(false);
      }
    }

    setOrderItems((prev) => {
      const copy = { ...prev };
      delete copy[menuItemId];
      return copy;
    });
  };

  const handleCreateProduct = async () => {
    const name = newProductName.trim();
    const price = Number(newProductPrice.replace(',', '.'));
    const categoryName = newCategoryName.trim();

    if (!name) {
      alert('Inserisci il nome del prodotto.');
      return;
    }

    if (!price || price <= 0) {
      alert('Inserisci un prezzo valido.');
      return;
    }

    setSaving(true);

    try {
      let categoryId = selectedCategoryId;

      if (categoryName) {
        const { data: createdCategory, error: categoryError } = await supabase
          .from('menu_categories')
          .insert({ name: categoryName })
          .select()
          .single();

        if (categoryError) {
          console.error('Errore creazione categoria', categoryError);
          alert('Errore nella creazione della categoria.');
          return;
        }

        const cat = createdCategory as MenuCategory;
        categoryId = cat.id;
        setCategories((prev) =>
          [...prev, cat].sort((a, b) => a.name.localeCompare(b.name))
        );
        setSelectedCategoryId(cat.id);
      }

      if (!categoryId) {
        alert('Seleziona una categoria o creane una nuova.');
        return;
      }

      const { data: createdItem, error: itemError } = await supabase
        .from('menu_items')
        .insert({
          category_id: categoryId,
          name,
          price,
          destination: newProductDestination,
          is_fuori_menu: true,
        })
        .select()
        .single();

      if (itemError) {
        console.error('Errore creazione prodotto', itemError);
        alert('Errore nella creazione del prodotto.');
        return;
      }

      const item = createdItem as MenuItem;
      setMenuItems((prev) =>
        [...prev, item].sort((a, b) => a.name.localeCompare(b.name))
      );

      setNewProductName('');
      setNewProductPrice('');
      setNewCategoryName('');
      setNewProductDestination('bar');
      setShowCreateProduct(false);

      handleChangeQuantity(item, 1);
    } finally {
      setSaving(false);
    }
  };

  const handleCloseOrder = async () => {
    if (!order || total <= 0) return;

    if (Object.keys(pendingItems).length > 0) {
      const confirm = window.confirm(
        '⚠️ Hai prodotti selezionati ma non ancora inviati a bar/cucina. Vuoi chiudere il conto comunque?'
      );
      if (!confirm) return;
    }

    setClosing(true);
    try {
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: 'chiuso' })
        .eq('id', order.id);

      if (orderError) {
        console.error('Errore chiusura ordine', orderError);
        return;
      }

      if (table) {
        const { error: tableError } = await supabase
          .from('tables')
          .update({ status: 'libero' })
          .eq('id', table.id);

        if (tableError) {
          console.error('Errore aggiornamento tavolo', tableError);
        } else {
          setTable({ ...table, status: 'libero' });
        }
      }

      setOrder({ ...order, status: 'chiuso' });
      router.push('/staff');
    } finally {
      setClosing(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 16, color: '#111' }}>Caricamento ordine tavolo…</div>;
  }

  if (!table) {
    return <div style={{ padding: 16, color: 'red' }}>Tavolo non trovato.</div>;
  }

  const hasPending = Object.keys(pendingItems).length > 0;

  return (
    <main style={{ padding: 16, backgroundColor: 'white', color: '#111' }}>
      <button
        type="button"
        onClick={() => router.push('/staff')}
        style={{
          marginBottom: 12,
          fontSize: 14,
          color: '#111',
          border: '1px solid #ddd',
          borderRadius: 6,
          padding: '6px 10px',
          backgroundColor: '#fff',
        }}
      >
        ← Torna alla mappa tavoli
      </button>

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4, color: '#111' }}>
            Tavolo {table.name}
          </h1>
          <div style={{ fontSize: 13, color: '#111' }}>
            Stato tavolo: <strong>{table.status}</strong>
            {order && (
              <>
                {' • '}Ordine: <strong>{order.status}</strong>
              </>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'right', minWidth: 160 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Totale ordine</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#111' }}>
            € {total.toFixed(2)}
          </div>

          {hasPending && (
            <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>
              + € {pendingTotal.toFixed(2)} da inviare
            </div>
          )}

          {hasPending && (
            <button
              type="button"
              onClick={handleSendOrder}
              disabled={sending}
              style={{
                marginTop: 8,
                padding: '10px 14px',
                borderRadius: 6,
                border: 'none',
                fontSize: 14,
                fontWeight: 700,
                cursor: sending ? 'not-allowed' : 'pointer',
                backgroundColor: sending ? '#ccc' : '#f59e0b',
                color: 'white',
                display: 'block',
                width: '100%',
              }}
            >
              {sending
                ? 'Invio in corso…'
                : `📤 Invia ordine (${Object.keys(pendingItems).length} prodott${
                    Object.keys(pendingItems).length === 1 ? 'o' : 'i'
                  })`}
            </button>
          )}

          <button
            type="button"
            onClick={handleCloseOrder}
            disabled={!order || total <= 0 || closing}
            style={{
              marginTop: 8,
              padding: '8px 14px',
              borderRadius: 6,
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: !order || total <= 0 || closing ? 'not-allowed' : 'pointer',
              backgroundColor: !order || total <= 0 || closing ? '#ccc' : '#059669',
              color: 'white',
              display: 'block',
              width: '100%',
            }}
          >
            {closing ? 'Chiusura in corso…' : '🧾 Chiudi conto'}
          </button>
        </div>
      </header>

      <section
        style={{
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'flex-end',
        }}
      >
        <div style={{ minWidth: 240, flex: 1 }}>
          <label
            htmlFor="product-search"
            style={{ display: 'block', fontSize: 12, marginBottom: 4, color: '#111' }}
          >
            Cerca prodotto
          </label>
          <input
            id="product-search"
            type="text"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Es. spritz, coca cola, panino..."
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid #ccc',
              borderRadius: 6,
              fontSize: 14,
              color: '#111',
              backgroundColor: '#fff',
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowCreateProduct((v) => !v)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #01696f',
            backgroundColor: showCreateProduct ? '#01696f' : '#fff',
            color: showCreateProduct ? 'white' : '#111',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {showCreateProduct ? 'Chiudi fuori menù' : '+ Fuori menù'}
        </button>
      </section>

      {showCreateProduct && (
        <section
          style={{
            marginBottom: 18,
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: 12,
            backgroundColor: '#fafafa',
          }}
        >
          <h2 style={{ fontSize: 16, marginBottom: 10, color: '#111' }}>
            Crea prodotto fuori menù
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
            }}
          >
            <div>
              <label style={labelStyle}>Nome prodotto</label>
              <input
                type="text"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="Es. Gin Tonic premium"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Prezzo</label>
              <input
                type="text"
                value={newProductPrice}
                onChange={(e) => setNewProductPrice(e.target.value)}
                placeholder="Es. 8.50"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Categoria esistente</label>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Seleziona categoria</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Oppure nuova categoria</label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Es. Fuori menù, Speciali"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Destinazione</label>
              <select
                value={newProductDestination}
                onChange={(e) =>
                  setNewProductDestination(e.target.value as 'bar' | 'kitchen')
                }
                style={inputStyle}
              >
                <option value="bar">Bar</option>
                <option value="kitchen">Cucina</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={handleCreateProduct}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: '#01696f',
                color: 'white',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Salva prodotto e aggiungi all'ordine
            </button>
          </div>
        </section>
      )}

      {(saving || sending) && (
        <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
          {sending ? 'Invio ordine in corso…' : 'Salvataggio modifiche…'}
        </div>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {categoriesWithItems.map((category) => (
          <div
            key={category.id}
            style={{
              border: '1px solid #ddd',
              borderRadius: 8,
              overflow: 'hidden',
              backgroundColor: '#fff',
            }}
          >
            <div
              style={{
                padding: '6px 10px',
                backgroundColor: '#f3f4f6',
                fontWeight: 600,
                fontSize: 14,
                color: '#111',
              }}
            >
              {category.name}
            </div>

            {category.items.length === 0 ? (
              <div style={{ padding: 8, fontSize: 12, color: '#777' }}>
                Nessun prodotto trovato in questa categoria.
              </div>
            ) : (
              <div>
                {category.items.map((item) => {
                  const oi = orderItems[item.id];
                  const qty = oi ? oi.quantity : 0;
                  const pendingQty = pendingItems[item.id] ?? 0;

                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '8px 10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderTop: '1px solid #eee',
                        gap: 12,
                        color: '#111',
                        backgroundColor: pendingQty > 0 ? '#fffbeb' : 'white',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>
                          {item.name}
                          {item.is_fuori_menu && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 999,
                                backgroundColor: '#fee2e2',
                                color: '#991b1b',
                              }}
                            >
                              FUORI MENÙ
                            </span>
                          )}
                        </div>

                        <span style={{ fontSize: 10, color: '#888', fontWeight: 500 }}>
                          {item.destination === 'kitchen' ? '🍽️ cucina' : '🍹 bar'}
                        </span>

                        {pendingQty > 0 && (
                          <span
                            style={{
                              display: 'inline-block',
                              marginLeft: 6,
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 4,
                              backgroundColor: '#fef3c7',
                              color: '#92400e',
                            }}
                          >
                            +{pendingQty} da inviare
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
                          € {item.price.toFixed(2)}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteOrderItem(item.id)}
                          disabled={!oi}
                          style={{
                            ...trashBtnStyle,
                            opacity: oi ? 1 : 0.4,
                            cursor: oi ? 'pointer' : 'not-allowed',
                          }}
                          title="Rimuovi del tutto il prodotto dall'ordine"
                        >
                          🗑️
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleChangeQuantity(item, -1)}
                            style={qtyBtnStyle}
                          >
                            −
                          </button>

                          <span
                            style={{
                              width: 24,
                              textAlign: 'center',
                              fontSize: 13,
                              fontWeight: qty > 0 ? 700 : 400,
                              color: qty > 0 ? '#111' : '#999',
                            }}
                          >
                            {qty}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleChangeQuantity(item, 1)}
                            style={qtyBtnStyle}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}

const qtyBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  border: '1px solid #ccc',
  cursor: 'pointer',
  fontSize: 16,
  backgroundColor: 'white',
  color: '#111',
  lineHeight: 1,
};

const trashBtnStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #ddd',
  backgroundColor: '#fff',
  color: '#111',
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  marginBottom: 4,
  color: '#111',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #ccc',
  borderRadius: 6,
  fontSize: 14,
  color: '#111',
  backgroundColor: '#fff',
};
