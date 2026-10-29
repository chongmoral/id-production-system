
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const INVOICE_STATUSES = [
  'draft',
  'issued',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'check', label: 'Check' },
  { value: 'online', label: 'Online Payment' },
  { value: 'other', label: 'Other' },
];

const emptyInvoice = {
  order_id: '',
  invoice_number: '',
  issue_date: new Date().toLocaleDateString('en-CA'),
  due_date: '',
  subtotal: '',
  tax_amount: '0',
  notes: '',
  status: 'draft',
};

const emptyPayment = {
  invoice_id: '',
  amount: '',
  payment_date: new Date().toLocaleDateString('en-CA'),
  payment_method: 'cash',
  reference_number: '',
  notes: '',
};

function todayString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function money(value) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(Number(value) || 0);
}

function displayDate(value) {
  if (!value) return '—';

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
}

function getInvoiceStatus(invoice, paidAmount) {
  if (invoice.status === 'draft' || invoice.status === 'cancelled') {
    return invoice.status;
  }

  const total = Number(invoice.total_amount) || 0;
  const paid = Number(paidAmount) || 0;

  if (total > 0 && paid >= total) return 'paid';
  if (paid > 0) return 'partially_paid';

  if (invoice.due_date && invoice.due_date < todayString()) {
    return 'overdue';
  }

  return 'issued';
}

function statusLabel(status) {
  return {
    draft: 'Draft',
    issued: 'Issued',
    partially_paid: 'Partially Paid',
    paid: 'Paid',
    overdue: 'Overdue',
    cancelled: 'Cancelled',
  }[status] || status;
}

export default function InvoicesPaymentsPage({ userRole }) {
  const canManage = userRole === 'owner' || userRole === 'accountant';

  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [activeTab, setActiveTab] = useState('invoices');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [invoiceModal, setInvoiceModal] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoice);

  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState(emptyPayment);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [invoiceResult, paymentResult, orderResult] = await Promise.all([
        supabase
          .from('invoices')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('payments')
          .select('*')
          .order('payment_date', { ascending: false }),
        supabase
          .from('orders')
          .select('id, order_number, order_title, contract_amount, status')
          .order('created_at', { ascending: false }),
      ]);

      if (invoiceResult.error) throw invoiceResult.error;
      if (paymentResult.error) throw paymentResult.error;
      if (orderResult.error) throw orderResult.error;

      setInvoices(invoiceResult.data || []);
      setPayments(paymentResult.data || []);
      setOrders(orderResult.data || []);
    } catch (err) {
      setError(err.message || 'Unable to load invoice and payment records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const paidByInvoice = useMemo(() => {
    const totals = {};

    for (const payment of payments) {
      totals[payment.invoice_id] =
        (totals[payment.invoice_id] || 0) + Number(payment.amount || 0);
    }

    return totals;
  }, [payments]);

  const orderById = useMemo(() => {
    return Object.fromEntries(orders.map((order) => [order.id, order]));
  }, [orders]);

  const invoiceById = useMemo(() => {
    return Object.fromEntries(invoices.map((invoice) => [invoice.id, invoice]));
  }, [invoices]);

  const invoiceRows = useMemo(() => {
    return invoices.map((invoice) => {
      const paid = paidByInvoice[invoice.id] || 0;
      const balance = Math.max(Number(invoice.total_amount) - paid, 0);

      return {
        ...invoice,
        paidAmount: paid,
        balance,
        displayStatus: getInvoiceStatus(invoice, paid),
        order: orderById[invoice.order_id],
      };
    });
  }, [invoices, paidByInvoice, orderById]);

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();

    return invoiceRows.filter((invoice) => {
      const matchesSearch =
        !term ||
        invoice.invoice_number?.toLowerCase().includes(term) ||
        invoice.order?.order_number?.toLowerCase().includes(term) ||
        invoice.order?.order_title?.toLowerCase().includes(term);

      const matchesStatus =
        statusFilter === 'all' ||
        invoice.displayStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [invoiceRows, search, statusFilter]);

  const paymentRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return payments.filter((payment) => {
      const invoice = invoiceById[payment.invoice_id];
      const order = invoice ? orderById[invoice.order_id] : null;

      return (
        !term ||
        invoice?.invoice_number?.toLowerCase().includes(term) ||
        order?.order_number?.toLowerCase().includes(term) ||
        payment.reference_number?.toLowerCase().includes(term) ||
        payment.payment_method?.toLowerCase().includes(term)
      );
    });
  }, [payments, invoiceById, orderById, search]);

  const metrics = useMemo(() => {
    const activeInvoices = invoiceRows.filter(
      (invoice) => !['draft', 'cancelled'].includes(invoice.displayStatus)
    );

    return {
      totalInvoiced: activeInvoices.reduce(
        (sum, invoice) => sum + Number(invoice.total_amount || 0),
        0
      ),
      totalPaid: activeInvoices.reduce(
        (sum, invoice) => sum + invoice.paidAmount,
        0
      ),
      outstanding: activeInvoices.reduce(
        (sum, invoice) => sum + invoice.balance,
        0
      ),
      overdue: activeInvoices.filter(
        (invoice) => invoice.displayStatus === 'overdue'
      ).length,
    };
  }, [invoiceRows]);

  function openNewInvoice() {
    setEditingInvoiceId(null);
    setInvoiceForm({
      ...emptyInvoice,
      invoice_number: `INV-${Date.now()}`,
      issue_date: todayString(),
    });
    setError('');
    setSuccess('');
    setInvoiceModal(true);
  }

  function openEditInvoice(invoice) {
    setEditingInvoiceId(invoice.id);
    setInvoiceForm({
      order_id: String(invoice.order_id),
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date || '',
      subtotal: String(invoice.subtotal),
      tax_amount: String(invoice.tax_amount),
      notes: invoice.notes || '',
      status: invoice.status,
    });
    setError('');
    setSuccess('');
    setInvoiceModal(true);
  }

  function updateInvoiceField(field, value) {
    setInvoiceForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function saveInvoice(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!canManage) {
      setError('You do not have permission to manage invoices.');
      return;
    }

    const subtotal = Number(invoiceForm.subtotal);
    const tax = Number(invoiceForm.tax_amount);
    const total = subtotal + tax;

    if (!invoiceForm.order_id) {
      setError('Please select an order.');
      return;
    }

    if (!invoiceForm.invoice_number.trim()) {
      setError('Invoice number is required.');
      return;
    }

    if (invoiceForm.subtotal === '' || subtotal < 0 || !Number.isFinite(subtotal)) {
      setError('Enter a valid subtotal of zero or more.');
      return;
    }

    if (invoiceForm.tax_amount === '' || tax < 0 || !Number.isFinite(tax)) {
      setError('Enter a valid tax amount of zero or more.');
      return;
    }

    if (
      invoiceForm.due_date &&
      invoiceForm.due_date < invoiceForm.issue_date
    ) {
      setError('The due date cannot be earlier than the issue date.');
      return;
    }

    const existingPaid = editingInvoiceId
      ? paidByInvoice[editingInvoiceId] || 0
      : 0;

    if (total < existingPaid) {
      setError(
        `The invoice total cannot be lower than the payments already recorded (${money(existingPaid)}).`
      );
      return;
    }

    setSaving(true);

    try {
      const { data: userResult, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;

      const payload = {
        order_id: Number(invoiceForm.order_id),
        invoice_number: invoiceForm.invoice_number.trim(),
        issue_date: invoiceForm.issue_date,
        due_date: invoiceForm.due_date || null,
        subtotal,
        tax_amount: tax,
        total_amount: total,
        status: invoiceForm.status,
        notes: invoiceForm.notes.trim() || null,
      };

      if (editingInvoiceId) {
        const { error: updateError } = await supabase
          .from('invoices')
          .update(payload)
          .eq('id', editingInvoiceId);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('invoices')
          .insert({
            ...payload,
            created_by: userResult.user?.id || null,
          });

        if (insertError) throw insertError;
      }

      setInvoiceModal(false);
      setSuccess(editingInvoiceId ? 'Invoice updated.' : 'Invoice created.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to save invoice.');
    } finally {
      setSaving(false);
    }
  }

  function openNewPayment(invoice = null) {
    if (!canManage) return;

    setPaymentForm({
      ...emptyPayment,
      invoice_id: invoice ? String(invoice.id) : '',
      payment_date: todayString(),
    });
    setError('');
    setSuccess('');
    setPaymentModal(true);
  }

  function updatePaymentField(field, value) {
    setPaymentForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  const selectedPaymentInvoice = invoiceRows.find(
    (invoice) => String(invoice.id) === paymentForm.invoice_id
  );

  async function savePayment(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!canManage) {
      setError('You do not have permission to record payments.');
      return;
    }

    const invoice = invoiceRows.find(
      (item) => String(item.id) === paymentForm.invoice_id
    );
    const amount = Number(paymentForm.amount);

    if (!invoice) {
      setError('Please select an invoice.');
      return;
    }

    if (invoice.displayStatus === 'draft' || invoice.displayStatus === 'cancelled') {
      setError('Payments cannot be recorded against draft or cancelled invoices.');
      return;
    }

    if (!paymentForm.amount || !Number.isFinite(amount) || amount <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    if (amount > invoice.balance + 0.000001) {
      setError(`Payment exceeds the remaining balance of ${money(invoice.balance)}.`);
      return;
    }

    if (!paymentForm.payment_date || !paymentForm.payment_method) {
      setError('Payment date and payment method are required.');
      return;
    }

    setSaving(true);

    try {
      const { data: userResult, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;

      const { error: insertError } = await supabase.from('payments').insert({
        invoice_id: invoice.id,
        amount,
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
        reference_number: paymentForm.reference_number.trim() || null,
        recorded_by: userResult.user?.id || null,
        notes: paymentForm.notes.trim() || null,
      });

      if (insertError) throw insertError;

      setPaymentModal(false);
      setSuccess('Payment recorded successfully.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to record payment.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelInvoice(invoice) {
    if (!canManage) return;

    if ((paidByInvoice[invoice.id] || 0) > 0) {
      setError('An invoice with recorded payments cannot be cancelled here. Review the payments first.');
      return;
    }

    if (!window.confirm(`Cancel invoice ${invoice.invoice_number}?`)) return;

    setError('');
    setSuccess('');

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ status: 'cancelled' })
      .eq('id', invoice.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess('Invoice cancelled.');
    await loadData();
  }

  async function refreshData() {
    setSuccess('');
    await loadData();
  }

  return (
    <div className="invoice-page">
      <div className="invoice-page-header">
        <div>
          <h2>Invoices & Payments</h2>
          <p>Manage client billing, payment records, and outstanding balances.</p>
        </div>

        <div className="invoice-header-actions">
          <button
            type="button"
            className="invoice-btn invoice-btn-secondary"
            onClick={refreshData}
            disabled={loading}
          >
            Refresh
          </button>
          {canManage && (
            <>
              <button
                type="button"
                className="invoice-btn invoice-btn-secondary"
                onClick={() => openNewPayment()}
              >
                Record Payment
              </button>
              <button
                type="button"
                className="invoice-btn invoice-btn-primary"
                onClick={openNewInvoice}
              >
                + New Invoice
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="invoice-alert invoice-alert-error" role="alert">
          {error}
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="invoice-alert invoice-alert-success" role="status">
          {success}
          <button type="button" onClick={() => setSuccess('')} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}

      <div className="invoice-metrics">
        <div className="invoice-metric-card">
          <span>Total Invoiced</span>
          <strong>{money(metrics.totalInvoiced)}</strong>
        </div>
        <div className="invoice-metric-card">
          <span>Total Paid</span>
          <strong>{money(metrics.totalPaid)}</strong>
        </div>
        <div className="invoice-metric-card">
          <span>Outstanding Balance</span>
          <strong>{money(metrics.outstanding)}</strong>
        </div>
        <div className="invoice-metric-card">
          <span>Overdue Invoices</span>
          <strong>{metrics.overdue}</strong>
        </div>
      </div>

      <div className="invoice-toolbar">
        <div className="invoice-tabs">
          <button
            type="button"
            className={activeTab === 'invoices' ? 'active' : ''}
            onClick={() => setActiveTab('invoices')}
          >
            Invoices ({invoices.length})
          </button>
          <button
            type="button"
            className={activeTab === 'payments' ? 'active' : ''}
            onClick={() => setActiveTab('payments')}
          >
            Payments ({payments.length})
          </button>
        </div>

        <div className="invoice-filters">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              activeTab === 'invoices'
                ? 'Search invoice or order...'
                : 'Search invoice, order, or reference...'
            }
          />

          {activeTab === 'invoices' && (
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {INVOICE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="invoice-empty">Loading financial records...</div>
      ) : activeTab === 'invoices' ? (
        <div className="invoice-table-wrap">
          <table className="invoice-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Order</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <strong>{invoice.invoice_number}</strong>
                  </td>
                  <td>
                    <strong>{invoice.order?.order_number || 'Unknown order'}</strong>
                    <small>{invoice.order?.order_title || ''}</small>
                  </td>
                  <td>{displayDate(invoice.issue_date)}</td>
                  <td>{displayDate(invoice.due_date)}</td>
                  <td>{money(invoice.total_amount)}</td>
                  <td>{money(invoice.paidAmount)}</td>
                  <td className={invoice.balance > 0 ? 'invoice-balance-due' : ''}>
                    {money(invoice.balance)}
                  </td>
                  <td>
                    <span className={`invoice-status status-${invoice.displayStatus}`}>
                      {statusLabel(invoice.displayStatus)}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <div className="invoice-row-actions">
                        <button
                          type="button"
                          className="invoice-link-btn"
                          onClick={() => openEditInvoice(invoice)}
                        >
                          Edit
                        </button>
                        {!['draft', 'cancelled', 'paid'].includes(invoice.displayStatus) &&
                          invoice.balance > 0 && (
                            <button
                              type="button"
                              className="invoice-link-btn"
                              onClick={() => openNewPayment(invoice)}
                            >
                              Pay
                            </button>
                          )}
                        {!['cancelled', 'paid'].includes(invoice.displayStatus) && (
                          <button
                            type="button"
                            className="invoice-link-btn invoice-danger-link"
                            onClick={() => cancelInvoice(invoice)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 9 : 8} className="invoice-empty-cell">
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="invoice-table-wrap">
          <table className="invoice-table">
            <thead>
              <tr>
                <th>Payment Date</th>
                <th>Invoice</th>
                <th>Order</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Amount</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.map((payment) => {
                const invoice = invoiceById[payment.invoice_id];
                const order = invoice ? orderById[invoice.order_id] : null;

                return (
                  <tr key={payment.id}>
                    <td>{displayDate(payment.payment_date)}</td>
                    <td>{invoice?.invoice_number || `Invoice #${payment.invoice_id}`}</td>
                    <td>{order?.order_number || '—'}</td>
                    <td>
                      {PAYMENT_METHODS.find(
                        (method) => method.value === payment.payment_method
                      )?.label || payment.payment_method}
                    </td>
                    <td>{payment.reference_number || '—'}</td>
                    <td>{money(payment.amount)}</td>
                    <td>{payment.notes || '—'}</td>
                  </tr>
                );
              })}
              {paymentRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="invoice-empty-cell">
                    No payments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {invoiceModal && (
        <div className="invoice-modal-backdrop">
          <div className="invoice-modal">
            <div className="invoice-modal-header">
              <div>
                <h3>{editingInvoiceId ? 'Edit Invoice' : 'Create Invoice'}</h3>
                <p>Invoice totals are calculated from subtotal and tax.</p>
              </div>
              <button
                type="button"
                className="invoice-modal-close"
                onClick={() => setInvoiceModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={saveInvoice}>
              <div className="invoice-form-grid">
                <label>
                  Order *
                  <select
                    required
                    value={invoiceForm.order_id}
                    onChange={(event) => updateInvoiceField('order_id', event.target.value)}
                  >
                    <option value="">Select order</option>
                    {orders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.order_number} - {order.order_title}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Invoice Number *
                  <input
                    required
                    value={invoiceForm.invoice_number}
                    onChange={(event) =>
                      updateInvoiceField('invoice_number', event.target.value)
                    }
                  />
                </label>

                <label>
                  Issue Date *
                  <input
                    type="date"
                    required
                    value={invoiceForm.issue_date}
                    onChange={(event) => updateInvoiceField('issue_date', event.target.value)}
                  />
                </label>

                <label>
                  Due Date
                  <input
                    type="date"
                    min={invoiceForm.issue_date}
                    value={invoiceForm.due_date}
                    onChange={(event) => updateInvoiceField('due_date', event.target.value)}
                  />
                </label>

                <label>
                  Subtotal (PHP) *
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={invoiceForm.subtotal}
                    onChange={(event) => updateInvoiceField('subtotal', event.target.value)}
                  />
                </label>

                <label>
                  Tax Amount (PHP) *
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={invoiceForm.tax_amount}
                    onChange={(event) => updateInvoiceField('tax_amount', event.target.value)}
                  />
                </label>

                <label>
                  Initial Status *
                  <select
                    required
                    value={invoiceForm.status}
                    onChange={(event) => updateInvoiceField('status', event.target.value)}
                  >
                    {INVOICE_STATUSES.filter((status) =>
                      editingInvoiceId
                        ? true
                        : ['draft', 'issued'].includes(status)
                    ).map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="invoice-total-preview">
                  <span>Calculated Total</span>
                  <strong>
                    {money(
                      (Number(invoiceForm.subtotal) || 0) +
                      (Number(invoiceForm.tax_amount) || 0)
                    )}
                  </strong>
                </div>

                <label className="invoice-form-full">
                  Notes
                  <textarea
                    rows="3"
                    value={invoiceForm.notes}
                    onChange={(event) => updateInvoiceField('notes', event.target.value)}
                    placeholder="Optional billing notes"
                  />
                </label>
              </div>

              <div className="invoice-form-actions">
                <button
                  type="button"
                  className="invoice-btn invoice-btn-secondary"
                  onClick={() => setInvoiceModal(false)}
                  disabled={saving}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="invoice-btn invoice-btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {paymentModal && (
        <div className="invoice-modal-backdrop">
          <div className="invoice-modal invoice-payment-modal">
            <div className="invoice-modal-header">
              <div>
                <h3>Record Payment</h3>
                <p>Record the amount received against an invoice.</p>
              </div>
              <button
                type="button"
                className="invoice-modal-close"
                onClick={() => setPaymentModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={savePayment}>
              <div className="invoice-form-grid">
                <label className="invoice-form-full">
                  Invoice *
                  <select
                    required
                    value={paymentForm.invoice_id}
                    onChange={(event) => updatePaymentField('invoice_id', event.target.value)}
                  >
                    <option value="">Select invoice</option>
                    {invoiceRows
                      .filter(
                        (invoice) =>
                          !['draft', 'cancelled', 'paid'].includes(invoice.displayStatus) &&
                          invoice.balance > 0
                      )
                      .map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoice_number} · Balance: {money(invoice.balance)}
                        </option>
                      ))}
                  </select>
                </label>

                {selectedPaymentInvoice && (
                  <div className="invoice-payment-balance invoice-form-full">
                    <span>Remaining Balance</span>
                    <strong>{money(selectedPaymentInvoice.balance)}</strong>
                  </div>
                )}

                <label>
                  Amount (PHP) *
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    max={selectedPaymentInvoice?.balance || undefined}
                    value={paymentForm.amount}
                    onChange={(event) => updatePaymentField('amount', event.target.value)}
                  />
                </label>

                <label>
                  Payment Date *
                  <input
                    type="date"
                    required
                    value={paymentForm.payment_date}
                    onChange={(event) =>
                      updatePaymentField('payment_date', event.target.value)
                    }
                  />
                </label>

                <label>
                  Payment Method *
                  <select
                    required
                    value={paymentForm.payment_method}
                    onChange={(event) =>
                      updatePaymentField('payment_method', event.target.value)
                    }
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Reference Number
                  <input
                    value={paymentForm.reference_number}
                    onChange={(event) =>
                      updatePaymentField('reference_number', event.target.value)
                    }
                    placeholder="Receipt or transaction ID"
                  />
                </label>

                <label className="invoice-form-full">
                  Notes
                  <textarea
                    rows="3"
                    value={paymentForm.notes}
                    onChange={(event) => updatePaymentField('notes', event.target.value)}
                    placeholder="Optional payment notes"
                  />
                </label>
              </div>

              <div className="invoice-form-actions">
                <button
                  type="button"
                  className="invoice-btn invoice-btn-secondary"
                  onClick={() => setPaymentModal(false)}
                  disabled={saving}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="invoice-btn invoice-btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

