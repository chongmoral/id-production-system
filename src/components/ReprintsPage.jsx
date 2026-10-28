
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const STATUSES = [
  'requested',
  'approved',
  'in_production',
  'completed',
  'rejected',
];

const REASONS = [
  { value: 'incorrect_name', label: 'Incorrect Student Name' },
  { value: 'photo_mismatch', label: 'Incorrect or Mismatched Photo' },
  { value: 'damaged_card', label: 'Damaged ID Card' },
  { value: 'printing_defect', label: 'Printing Error' },
  { value: 'lost_id', label: 'Lost ID' },
  { value: 'other', label: 'Other' },
];

const emptyForm = {
  order_id: '',
  student_id: '',
  reason: REASONS[0].value,
  quantity: '1',
  status: 'requested',
  additional_cost: '0',
  notes: '',
};

function formatCurrency(value) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return 'Not set';

  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getStudentName(student) {
  if (!student) return 'General / no specific student';

  return [
    student.first_name,
    student.middle_name,
    student.last_name,
    student.suffix,
  ]
    .filter(Boolean)
    .join(' ');
}

function statusLabel(status) {
  return (status || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ReprintsPage({ userRole }) {
  const [reprints, setReprints] = useState([]);
  const [orders, setOrders] = useState([]);
  const [students, setStudents] = useState([]);
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
      const [reprintsResult, ordersResult, studentsResult] =
        await Promise.all([
          supabase
            .from('reprints')
            .select('*')
            .order('requested_at', { ascending: false }),
          supabase
            .from('orders')
            .select('id, order_number, order_title, status')
            .order('created_at', { ascending: false }),
          supabase
            .from('students')
            .select(
              'id, order_id, student_number, first_name, middle_name, last_name, suffix'
            )
            .order('last_name', { ascending: true }),
        ]);

      if (reprintsResult.error) throw reprintsResult.error;
      if (ordersResult.error) throw ordersResult.error;
      if (studentsResult.error) throw studentsResult.error;

      setReprints(reprintsResult.data || []);
      setOrders(ordersResult.data || []);
      setStudents(studentsResult.data || []);
    } catch (err) {
      setError(err.message || 'Unable to load reprint records.');
    } finally {
      setLoading(false);
    }
  }

  const orderMap = useMemo(
    () => new Map(orders.map((order) => [String(order.id), order])),
    [orders]
  );

  const studentMap = useMemo(
    () => new Map(students.map((student) => [String(student.id), student])),
    [students]
  );

  const availableStudents = useMemo(
    () =>
      form.order_id
        ? students.filter(
            (student) => String(student.order_id) === String(form.order_id)
          )
        : [],
    [students, form.order_id]
  );

  const filteredReprints = useMemo(() => {
    const term = search.trim().toLowerCase();

    return reprints.filter((item) => {
      const order = orderMap.get(String(item.order_id));
      const student = studentMap.get(String(item.student_id));

      const matchesStatus =
        statusFilter === 'all' || item.status === statusFilter;

      const searchableText = [
        item.reason,
        item.notes,
        order?.order_number,
        order?.order_title,
        student?.student_number,
        getStudentName(student),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return matchesStatus && (!term || searchableText.includes(term));
    });
  }, [reprints, orderMap, studentMap, search, statusFilter]);

  const stats = useMemo(() => {
    const pending = reprints.filter(
  (item) => item.status === 'requested'
).length;

const inProgress = reprints.filter(
  (item) =>
    item.status === 'approved' ||
    item.status === 'in_production'
).length;

    const completedQuantity = reprints
      .filter((item) => item.status === 'completed')
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    const totalCost = reprints
      .filter((item) => item.status !== 'cancelled')
      .reduce((sum, item) => sum + Number(item.additional_cost || 0), 0);

    return { pending, inProgress, completedQuantity, totalCost };
  }, [reprints]);

  function updateForm(field, value) {
    setForm((current) => {
      const updated = { ...current, [field]: value };

      if (field === 'order_id') {
        updated.student_id = '';
      }

      return updated;
    });
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
    setMessage('');
  }

  function startEditing(item) {
    setEditingId(item.id);
    setForm({
      order_id: String(item.order_id),
      student_id: item.student_id ? String(item.student_id) : '',
      reason: item.reason,
      quantity: String(item.quantity),
      status: item.status,
      additional_cost: String(item.additional_cost ?? 0),
      notes: item.notes || '',
    });
    setError('');
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isOwner) return;

    const quantity = Number(form.quantity);
    const cost = Number(form.additional_cost);

    if (!form.order_id) {
      setError('Please select an order.');
      return;
    }

    if (!form.reason.trim()) {
      setError('Please provide a reason for the reprint.');
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      setError('Quantity must be a whole number greater than zero.');
      return;
    }

    if (!Number.isFinite(cost) || cost < 0) {
      setError('Additional cost must be zero or greater.');
      return;
    }

    if (
      form.student_id &&
      !availableStudents.some(
        (student) => String(student.id) === form.student_id
      )
    ) {
      setError('Please select a student belonging to the chosen order.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        order_id: Number(form.order_id),
        student_id: form.student_id ? Number(form.student_id) : null,
        reason: form.reason.trim(),
        quantity,
        status: form.status,
        additional_cost: cost,
        notes: form.notes.trim() || null,
        completed_at:
          form.status === 'completed'
            ? new Date().toISOString()
            : null,
      };

      let result;

      if (editingId) {
        result = await supabase
          .from('reprints')
          .update(payload)
          .eq('id', editingId);
      } else {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        result = await supabase.from('reprints').insert({
          ...payload,
          requested_by: user?.id || null,
          requested_at: new Date().toISOString(),
        });
      }

      if (result.error) throw result.error;

      resetForm();
      setMessage(
        editingId
          ? 'Reprint record updated successfully.'
          : 'Reprint request created successfully.'
      );

      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to save the reprint record.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!isOwner) return;

    const confirmed = window.confirm(
      `Delete this reprint request for ${item.quantity} ID(s)? This cannot be undone.`
    );

    if (!confirmed) return;

    setError('');
    setMessage('');

    try {
      const { error: deleteError } = await supabase
        .from('reprints')
        .delete()
        .eq('id', item.id);

      if (deleteError) throw deleteError;

      if (String(editingId) === String(item.id)) resetForm();

      setMessage('Reprint record deleted successfully.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to delete the reprint record.');
    }
  }

  if (loading) {
    return <div className="reprints-page"><p>Loading reprint records...</p></div>;
  }

  return (
    <div className="reprints-page">
      <div className="reprints-header">
        <div>
          <h1>Reprints Management</h1>
          <p>Track defective IDs, replacement requests, and additional costs.</p>
        </div>

        <button
          type="button"
          className="reprints-button reprints-button-secondary"
          onClick={loadData}
        >
          Refresh
        </button>
      </div>

      {error && <div className="reprints-alert reprints-alert-error">{error}</div>}
      {message && (
        <div className="reprints-alert reprints-alert-success">{message}</div>
      )}

      <div className="reprints-stats">
        <div className="reprints-stat-card">
          <span>Pending Requests</span>
          <strong>{stats.pending}</strong>
        </div>
        <div className="reprints-stat-card">
          <span>In Progress</span>
          <strong>{stats.inProgress}</strong>
        </div>
        <div className="reprints-stat-card">
          <span>Completed IDs</span>
          <strong>{stats.completedQuantity}</strong>
        </div>
        <div className="reprints-stat-card">
          <span>Recorded Additional Costs</span>
          <strong>{formatCurrency(stats.totalCost)}</strong>
        </div>
      </div>

      {isOwner && (
        <section className="reprints-panel">
          <h2>{editingId ? 'Edit Reprint Request' : 'Create Reprint Request'}</h2>

          <form className="reprints-form" onSubmit={handleSubmit}>
            <div className="reprints-field">
              <label htmlFor="reprint-order">Order *</label>
              <select
                id="reprint-order"
                value={form.order_id}
                onChange={(event) => updateForm('order_id', event.target.value)}
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

            <div className="reprints-field">
              <label htmlFor="reprint-student">Student (optional)</label>
              <select
                id="reprint-student"
                value={form.student_id}
                onChange={(event) => updateForm('student_id', event.target.value)}
                disabled={!form.order_id}
              >
                <option value="">General / no specific student</option>
                {availableStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.student_number
                      ? `${student.student_number} - `
                      : ''}
                    {getStudentName(student)}
                  </option>
                ))}
              </select>
            </div>

            <div className="reprints-field">
              <label htmlFor="reprint-reason">Reason *</label>
              <select
                id="reprint-reason"
                value={form.reason}
                onChange={(event) => updateForm('reason', event.target.value)}
                required
              >
                {REASONS.map((reason) => (
  <option key={reason.value} value={reason.value}>
    {reason.label}
  </option>
))}
              </select>
            </div>

            <div className="reprints-field">
              <label htmlFor="reprint-quantity">Quantity *</label>
              <input
                id="reprint-quantity"
                type="number"
                min="1"
                step="1"
                value={form.quantity}
                onChange={(event) => updateForm('quantity', event.target.value)}
                required
              />
            </div>

            <div className="reprints-field">
              <label htmlFor="reprint-cost">Additional Cost (₱) *</label>
              <input
                id="reprint-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.additional_cost}
                onChange={(event) =>
                  updateForm('additional_cost', event.target.value)
                }
                required
              />
            </div>

            <div className="reprints-field">
              <label htmlFor="reprint-status">Status *</label>
              <select
                id="reprint-status"
                value={form.status}
                onChange={(event) => updateForm('status', event.target.value)}
                required
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </div>

            <div className="reprints-field reprints-field-full">
              <label htmlFor="reprint-notes">Notes</label>
              <textarea
                id="reprint-notes"
                rows="3"
                value={form.notes}
                onChange={(event) => updateForm('notes', event.target.value)}
                placeholder="Add details about the defect or replacement..."
              />
            </div>

            <div className="reprints-form-actions">
              <button
                type="submit"
                className="reprints-button reprints-button-primary"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingId
                    ? 'Save Changes'
                    : 'Create Request'}
              </button>

              {editingId && (
                <button
                  type="button"
                  className="reprints-button reprints-button-secondary"
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

      <section className="reprints-panel">
        <div className="reprints-list-header">
          <div>
            <h2>Reprint Requests</h2>
            <p>{filteredReprints.length} record(s) found</p>
          </div>

          <div className="reprints-filters">
            <input
              type="search"
              aria-label="Search reprint requests"
              placeholder="Search order, student, or reason..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredReprints.length === 0 ? (
          <div className="reprints-empty">
            <h3>No reprint requests found</h3>
            <p>Create a request or adjust your search and filters.</p>
          </div>
        ) : (
          <div className="reprints-table-wrap">
            <table className="reprints-table">
              <thead>
                <tr>
                  <th>Order / Student</th>
                  <th>Reason</th>
                  <th>Qty.</th>
                  <th>Additional Cost</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Completed</th>
                  {isOwner && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredReprints.map((item) => {
                  const order = orderMap.get(String(item.order_id));
                  const student = studentMap.get(String(item.student_id));

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{order?.order_number || `Order #${item.order_id}`}</strong>
                        <span className="reprints-cell-subtitle">
                          {order?.order_title || 'Unknown order'}
                        </span>
                        <span className="reprints-cell-subtitle">
                          {getStudentName(student)}
                        </span>
                      </td>
                      <td>
                        {item.reason}
                        {item.notes && (
                          <span className="reprints-cell-subtitle">
                            {item.notes}
                          </span>
                        )}
                      </td>
                      <td>{item.quantity}</td>
                      <td>{formatCurrency(item.additional_cost)}</td>
                      <td>
                        <span className={`reprints-status reprints-status-${item.status}`}>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td>{formatDate(item.requested_at)}</td>
                      <td>{formatDate(item.completed_at)}</td>
                      {isOwner && (
                        <td>
                          <div className="reprints-row-actions">
                            <button
                              type="button"
                              className="reprints-button reprints-button-small reprints-button-secondary"
                              onClick={() => startEditing(item)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="reprints-button reprints-button-small reprints-button-danger"
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
