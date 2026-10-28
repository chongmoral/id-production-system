
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const BATCH_STATUSES = [
  'pending',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
];

const emptyForm = {
  order_id: '',
  batch_number: '',
  batch_name: '',
  planned_quantity: '',
  completed_quantity: '0',
  status: 'pending',
  start_date: '',
  target_date: '',
  notes: '',
};

function formatStatus(status = '') {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) =>
    letter.toUpperCase()
  );
}

function formatDate(date) {
  if (!date) return 'Not set';

  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export default function ProductionBatchesPage({ userRole }) {
  const [batches, setBatches] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const isOwner = userRole === 'owner';

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [
        { data: batchData, error: batchError },
        { data: orderData, error: orderError },
      ] = await Promise.all([
        supabase
          .from('production_batches')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select('id, order_number, order_title, id_quantity, deadline, status')
          .order('created_at', { ascending: false }),
      ]);

      if (batchError) throw batchError;
      if (orderError) throw orderError;

      setBatches(batchData || []);
      setOrders(orderData || []);
    } catch (err) {
      setError(err.message || 'Could not load production batches.');
    } finally {
      setLoading(false);
    }
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function getOrder(orderId) {
    return orders.find((order) => String(order.id) === String(orderId));
  }

  function getOrderLabel(orderId) {
    const order = getOrder(orderId);

    if (!order) return `Order #${orderId}`;

    return `${order.order_number} - ${order.order_title}`;
  }

  function startEdit(batch) {
    setEditingId(batch.id);
    setForm({
      order_id: String(batch.order_id),
      batch_number: String(batch.batch_number),
      batch_name: batch.batch_name || '',
      planned_quantity: String(batch.planned_quantity),
      completed_quantity: String(batch.completed_quantity),
      status: batch.status,
      start_date: batch.start_date || '',
      target_date: batch.target_date || '',
      notes: batch.notes || '',
    });

    setError('');
    setMessage('');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isOwner) {
      setError('Only the owner can create or edit production batches.');
      return;
    }

    const planned = Number(form.planned_quantity);
    const completed = Number(form.completed_quantity);
    const batchNumber = Number(form.batch_number);

    if (!form.order_id) {
      setError('Please select an order.');
      return;
    }

    if (!Number.isInteger(batchNumber) || batchNumber < 1) {
      setError('Batch number must be a positive whole number.');
      return;
    }

    if (!Number.isInteger(planned) || planned < 1) {
      setError('Planned quantity must be a positive whole number.');
      return;
    }

    if (!Number.isInteger(completed) || completed < 0 || completed > planned) {
      setError('Completed quantity must be between 0 and the planned quantity.');
      return;
    }

    if (
      form.start_date &&
      form.target_date &&
      form.target_date < form.start_date
    ) {
      setError('Target date cannot be earlier than the start date.');
      return;
    }

    if (form.status === 'completed' && completed !== planned) {
      setError(
        'Set completed quantity equal to planned quantity before marking the batch completed.'
      );
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        order_id: Number(form.order_id),
        batch_number: batchNumber,
        batch_name: form.batch_name.trim() || null,
        planned_quantity: planned,
        completed_quantity: completed,
        status: form.status,
        start_date: form.start_date || null,
        target_date: form.target_date || null,
        completed_at:
          form.status === 'completed'
            ? new Date().toISOString()
            : null,
        notes: form.notes.trim() || null,
      };

      if (editingId !== null) {
        const { error: updateError } = await supabase
          .from('production_batches')
          .update(payload)
          .eq('id', editingId);

        if (updateError) throw updateError;

        setMessage('Production batch updated successfully.');
      } else {
        const { error: insertError } = await supabase
          .from('production_batches')
          .insert(payload);

        if (insertError) throw insertError;

        setMessage('Production batch created successfully.');
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError(err.message || 'Could not save the production batch.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(batch) {
    if (!isOwner) return;

    const confirmed = window.confirm(
      `Delete batch ${batch.batch_number}${batch.batch_name ? ` (${batch.batch_name})` : ''}? This cannot be undone.`
    );

    if (!confirmed) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const { error: deleteError } = await supabase
        .from('production_batches')
        .delete()
        .eq('id', batch.id);

      if (deleteError) throw deleteError;

      setMessage('Production batch deleted.');
      if (editingId === batch.id) resetForm();

      await loadData();
    } catch (err) {
      setError(err.message || 'Could not delete the batch.');
    } finally {
      setSaving(false);
    }
  }

  const filteredBatches = useMemo(() => {
    const query = search.trim().toLowerCase();

    return batches.filter((batch) => {
      const matchesSearch = [
        batch.batch_number,
        batch.batch_name,
        getOrderLabel(batch.order_id),
        batch.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));

      const matchesStatus =
        statusFilter === 'all' || batch.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [batches, orders, search, statusFilter]);

  const totals = useMemo(() => {
    return batches.reduce(
      (result, batch) => {
        result.planned += Number(batch.planned_quantity || 0);
        result.completed += Number(batch.completed_quantity || 0);

        if (batch.status === 'in_progress') result.active += 1;
        if (batch.status === 'pending') result.pending += 1;

        return result;
      },
      { planned: 0, completed: 0, active: 0, pending: 0 }
    );
  }, [batches]);

  if (loading) {
    return (
      <div className="batches-page">
        <p>Loading production batches...</p>
      </div>
    );
  }

  return (
    <div className="batches-page">
      <header className="batches-header">
        <div>
          <p className="batches-eyebrow">PRODUCTION MANAGEMENT</p>
          <h1>Production Batches</h1>
          <p className="batches-subtitle">
            Track ID production quantities, batch deadlines, and progress.
          </p>
        </div>

        <button
          type="button"
          className="batch-button secondary"
          onClick={loadData}
          disabled={saving}
        >
          Refresh
        </button>
      </header>

      {error && <div className="batch-alert error">{error}</div>}
      {message && <div className="batch-alert success">{message}</div>}

      {!isOwner && (
        <div className="batch-alert info">
          You can view production batches. Editing is restricted to the owner.
        </div>
      )}

      <section className="batch-stats">
        <article className="batch-stat">
          <span>Total Batches</span>
          <strong>{batches.length}</strong>
        </article>
        <article className="batch-stat">
          <span>In Progress</span>
          <strong>{totals.active}</strong>
        </article>
        <article className="batch-stat">
          <span>Awaiting Start</span>
          <strong>{totals.pending}</strong>
        </article>
        <article className="batch-stat">
          <span>IDs Completed</span>
          <strong>{totals.completed.toLocaleString()}</strong>
          <small>of {totals.planned.toLocaleString()} planned</small>
        </article>
      </section>

      {isOwner && (
        <section className="batch-panel">
          <div className="batch-panel-heading">
            <div>
              <h2>{editingId !== null ? 'Edit Batch' : 'Create Production Batch'}</h2>
              <p>
                Each batch belongs to an existing order. Use separate batch numbers
                for separate production runs.
              </p>
            </div>
          </div>

          <form className="batch-form" onSubmit={handleSubmit}>
            <label>
              Order *
              <select
                name="order_id"
                value={form.order_id}
                onChange={updateField}
                required
              >
                <option value="">Select an order</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number} - {order.order_title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Batch Number *
              <input
                type="number"
                name="batch_number"
                min="1"
                step="1"
                value={form.batch_number}
                onChange={updateField}
                required
              />
            </label>

            <label>
              Batch Name
              <input
                type="text"
                name="batch_name"
                value={form.batch_name}
                onChange={updateField}
                placeholder="e.g. Grade 7 IDs"
              />
            </label>

            <label>
              Planned Quantity *
              <input
                type="number"
                name="planned_quantity"
                min="1"
                step="1"
                value={form.planned_quantity}
                onChange={updateField}
                required
              />
            </label>

            <label>
              Completed Quantity *
              <input
                type="number"
                name="completed_quantity"
                min="0"
                step="1"
                max={form.planned_quantity || undefined}
                value={form.completed_quantity}
                onChange={updateField}
                required
              />
            </label>

            <label>
              Status *
              <select
                name="status"
                value={form.status}
                onChange={updateField}
                required
              >
                {BATCH_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Start Date
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={updateField}
              />
            </label>

            <label>
              Target Date
              <input
                type="date"
                name="target_date"
                min={form.start_date || undefined}
                value={form.target_date}
                onChange={updateField}
              />
            </label>

            <label className="batch-full-width">
              Notes
              <textarea
                name="notes"
                rows="3"
                value={form.notes}
                onChange={updateField}
                placeholder="Production instructions or progress notes..."
              />
            </label>

            <div className="batch-form-actions batch-full-width">
              <button
                type="submit"
                className="batch-button primary"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingId !== null
                    ? 'Save Changes'
                    : 'Create Batch'}
              </button>

              {editingId !== null && (
                <button
                  type="button"
                  className="batch-button secondary"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      <section className="batch-panel">
        <div className="batch-panel-heading">
          <div>
            <h2>Batch List</h2>
            <p>Monitor quantities and deadlines for each production batch.</p>
          </div>
        </div>

        <div className="batch-filters">
          <input
            type="search"
            placeholder="Search batch, order, or notes..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            {BATCH_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
        </div>

        {filteredBatches.length === 0 ? (
          <div className="batch-empty">
            <h3>No production batches found</h3>
            <p>Create a batch or adjust your search and status filter.</p>
          </div>
        ) : (
          <div className="batch-table-wrap">
            <table className="batch-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Order</th>
                  <th>Quantity</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Target Date</th>
                  {isOwner && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map((batch) => {
                  const planned = Number(batch.planned_quantity || 0);
                  const completed = Number(batch.completed_quantity || 0);
                  const progress = planned > 0
                    ? Math.min(100, Math.round((completed / planned) * 100))
                    : 0;
                  const overdue =
                    batch.target_date &&
                    batch.target_date < getToday() &&
                    batch.status !== 'completed' &&
                    batch.status !== 'cancelled';

                  return (
                    <tr key={batch.id}>
                      <td>
                        <strong>Batch {batch.batch_number}</strong>
                        <span className="batch-secondary-text">
                          {batch.batch_name || 'Unnamed batch'}
                        </span>
                      </td>
                      <td>{getOrderLabel(batch.order_id)}</td>
                      <td>
                        {completed.toLocaleString()} / {planned.toLocaleString()}
                      </td>
                      <td>
                        <div
                          className="batch-progress"
                          role="progressbar"
                          aria-valuenow={progress}
                          aria-valuemin="0"
                          aria-valuemax="100"
                          aria-label={`Batch ${batch.batch_number} progress`}
                        >
                          <div style={{ width: `${progress}%` }} />
                        </div>
                        <span className="batch-secondary-text">{progress}%</span>
                      </td>
                      <td>
                        <span className={`batch-status status-${batch.status}`}>
                          {formatStatus(batch.status)}
                        </span>
                      </td>
                      <td>
                        <span className={overdue ? 'batch-overdue' : ''}>
                          {formatDate(batch.target_date)}
                        </span>
                        {overdue && (
                          <span className="batch-overdue-label">Overdue</span>
                        )}
                      </td>
                      {isOwner && (
                        <td>
                          <div className="batch-row-actions">
                            <button
                              type="button"
                              className="batch-button small secondary"
                              onClick={() => startEdit(batch)}
                              disabled={saving}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="batch-button small danger"
                              onClick={() => handleDelete(batch)}
                              disabled={saving}
                            >
                              Delete
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
      </section>
    </div>
  );
}
