
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const emptyForm = {
  order_id: '',
  received_by: '',
  endorsement_date: new Date().toISOString().slice(0, 16),
  quantity_produced: '0',
  quantity_endorsed: '0',
  quantity_rejected: '0',
  reference_number: '',
  notes: '',
};

function formatDate(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value) || 0);
}

export default function EndorsementsPage({ userRole }) {
  const [endorsements, setEndorsements] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
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
      const [endorsementsResult, ordersResult] = await Promise.all([
        supabase
          .from('endorsements')
          .select('*')
          .order('endorsement_date', { ascending: false }),
        supabase
          .from('orders')
          .select('id, order_number, order_title, id_quantity, status')
          .order('created_at', { ascending: false }),
      ]);

      if (endorsementsResult.error) throw endorsementsResult.error;
      if (ordersResult.error) throw ordersResult.error;

      setEndorsements(endorsementsResult.data || []);
      setOrders(ordersResult.data || []);
    } catch (err) {
      setError(err.message || 'Unable to load endorsement records.');
    } finally {
      setLoading(false);
    }
  }

  const orderMap = useMemo(
    () => new Map(orders.map((order) => [String(order.id), order])),
    [orders]
  );

  const filteredEndorsements = useMemo(() => {
    const term = search.trim().toLowerCase();

    return endorsements.filter((item) => {
      const order = orderMap.get(String(item.order_id));

      const text = [
        item.received_by,
        item.reference_number,
        item.notes,
        order?.order_number,
        order?.order_title,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return !term || text.includes(term);
    });
  }, [endorsements, orderMap, search]);

  const stats = useMemo(() => ({
    records: endorsements.length,
    produced: endorsements.reduce(
      (sum, item) => sum + Number(item.quantity_produced || 0),
      0
    ),
    endorsed: endorsements.reduce(
      (sum, item) => sum + Number(item.quantity_endorsed || 0),
      0
    ),
    rejected: endorsements.reduce(
      (sum, item) => sum + Number(item.quantity_rejected || 0),
      0
    ),
  }), [endorsements]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm({
      ...emptyForm,
      endorsement_date: new Date().toISOString().slice(0, 16),
    });
    setEditingId(null);
    setError('');
    setMessage('');
  }

  function startEditing(item) {
    setEditingId(item.id);
    setForm({
      order_id: String(item.order_id),
      received_by: item.received_by || '',
      endorsement_date: item.endorsement_date
        ? new Date(item.endorsement_date).toISOString().slice(0, 16)
        : '',
      quantity_produced: String(item.quantity_produced),
      quantity_endorsed: String(item.quantity_endorsed),
      quantity_rejected: String(item.quantity_rejected),
      reference_number: item.reference_number || '',
      notes: item.notes || '',
    });
    setError('');
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isOwner) return;

    const produced = Number(form.quantity_produced);
    const endorsed = Number(form.quantity_endorsed);
    const rejected = Number(form.quantity_rejected);

    if (!form.order_id) {
      setError('Please select an order.');
      return;
    }

    if (!form.received_by.trim()) {
      setError('Please enter the name of the person receiving the IDs.');
      return;
    }

    if (!form.endorsement_date) {
      setError('Please select an endorsement date.');
      return;
    }

    if (
      ![produced, endorsed, rejected].every(
        (quantity) => Number.isInteger(quantity) && quantity >= 0
      )
    ) {
      setError('Quantities must be whole numbers and cannot be negative.');
      return;
    }

    if (produced < 1) {
      setError('Quantity produced must be at least 1.');
      return;
    }

    if (endorsed + rejected > produced) {
      setError(
        'Quantity endorsed plus quantity rejected cannot exceed quantity produced.'
      );
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        order_id: Number(form.order_id),
        received_by: form.received_by.trim(),
        endorsement_date: new Date(form.endorsement_date).toISOString(),
        quantity_produced: produced,
        quantity_endorsed: endorsed,
        quantity_rejected: rejected,
        reference_number: form.reference_number.trim() || null,
        notes: form.notes.trim() || null,
      };

      let result;

      if (editingId) {
        result = await supabase
          .from('endorsements')
          .update(payload)
          .eq('id', editingId);
      } else {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        result = await supabase.from('endorsements').insert({
          ...payload,
          endorsed_by: user?.id || null,
        });
      }

      if (result.error) throw result.error;

      resetForm();
      setMessage(
        editingId
          ? 'Endorsement record updated successfully.'
          : 'Endorsement record created successfully.'
      );

      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to save the endorsement record.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!isOwner) return;

    if (
      !window.confirm(
        `Delete the endorsement record for ${item.received_by}? This cannot be undone.`
      )
    ) {
      return;
    }

    setError('');
    setMessage('');

    try {
      const { error: deleteError } = await supabase
        .from('endorsements')
        .delete()
        .eq('id', item.id);

      if (deleteError) throw deleteError;

      if (String(editingId) === String(item.id)) resetForm();

      setMessage('Endorsement record deleted successfully.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to delete the endorsement record.');
    }
  }

  if (loading) {
    return (
      <div className="endorsements-page">
        <p>Loading endorsement records...</p>
      </div>
    );
  }

  return (
    <div className="endorsements-page">
      <div className="endorsements-header">
        <div>
          <h1>Endorsements Management</h1>
          <p>Record ID handovers, recipients, and quantities.</p>
        </div>

        <button
          type="button"
          className="endorsements-button endorsements-button-secondary"
          onClick={loadData}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="endorsements-alert endorsements-alert-error">
          {error}
        </div>
      )}

      {message && (
        <div className="endorsements-alert endorsements-alert-success">
          {message}
        </div>
      )}

      <div className="endorsements-stats">
        <div className="endorsements-stat-card">
          <span>Total Records</span>
          <strong>{formatNumber(stats.records)}</strong>
        </div>
        <div className="endorsements-stat-card">
          <span>Total Produced</span>
          <strong>{formatNumber(stats.produced)}</strong>
        </div>
        <div className="endorsements-stat-card">
          <span>Total Endorsed</span>
          <strong>{formatNumber(stats.endorsed)}</strong>
        </div>
        <div className="endorsements-stat-card">
          <span>Total Rejected</span>
          <strong>{formatNumber(stats.rejected)}</strong>
        </div>
      </div>

      {isOwner && (
        <section className="endorsements-panel">
          <h2>
            {editingId ? 'Edit Endorsement Record' : 'Record an Endorsement'}
          </h2>

          <form className="endorsements-form" onSubmit={handleSubmit}>
            <div className="endorsements-field">
              <label htmlFor="endorsement-order">Order *</label>
              <select
                id="endorsement-order"
                value={form.order_id}
                onChange={(event) =>
                  updateForm('order_id', event.target.value)
                }
                required
              >
                <option value="">Select an order</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number} - {order.order_title}
                  </option>
                ))}
              </select>
            </div>

            <div className="endorsements-field">
              <label htmlFor="endorsement-recipient">Received By *</label>
              <input
                id="endorsement-recipient"
                value={form.received_by}
                onChange={(event) =>
                  updateForm('received_by', event.target.value)
                }
                placeholder="Name of recipient or authorized representative"
                required
              />
            </div>

            <div className="endorsements-field">
              <label htmlFor="endorsement-date">Endorsement Date *</label>
              <input
                id="endorsement-date"
                type="datetime-local"
                value={form.endorsement_date}
                onChange={(event) =>
                  updateForm('endorsement_date', event.target.value)
                }
                required
              />
            </div>

            <div className="endorsements-field">
              <label htmlFor="endorsement-reference">Reference Number</label>
              <input
                id="endorsement-reference"
                value={form.reference_number}
                onChange={(event) =>
                  updateForm('reference_number', event.target.value)
                }
                placeholder="Optional document or receipt number"
              />
            </div>

            <div className="endorsements-field">
              <label htmlFor="endorsement-produced">Quantity Produced *</label>
              <input
                id="endorsement-produced"
                type="number"
                min="1"
                step="1"
                value={form.quantity_produced}
                onChange={(event) =>
                  updateForm('quantity_produced', event.target.value)
                }
                required
              />
            </div>

            <div className="endorsements-field">
              <label htmlFor="endorsement-endorsed">Quantity Endorsed *</label>
              <input
                id="endorsement-endorsed"
                type="number"
                min="0"
                step="1"
                value={form.quantity_endorsed}
                onChange={(event) =>
                  updateForm('quantity_endorsed', event.target.value)
                }
                required
              />
            </div>

            <div className="endorsements-field">
              <label htmlFor="endorsement-rejected">Quantity Rejected *</label>
              <input
                id="endorsement-rejected"
                type="number"
                min="0"
                step="1"
                value={form.quantity_rejected}
                onChange={(event) =>
                  updateForm('quantity_rejected', event.target.value)
                }
                required
              />
            </div>

            <div className="endorsements-field endorsements-field-full">
              <label htmlFor="endorsement-notes">Notes</label>
              <textarea
                id="endorsement-notes"
                rows="3"
                value={form.notes}
                onChange={(event) => updateForm('notes', event.target.value)}
                placeholder="Add handover details, discrepancies, or other notes..."
              />
            </div>

            <div className="endorsements-form-actions">
              <button
                type="submit"
                className="endorsements-button endorsements-button-primary"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingId
                    ? 'Save Changes'
                    : 'Save Endorsement'}
              </button>

              {editingId && (
                <button
                  type="button"
                  className="endorsements-button endorsements-button-secondary"
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

      <section className="endorsements-panel">
        <div className="endorsements-list-header">
          <div>
            <h2>Endorsement Records</h2>
            <p>{filteredEndorsements.length} record(s) found</p>
          </div>

          <input
            className="endorsements-search"
            type="search"
            aria-label="Search endorsement records"
            placeholder="Search order, recipient, or reference..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {filteredEndorsements.length === 0 ? (
          <div className="endorsements-empty">
            <h3>No endorsement records found</h3>
            <p>Create a record or adjust your search.</p>
          </div>
        ) : (
          <div className="endorsements-table-wrap">
            <table className="endorsements-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Received By</th>
                  <th>Endorsement Date</th>
                  <th>Produced</th>
                  <th>Endorsed</th>
                  <th>Rejected</th>
                  <th>Reference</th>
                  {isOwner && <th>Actions</th>}
                </tr>
              </thead>

              <tbody>
                {filteredEndorsements.map((item) => {
                  const order = orderMap.get(String(item.order_id));

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>
                          {order?.order_number || `Order #${item.order_id}`}
                        </strong>
                        <span className="endorsements-cell-subtitle">
                          {order?.order_title || 'Unknown order'}
                        </span>
                      </td>
                      <td>{item.received_by}</td>
                      <td>{formatDate(item.endorsement_date)}</td>
                      <td>{formatNumber(item.quantity_produced)}</td>
                      <td>{formatNumber(item.quantity_endorsed)}</td>
                      <td>{formatNumber(item.quantity_rejected)}</td>
                      <td>{item.reference_number || '—'}</td>
                      {isOwner && (
                        <td>
                          <div className="endorsements-row-actions">
                            <button
                              type="button"
                              className="endorsements-button endorsements-button-small endorsements-button-secondary"
                              onClick={() => startEditing(item)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="endorsements-button endorsements-button-small endorsements-button-danger"
                              onClick={() => handleDelete(item)}
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
