
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const CATEGORIES = [
  { value: 'cards', label: 'PVC Cards' },
  { value: 'casings', label: 'ID Casings' },
  { value: 'lamination', label: 'Lamination' },
  { value: 'ink', label: 'Ink and Printing' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'other', label: 'Other' },
];

const TRANSACTION_TYPES = [
  { value: 'stock_in', label: 'Stock In' },
  { value: 'stock_out', label: 'Stock Out / Usage' },
  { value: 'return', label: 'Return to Stock' },
  { value: 'adjustment', label: 'Stock Adjustment' },
];

const emptyMaterial = {
  material_name: '',
  category: 'cards',
  unit_of_measure: 'pieces',
  current_quantity: '0',
  reorder_level: '0',
  unit_cost: '0',
  notes: '',
  is_active: true,
};

const emptyTransaction = {
  material_id: '',
  transaction_type: 'stock_in',
  quantity: '',
  unit_cost: '',
  order_id: '',
  reference_number: '',
  notes: '',
  adjustment_direction: 'increase',
};

function money(value) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function number(value) {
  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 3,
  }).format(Number(value || 0));
}

function categoryLabel(value) {
  return CATEGORIES.find((item) => item.value === value)?.label || value;
}

function errorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

export default function InventoryPage({ userRole }) {
  const isOwner = userRole === 'owner';

  const [materials, setMaterials] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('materials');

  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState(null);
  const [materialForm, setMaterialForm] = useState({ ...emptyMaterial });

  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [transactionForm, setTransactionForm] = useState({
    ...emptyTransaction,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [
        materialsResult,
        transactionsResult,
        ordersResult,
      ] = await Promise.all([
        supabase
          .from('materials')
          .select('*')
          .order('material_name'),
        supabase
          .from('material_transactions')
          .select(`
            id,
            material_id,
            order_id,
            recorded_by,
            transaction_type,
            quantity,
            unit_cost,
            reference_number,
            transaction_date,
            notes,
            materials(material_name, unit_of_measure),
            orders(order_number, order_title)
          `)
          .order('transaction_date', { ascending: false })
          .limit(200),
        supabase
          .from('orders')
          .select('id, order_number, order_title')
          .order('created_at', { ascending: false }),
      ]);

      if (materialsResult.error) throw materialsResult.error;
      if (transactionsResult.error) throw transactionsResult.error;
      if (ordersResult.error) throw ordersResult.error;

      setMaterials(materialsResult.data || []);
      setTransactions(transactionsResult.data || []);
      setOrders(ordersResult.data || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeMaterials = useMemo(
    () => materials.filter((item) => item.is_active),
    [materials]
  );

  const lowStockMaterials = useMemo(
    () =>
      activeMaterials.filter(
        (item) =>
          Number(item.current_quantity) <= Number(item.reorder_level)
      ),
    [activeMaterials]
  );

  const totalInventoryValue = useMemo(
    () =>
      activeMaterials.reduce(
        (total, item) =>
          total +
          Number(item.current_quantity) * Number(item.unit_cost),
        0
      ),
    [activeMaterials]
  );

  const filteredMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();

    return materials.filter((item) => {
      const matchesSearch =
        !query ||
        item.material_name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.unit_of_measure.toLowerCase().includes(query);

      const matchesCategory =
        categoryFilter === 'all' || item.category === categoryFilter;

      const isLow =
        item.is_active &&
        Number(item.current_quantity) <= Number(item.reorder_level);

      const matchesStock =
        stockFilter === 'all' ||
        (stockFilter === 'low' && isLow) ||
        (stockFilter === 'healthy' && item.is_active && !isLow) ||
        (stockFilter === 'inactive' && !item.is_active);

      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [materials, search, categoryFilter, stockFilter]);

  function updateMaterialField(field, value) {
    setMaterialForm((current) => ({ ...current, [field]: value }));
  }

  function updateTransactionField(field, value) {
    setTransactionForm((current) => ({ ...current, [field]: value }));
  }

  function openNewMaterial() {
    setEditingMaterialId(null);
    setMaterialForm({ ...emptyMaterial });
    setError('');
    setSuccess('');
    setShowMaterialForm(true);
  }

  function openEditMaterial(material) {
    setEditingMaterialId(material.id);
    setMaterialForm({
      material_name: material.material_name,
      category: material.category,
      unit_of_measure: material.unit_of_measure,
      current_quantity: String(material.current_quantity),
      reorder_level: String(material.reorder_level),
      unit_cost: String(material.unit_cost),
      notes: material.notes || '',
      is_active: material.is_active,
    });
    setError('');
    setSuccess('');
    setShowMaterialForm(true);
  }

  function openNewTransaction(material = null) {
    setTransactionForm({
      ...emptyTransaction,
      material_id: material ? String(material.id) : '',
      unit_cost: material ? String(material.unit_cost) : '',
    });
    setError('');
    setSuccess('');
    setShowTransactionForm(true);
  }

  async function saveMaterial(event) {
    event.preventDefault();
    if (!isOwner) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const quantity = Number(materialForm.current_quantity);
      const reorder = Number(materialForm.reorder_level);
      const cost = Number(materialForm.unit_cost);
      const name = materialForm.material_name.trim();
      const unit = materialForm.unit_of_measure.trim();

      if (!name || !unit) {
        throw new Error('Material name and unit of measure are required.');
      }

      if (
        !Number.isFinite(quantity) ||
        !Number.isFinite(reorder) ||
        !Number.isFinite(cost) ||
        quantity < 0 ||
        reorder < 0 ||
        cost < 0
      ) {
        throw new Error('Quantities, reorder level, and cost must be valid non-negative numbers.');
      }

      const payload = {
        material_name: name,
        category: materialForm.category,
        unit_of_measure: unit,
        reorder_level: reorder,
        unit_cost: cost,
        notes: materialForm.notes.trim() || null,
        is_active: Boolean(materialForm.is_active),
        updated_at: new Date().toISOString(),
      };

      if (editingMaterialId) {
        // Current stock must only be changed through a transaction.
        // Preserve the database quantity while editing material details.
        const existing = materials.find(
          (item) => item.id === editingMaterialId
        );

        if (!existing) throw new Error('Material could not be found.');

        payload.current_quantity = existing.current_quantity;

        const { error: updateError } = await supabase
          .from('materials')
          .update(payload)
          .eq('id', editingMaterialId);

        if (updateError) throw updateError;
        setSuccess('Material updated successfully.');
      } else {
        payload.current_quantity = quantity;

        const { error: insertError } = await supabase
          .from('materials')
          .insert(payload);

        if (insertError) throw insertError;
        setSuccess('Material added successfully.');
      }

      setShowMaterialForm(false);
      setEditingMaterialId(null);
      setMaterialForm({ ...emptyMaterial });
      await loadData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveTransaction(event) {
    event.preventDefault();
    if (!isOwner) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const quantity = Number(transactionForm.quantity);
      const unitCost =
        transactionForm.unit_cost === ''
          ? null
          : Number(transactionForm.unit_cost);

      if (!transactionForm.material_id) {
        throw new Error('Please select a material.');
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Quantity must be greater than zero.');
      }

      if (
        unitCost !== null &&
        (!Number.isFinite(unitCost) || unitCost < 0)
      ) {
        throw new Error('Unit cost must be a valid non-negative number.');
      }

      const { data: transactionId, error: transactionError } =
        await supabase.rpc('record_material_transaction', {
          p_material_id: Number(transactionForm.material_id),
          p_transaction_type: transactionForm.transaction_type,
          p_quantity: quantity,
          p_order_id: transactionForm.order_id
            ? Number(transactionForm.order_id)
            : null,
          p_unit_cost: unitCost,
          p_reference_number:
            transactionForm.reference_number.trim() || null,
          p_notes: transactionForm.notes.trim() || null,
          p_adjustment_direction:
            transactionForm.transaction_type === 'adjustment'
              ? transactionForm.adjustment_direction
              : null,
        });

      if (transactionError) throw transactionError;

      setSuccess(`Stock transaction recorded successfully (ID ${transactionId}).`);
      setShowTransactionForm(false);
      setTransactionForm({ ...emptyTransaction });
      await loadData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleMaterialActive(material) {
    if (!isOwner) return;

    const action = material.is_active ? 'deactivate' : 'reactivate';

    if (
      !window.confirm(
        `Are you sure you want to ${action} "${material.material_name}"?`
      )
    ) {
      return;
    }

    setError('');
    setSuccess('');

    const { error: updateError } = await supabase
      .from('materials')
      .update({
        is_active: !material.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', material.id);

    if (updateError) {
      setError(errorMessage(updateError));
      return;
    }

    setSuccess(`Material ${action}d successfully.`);
    await loadData();
  }

  function formatDate(value) {
    if (!value) return '—';

    return new Date(value).toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function transactionLabel(value) {
    return (
      TRANSACTION_TYPES.find((item) => item.value === value)?.label || value
    );
  }

  return (
    <section className="inventory-page">
      <div className="inventory-page-header">
        <div>
          <h1>Inventory Management</h1>
          <p>Manage supplies, stock levels, and inventory movements.</p>
        </div>

        <div className="inventory-header-actions">
          <button
            type="button"
            className="inventory-btn inventory-btn-secondary"
            onClick={loadData}
            disabled={loading}
          >
            Refresh
          </button>

          {isOwner && (
            <>
              <button
                type="button"
                className="inventory-btn inventory-btn-secondary"
                onClick={() => openNewTransaction()}
              >
                + Stock Transaction
              </button>
              <button
                type="button"
                className="inventory-btn inventory-btn-primary"
                onClick={openNewMaterial}
              >
                + Add Material
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="inventory-alert inventory-alert-error" role="alert">
          {error}
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="inventory-alert inventory-alert-success" role="status">
          {success}
          <button type="button" onClick={() => setSuccess('')} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}

      <div className="inventory-stats-grid">
        <article className="inventory-stat-card">
          <span>Active Materials</span>
          <strong>{activeMaterials.length}</strong>
          <small>Materials currently tracked</small>
        </article>

        <article className="inventory-stat-card">
          <span>Low Stock</span>
          <strong className={lowStockMaterials.length ? 'inventory-warning-text' : ''}>
            {lowStockMaterials.length}
          </strong>
          <small>At or below reorder level</small>
        </article>

        <article className="inventory-stat-card">
          <span>Estimated Stock Value</span>
          <strong>{money(totalInventoryValue)}</strong>
          <small>Based on current unit costs</small>
        </article>

        <article className="inventory-stat-card">
          <span>Recent Transactions</span>
          <strong>{transactions.length}</strong>
          <small>Latest 200 records</small>
        </article>
      </div>

      <div className="inventory-tabs">
        <button
          type="button"
          className={activeTab === 'materials' ? 'active' : ''}
          onClick={() => setActiveTab('materials')}
        >
          Materials
        </button>
        <button
          type="button"
          className={activeTab === 'transactions' ? 'active' : ''}
          onClick={() => setActiveTab('transactions')}
        >
          Transaction History
        </button>
      </div>

      {activeTab === 'materials' ? (
        <>
          <div className="inventory-toolbar">
            <input
              type="search"
              placeholder="Search materials..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>

            <select
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
            >
              <option value="all">All Stock Statuses</option>
              <option value="low">Low Stock</option>
              <option value="healthy">Stock Available</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {loading ? (
            <p className="inventory-empty">Loading inventory...</p>
          ) : filteredMaterials.length === 0 ? (
            <div className="inventory-empty">
              <h3>No materials found</h3>
              <p>Add a material or change your search filters.</p>
            </div>
          ) : (
            <div className="inventory-table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Category</th>
                    <th>Current Stock</th>
                    <th>Reorder Level</th>
                    <th>Unit Cost</th>
                    <th>Stock Value</th>
                    <th>Status</th>
                    {isOwner && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredMaterials.map((material) => {
                    const isLow =
                      material.is_active &&
                      Number(material.current_quantity) <=
                        Number(material.reorder_level);

                    return (
                      <tr key={material.id}>
                        <td>
                          <strong>{material.material_name}</strong>
                          {material.notes && (
                            <small className="inventory-subtext">
                              {material.notes}
                            </small>
                          )}
                        </td>
                        <td>{categoryLabel(material.category)}</td>
                        <td>
                          <strong>{number(material.current_quantity)}</strong>{' '}
                          {material.unit_of_measure}
                        </td>
                        <td>
                          {number(material.reorder_level)}{' '}
                          {material.unit_of_measure}
                        </td>
                        <td>{money(material.unit_cost)}</td>
                        <td>
                          {money(
                            Number(material.current_quantity) *
                              Number(material.unit_cost)
                          )}
                        </td>
                        <td>
                          <span
                            className={`inventory-status ${
                              !material.is_active
                                ? 'inventory-status-inactive'
                                : isLow
                                  ? 'inventory-status-low'
                                  : 'inventory-status-healthy'
                            }`}
                          >
                            {!material.is_active
                              ? 'Inactive'
                              : isLow
                                ? 'Low Stock'
                                : 'In Stock'}
                          </span>
                        </td>
                        {isOwner && (
                          <td>
                            <div className="inventory-row-actions">
                              <button
                                type="button"
                                onClick={() => openNewTransaction(material)}
                              >
                                Adjust
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditMaterial(material)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleMaterialActive(material)}
                              >
                                {material.is_active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="inventory-table-wrap">
          {loading ? (
            <p className="inventory-empty">Loading transactions...</p>
          ) : transactions.length === 0 ? (
            <div className="inventory-empty">
              <h3>No transactions yet</h3>
              <p>Stock movements will appear here after they are recorded.</p>
            </div>
          ) : (
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Material</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Unit Cost</th>
                  <th>Order</th>
                  <th>Reference</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.transaction_date)}</td>
                    <td>
                      {transaction.materials?.material_name || `Material #${transaction.material_id}`}
                    </td>
                    <td>
                      <span className={`inventory-status inventory-type-${transaction.transaction_type}`}>
                        {transactionLabel(transaction.transaction_type)}
                      </span>
                    </td>
                    <td>
                      {number(transaction.quantity)}{' '}
                      {transaction.materials?.unit_of_measure || ''}
                    </td>
                    <td>
                      {transaction.unit_cost == null
                        ? '—'
                        : money(transaction.unit_cost)}
                    </td>
                    <td>
                      {transaction.orders
                        ? `${transaction.orders.order_number} · ${transaction.orders.order_title}`
                        : '—'}
                    </td>
                    <td>{transaction.reference_number || '—'}</td>
                    <td>{transaction.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showMaterialForm && (
        <div className="inventory-modal-backdrop">
          <div
            className="inventory-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-material-modal-title"
          >
            <div className="inventory-modal-header">
              <div>
                <h2 id="inventory-material-modal-title">
                  {editingMaterialId ? 'Edit Material' : 'Add Material'}
                </h2>
                <p>
                  {editingMaterialId
                    ? 'Update the material details and reorder level.'
                    : 'Register a new supply in your inventory.'}
                </p>
              </div>
              <button
                type="button"
                className="inventory-modal-close"
                onClick={() => setShowMaterialForm(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={saveMaterial}>
              <div className="inventory-form-grid">
                <label className="inventory-field inventory-field-full">
                  Material Name *
                  <input
                    required
                    maxLength={150}
                    value={materialForm.material_name}
                    onChange={(event) =>
                      updateMaterialField('material_name', event.target.value)
                    }
                    placeholder="e.g. PVC ID Card"
                  />
                </label>

                <label className="inventory-field">
                  Category *
                  <select
                    required
                    value={materialForm.category}
                    onChange={(event) =>
                      updateMaterialField('category', event.target.value)
                    }
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="inventory-field">
                  Unit of Measure *
                  <input
                    required
                    maxLength={40}
                    value={materialForm.unit_of_measure}
                    onChange={(event) =>
                      updateMaterialField('unit_of_measure', event.target.value)
                    }
                    placeholder="pieces, rolls, liters..."
                  />
                </label>

                {!editingMaterialId && (
                  <label className="inventory-field">
                    Starting Quantity *
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.001"
                      value={materialForm.current_quantity}
                      onChange={(event) =>
                        updateMaterialField('current_quantity', event.target.value)
                      }
                    />
                    <small>
                      Use zero if you will record the starting stock as a transaction.
                    </small>
                  </label>
                )}

                <label className="inventory-field">
                  Reorder Level *
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.001"
                    value={materialForm.reorder_level}
                    onChange={(event) =>
                      updateMaterialField('reorder_level', event.target.value)
                    }
                  />
                </label>

                <label className="inventory-field">
                  Unit Cost (PHP) *
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={materialForm.unit_cost}
                    onChange={(event) =>
                      updateMaterialField('unit_cost', event.target.value)
                    }
                  />
                </label>

                <label className="inventory-field inventory-field-full">
                  Notes
                  <textarea
                    rows="3"
                    value={materialForm.notes}
                    onChange={(event) =>
                      updateMaterialField('notes', event.target.value)
                    }
                    placeholder="Optional details"
                  />
                </label>

                {editingMaterialId && (
                  <label className="inventory-checkbox-field inventory-field-full">
                    <input
                      type="checkbox"
                      checked={materialForm.is_active}
                      onChange={(event) =>
                        updateMaterialField('is_active', event.target.checked)
                      }
                    />
                    Material is active
                  </label>
                )}
              </div>

              <div className="inventory-form-actions">
                <button
                  type="button"
                  className="inventory-btn inventory-btn-secondary"
                  onClick={() => setShowMaterialForm(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inventory-btn inventory-btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? 'Saving...'
                    : editingMaterialId
                      ? 'Save Changes'
                      : 'Add Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTransactionForm && (
        <div className="inventory-modal-backdrop">
          <div
            className="inventory-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-transaction-modal-title"
          >
            <div className="inventory-modal-header">
              <div>
                <h2 id="inventory-transaction-modal-title">Stock Transaction</h2>
                <p>Record incoming stock, usage, returns, or corrections.</p>
              </div>
              <button
                type="button"
                className="inventory-modal-close"
                onClick={() => setShowTransactionForm(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={saveTransaction}>
              <div className="inventory-form-grid">
                <label className="inventory-field inventory-field-full">
                  Material *
                  <select
                    required
                    value={transactionForm.material_id}
                    onChange={(event) => {
                      const selected = materials.find(
                        (item) => String(item.id) === event.target.value
                      );
                      setTransactionForm((current) => ({
                        ...current,
                        material_id: event.target.value,
                        unit_cost: selected ? String(selected.unit_cost) : '',
                      }));
                    }}
                  >
                    <option value="">Select material</option>
                    {activeMaterials.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.material_name} · Available:{' '}
                        {number(material.current_quantity)} {material.unit_of_measure}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="inventory-field">
                  Transaction Type *
                  <select
                    required
                    value={transactionForm.transaction_type}
                    onChange={(event) =>
                      updateTransactionField('transaction_type', event.target.value)
                    }
                  >
                    {TRANSACTION_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="inventory-field">
                  Quantity *
                  <input
                    required
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={transactionForm.quantity}
                    onChange={(event) =>
                      updateTransactionField('quantity', event.target.value)
                    }
                    placeholder="Enter quantity"
                  />
                </label>

                {transactionForm.transaction_type === 'adjustment' && (
                  <label className="inventory-field inventory-field-full">
                    Adjustment Direction *
                    <select
                      required
                      value={transactionForm.adjustment_direction}
                      onChange={(event) =>
                        updateTransactionField(
                          'adjustment_direction',
                          event.target.value
                        )
                      }
                    >
                      <option value="increase">Increase stock</option>
                      <option value="decrease">Decrease stock</option>
                    </select>
                    <small>
                      Enter the quantity to add or remove, not the final stock count.
                    </small>
                  </label>
                )}

                <label className="inventory-field">
                  Unit Cost (PHP)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={transactionForm.unit_cost}
                    onChange={(event) =>
                      updateTransactionField('unit_cost', event.target.value)
                    }
                    placeholder="Optional"
                  />
                </label>

                <label className="inventory-field">
                  Related Order
                  <select
                    value={transactionForm.order_id}
                    onChange={(event) =>
                      updateTransactionField('order_id', event.target.value)
                    }
                  >
                    <option value="">No linked order</option>
                    {orders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.order_number} · {order.order_title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="inventory-field inventory-field-full">
                  Reference Number
                  <input
                    maxLength={100}
                    value={transactionForm.reference_number}
                    onChange={(event) =>
                      updateTransactionField('reference_number', event.target.value)
                    }
                    placeholder="e.g. purchase receipt or delivery reference"
                  />
                </label>

                <label className="inventory-field inventory-field-full">
                  Notes
                  <textarea
                    rows="3"
                    value={transactionForm.notes}
                    onChange={(event) =>
                      updateTransactionField('notes', event.target.value)
                    }
                    placeholder="Reason for the stock movement"
                  />
                </label>
              </div>

              <div className="inventory-form-actions">
                <button
                  type="button"
                  className="inventory-btn inventory-btn-secondary"
                  onClick={() => setShowTransactionForm(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inventory-btn inventory-btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Recording...' : 'Record Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
