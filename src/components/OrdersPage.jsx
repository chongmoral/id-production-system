
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'design', label: 'Design' },
  { value: 'photo_collection', label: 'Photo Collection' },
  { value: 'printing', label: 'Printing' },
  { value: 'finishing', label: 'Finishing' },
  { value: 'sorting', label: 'Sorting' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function createOrderNumber() {
  const date = getToday().replaceAll('-', '');
  const uniquePart = Date.now().toString().slice(-8);

  return `ID-${date}-${uniquePart}`;
}

function formatDate(date) {
  if (!date) return 'Not set';

  const [year, month, day] = date.slice(0, 10).split('-');

  return `${month}/${day}/${year}`;
}

function formatCurrency(amount) {
  if (amount === null || amount === undefined || amount === '') {
    return 'Not set';
  }

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(Number(amount));
}

function getDeadlineInfo(order) {
  if (order.status === 'completed') {
    return { label: 'Completed', color: '#15803d' };
  }

  if (order.status === 'cancelled') {
    return { label: 'Cancelled', color: '#6b7280' };
  }

  if (!order.deadline) {
    return { label: 'No deadline', color: '#6b7280' };
  }

  const today = getToday();
  const difference =
    (new Date(`${order.deadline}T00:00:00`).getTime() -
      new Date(`${today}T00:00:00`).getTime()) /
    (1000 * 60 * 60 * 24);

  if (difference < 0) {
    return {
      label: `${Math.abs(difference)} day(s) overdue`,
      color: '#dc2626',
    };
  }

  if (difference === 0) {
    return { label: 'Due today', color: '#c2410c' };
  }

  if (difference <= 3) {
    return {
      label: `Due in ${difference} day(s)`,
      color: '#c2410c',
    };
  }

  return { label: 'On schedule', color: '#15803d' };
}

const EMPTY_FORM = {
  school_id: '',
  order_title: '',
  id_quantity: '',
  order_date: getToday(),
  deadline: '',
  contract_amount: '',
  status: 'pending',
  notes: '',
};

export default function OrdersPage({ userRole }) {
  const [orders, setOrders] = useState([]);
  const [schools, setSchools] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deadlineFilter, setDeadlineFilter] = useState('all');

  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const isOwner = userRole === 'owner';

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [ordersResult, schoolsResult] = await Promise.all([
        supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false }),

        supabase
          .from('schools')
          .select('id, school_name')
          .order('school_name', { ascending: true }),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (schoolsResult.error) throw schoolsResult.error;

      setOrders(ordersResult.data || []);
      setSchools(schoolsResult.data || []);
    } catch (err) {
      console.error('Error loading orders:', err);
      setError(
        'Unable to load orders or schools. Check your connection and access permissions.'
      );
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingOrderId(null);
    setFormData({ ...EMPTY_FORM, order_date: getToday() });
    setFormError('');
    setSuccess('');
    setShowForm(true);
  }

  function openEditForm(order) {
    setEditingOrderId(order.id);

    setFormData({
      school_id: String(order.school_id),
      order_title: order.order_title || '',
      id_quantity: String(order.id_quantity ?? ''),
      order_date: order.order_date || getToday(),
      deadline: order.deadline || '',
      contract_amount:
        order.contract_amount === null ||
        order.contract_amount === undefined
          ? ''
          : String(order.contract_amount),
      status: order.status || 'pending',
      notes: order.notes || '',
    });

    setFormError('');
    setSuccess('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingOrderId(null);
    setFormData({ ...EMPTY_FORM, order_date: getToday() });
    setFormError('');
  }

  function updateField(field, value) {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isOwner) {
      setFormError('Only the owner can create or edit orders.');
      return;
    }

    const quantity = Number(formData.id_quantity);
    const contractAmount =
      formData.contract_amount.trim() === ''
        ? null
        : Number(formData.contract_amount);

    if (!formData.school_id) {
      setFormError('Please select a school.');
      return;
    }

    if (!formData.order_title.trim()) {
      setFormError('Order title is required.');
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setFormError('ID quantity must be a whole number greater than zero.');
      return;
    }

    if (!formData.order_date) {
      setFormError('Order date is required.');
      return;
    }

    if (formData.deadline && formData.deadline < formData.order_date) {
      setFormError('The deadline cannot be earlier than the order date.');
      return;
    }

    if (
      contractAmount !== null &&
      (!Number.isFinite(contractAmount) || contractAmount < 0)
    ) {
      setFormError('Contract amount must be a valid non-negative amount.');
      return;
    }

    if (!STATUSES.some((status) => status.value === formData.status)) {
      setFormError('Please select a valid order status.');
      return;
    }

    setSaving(true);
    setFormError('');
    setError('');
    setSuccess('');

    const orderData = {
      school_id: Number(formData.school_id),
      order_title: formData.order_title.trim(),
      id_quantity: quantity,
      order_date: formData.order_date,
      deadline: formData.deadline || null,
      contract_amount: contractAmount,
      status: formData.status,
      notes: formData.notes.trim() || null,
    };

    try {
      if (editingOrderId !== null) {
        const { error } = await supabase
          .from('orders')
          .update(orderData)
          .eq('id', editingOrderId);

        if (error) throw error;

        setSuccess('Order updated successfully.');
      } else {
        const { error } = await supabase
          .from('orders')
          .insert([
            {
              ...orderData,
              order_number: createOrderNumber(),
            },
          ]);

        if (error) throw error;

        setSuccess('Production order created successfully.');
      }

      closeForm();
      await loadData();
    } catch (err) {
      console.error('Error saving order:', err);

      if (err.code === '23505') {
        setFormError(
          'The generated order number already exists. Please try saving again.'
        );
      } else if (err.code === '23503') {
        setFormError(
          'The selected school or another linked record could not be found.'
        );
      } else {
        setFormError(
          'Unable to save the order. Check the required fields and Supabase permissions.'
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelOrder(order) {
    if (!isOwner) {
      setError('Only the owner can cancel orders.');
      return;
    }

    if (order.status === 'completed' || order.status === 'cancelled') {
      setError('This order cannot be cancelled in its current status.');
      return;
    }

    const confirmed = window.confirm(
      `Cancel order ${order.order_number}?\n\nThe order record will be kept, but its status will change to Cancelled.`
    );

    if (!confirmed) return;

    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', order.id);

      if (error) throw error;

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? { ...item, status: 'cancelled' }
            : item
        )
      );

      setSuccess(`Order ${order.order_number} was cancelled.`);
    } catch (err) {
      console.error('Error cancelling order:', err);
      setError('Unable to cancel the order. Check your permissions.');
    }
  }

  const filteredOrders = orders.filter((order) => {
    const schoolName =
      schools.find(
        (school) => Number(school.id) === Number(order.school_id)
      )?.school_name || '';

    const search = searchTerm.trim().toLowerCase();

    const matchesSearch =
      order.order_number?.toLowerCase().includes(search) ||
      order.order_title?.toLowerCase().includes(search) ||
      schoolName.toLowerCase().includes(search);

    const matchesStatus =
      statusFilter === 'all' || order.status === statusFilter;

    const deadlineInfo = getDeadlineInfo(order);

    const matchesDeadline =
      deadlineFilter === 'all' ||
      (deadlineFilter === 'overdue' &&
        deadlineInfo.label.includes('overdue')) ||
      (deadlineFilter === 'upcoming' &&
        ['Due today', 'On schedule'].includes(deadlineInfo.label) &&
        order.status !== 'completed' &&
        order.status !== 'cancelled' &&
        order.deadline &&
        order.deadline >= getToday() &&
        (new Date(`${order.deadline}T00:00:00`).getTime() -
          new Date(`${getToday()}T00:00:00`).getTime()) /
          86400000 <=
          7) ||
      (deadlineFilter === 'no_deadline' && !order.deadline);

    return matchesSearch && matchesStatus && matchesDeadline;
  });

  const activeOrders = orders.filter(
    (order) =>
      order.status !== 'completed' && order.status !== 'cancelled'
  );

  const overdueCount = activeOrders.filter(
    (order) =>
      order.deadline && order.deadline < getToday()
  ).length;

  const upcomingCount = activeOrders.filter((order) => {
    if (!order.deadline || order.deadline < getToday()) return false;

    const days =
      (new Date(`${order.deadline}T00:00:00`).getTime() -
        new Date(`${getToday()}T00:00:00`).getTime()) /
      86400000;

    return days <= 7;
  }).length;

  useEffect(() => {
    loadData();
  }, []);

  return (
    <section>
      <h2 className="dashboard-title">Orders &amp; Deadlines</h2>

      <p className="dashboard-subtitle">
        Manage ID production orders, contract details, quantities, and deadlines.
      </p>

      {success && (
        <div className="dashboard-panel" role="status">
          <p>{success}</p>
          <button
            type="button"
            className="logout-button"
            onClick={() => setSuccess('')}
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="dashboard-panel" role="alert">
          <p className="login-error">{error}</p>
          <button
            type="button"
            className="logout-button"
            onClick={() => setError('')}
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div className="dashboard-panel">
          <p className="dashboard-subtitle">Total Orders</p>
          <h3>{orders.length}</h3>
        </div>

        <div className="dashboard-panel">
          <p className="dashboard-subtitle">Active Orders</p>
          <h3>{activeOrders.length}</h3>
        </div>

        <div className="dashboard-panel">
          <p className="dashboard-subtitle">Due Within 7 Days</p>
          <h3>{upcomingCount}</h3>
        </div>

        <div className="dashboard-panel">
          <p className="dashboard-subtitle">Overdue Orders</p>
          <h3 style={{ color: overdueCount ? '#dc2626' : 'inherit' }}>
            {overdueCount}
          </h3>
        </div>
      </div>

      <div className="dashboard-panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h3>Production Orders</h3>
            <p className="dashboard-subtitle">
              Showing {filteredOrders.length} of {orders.length} orders
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            {isOwner && (
              <button
                type="button"
                className="logout-button"
                onClick={openCreateForm}
                disabled={loading || schools.length === 0}
              >
                + New Order
              </button>
            )}

            <button
              type="button"
              className="logout-button"
              onClick={loadData}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {isOwner && schools.length === 0 && !loading && (
          <p className="dashboard-subtitle">
            Register a school in Schools &amp; Clients before creating an order.
          </p>
        )}

        {showForm && isOwner && (
          <form
            onSubmit={handleSubmit}
            className="dashboard-panel"
            style={{ marginTop: '20px' }}
          >
            <h3>
              {editingOrderId !== null
                ? 'Edit Production Order'
                : 'Create Production Order'}
            </h3>

            {formError && (
              <p className="login-error" role="alert">
                {formError}
              </p>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
              }}
            >
              <label>
                School *
                <select
                  required
                  value={formData.school_id}
                  onChange={(event) =>
                    updateField('school_id', event.target.value)
                  }
                >
                  <option value="">Select a school</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.school_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Order Title *
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={formData.order_title}
                  onChange={(event) =>
                    updateField('order_title', event.target.value)
                  }
                  placeholder="e.g. 2026 Student ID Production"
                />
              </label>

              <label>
                Number of IDs *
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={formData.id_quantity}
                  onChange={(event) =>
                    updateField('id_quantity', event.target.value)
                  }
                  placeholder="e.g. 1500"
                />
              </label>

              <label>
                Order Date *
                <input
                  type="date"
                  required
                  value={formData.order_date}
                  onChange={(event) =>
                    updateField('order_date', event.target.value)
                  }
                />
              </label>

              <label>
                Deadline
                <input
                  type="date"
                  min={formData.order_date || undefined}
                  value={formData.deadline}
                  onChange={(event) =>
                    updateField('deadline', event.target.value)
                  }
                />
              </label>

              <label>
                Contract Amount (PHP)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.contract_amount}
                  onChange={(event) =>
                    updateField('contract_amount', event.target.value)
                  }
                  placeholder="e.g. 75000"
                />
              </label>

              <label>
                Order Status *
                <select
                  required
                  value={formData.status}
                  onChange={(event) =>
                    updateField('status', event.target.value)
                  }
                >
                  {STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ gridColumn: '1 / -1' }}>
                Notes
                <textarea
                  rows={4}
                  value={formData.notes}
                  onChange={(event) =>
                    updateField('notes', event.target.value)
                  }
                  placeholder="Materials, special instructions, or other order details"
                />
              </label>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginTop: '20px',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="submit"
                className="logout-button"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingOrderId !== null
                    ? 'Save Changes'
                    : 'Create Order'}
              </button>

              <button
                type="button"
                className="logout-button"
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginTop: '20px',
            marginBottom: '20px',
          }}
        >
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search order, title, or school..."
            aria-label="Search orders"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>

          <select
            value={deadlineFilter}
            onChange={(event) => setDeadlineFilter(event.target.value)}
            aria-label="Filter by deadline"
          >
            <option value="all">All deadlines</option>
            <option value="upcoming">Due within 7 days</option>
            <option value="overdue">Overdue</option>
            <option value="no_deadline">No deadline</option>
          </select>
        </div>

        {loading ? (
          <p>Loading orders...</p>
        ) : filteredOrders.length === 0 ? (
          <p className="dashboard-subtitle">
            {orders.length === 0
              ? 'No production orders yet. Create your first order to get started.'
              : 'No orders match your current search or filters.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    'Order Number',
                    'School',
                    'Order Title',
                    'Quantity',
                    'Order Date',
                    'Deadline',
                    'Contract Amount',
                    'Status',
                    'Deadline Alert',
                    ...(isOwner ? ['Actions'] : []),
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        padding: '12px',
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map((order) => {
                  const schoolName =
                    schools.find(
                      (school) =>
                        Number(school.id) === Number(order.school_id)
                    )?.school_name || 'Unknown school';

                  const statusLabel =
                    STATUSES.find(
                      (status) => status.value === order.status
                    )?.label || order.status;

                  const deadlineInfo = getDeadlineInfo(order);

                  return (
                    <tr key={order.id}>
                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                        {order.order_number}
                      </td>

                      <td style={{ padding: '12px' }}>{schoolName}</td>

                      <td style={{ padding: '12px' }}>
                        <div>{order.order_title}</div>
                        {order.notes && (
                          <details style={{ marginTop: '6px' }}>
                            <summary style={{ cursor: 'pointer' }}>
                              View notes
                            </summary>
                            <p>{order.notes}</p>
                          </details>
                        )}
                      </td>

                      <td style={{ padding: '12px' }}>
                        {Number(order.id_quantity).toLocaleString()}
                      </td>

                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                        {formatDate(order.order_date)}
                      </td>

                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                        {formatDate(order.deadline)}
                      </td>

                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                        {formatCurrency(order.contract_amount)}
                      </td>

                      <td style={{ padding: '12px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '5px 9px',
                            borderRadius: '6px',
                            background: '#f3f4f6',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {statusLabel}
                        </span>
                      </td>

                      <td style={{ padding: '12px' }}>
                        <span
                          style={{
                            color: deadlineInfo.color,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {deadlineInfo.label}
                        </span>
                      </td>

                      {isOwner && (
                        <td style={{ padding: '12px' }}>
                          <div
                            style={{
                              display: 'flex',
                              gap: '8px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <button
                              type="button"
                              className="logout-button"
                              onClick={() => openEditForm(order)}
                            >
                              Edit
                            </button>

                            {order.status !== 'completed' &&
                              order.status !== 'cancelled' && (
                                <button
                                  type="button"
                                  className="logout-button"
                                  onClick={() => handleCancelOrder(order)}
                                >
                                  Cancel Order
                                </button>
                              )}
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
      </div>
    </section>
  );
}
