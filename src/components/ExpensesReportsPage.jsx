
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const CATEGORIES = [
  'materials',
  'labor',
  'transportation',
  'equipment',
  'utilities',
  'administrative',
  'other',
];

const EMPTY_FORM = {
  order_id: '',
  expense_category: 'materials',
  description: '',
  amount: '',
  expense_date: new Date().toLocaleDateString('en-CA'),
  receipt_reference: '',
  notes: '',
};

const peso = (value) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const todayString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function ExpensesReportsPage({ userRole }) {
  const canManage = userRole === 'owner' || userRole === 'accountant';

  const [expenses, setExpenses] = useState([]);
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [
        expensesResult,
        ordersResult,
        invoicesResult,
        paymentsResult,
      ] = await Promise.all([
        supabase
          .from('expenses')
          .select('*')
          .order('expense_date', { ascending: false }),
        supabase
          .from('orders')
          .select('id, order_number, order_title')
          .order('created_at', { ascending: false }),
        supabase
          .from('invoices')
          .select('id, invoice_number, total_amount, status'),
        supabase
          .from('payments')
          .select('id, invoice_id, amount, payment_date'),
      ]);

      const results = [
        expensesResult,
        ordersResult,
        invoicesResult,
        paymentsResult,
      ];

      const failed = results.find((result) => result.error);
      if (failed) throw failed.error;

      setExpenses(expensesResult.data || []);
      setOrders(ordersResult.data || []);
      setInvoices(invoicesResult.data || []);
      setPayments(paymentsResult.data || []);
    } catch (err) {
      setError(err.message || 'Unable to load financial records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredExpenses = useMemo(() => {
    const term = search.trim().toLowerCase();

    return expenses.filter((expense) => {
      const matchesSearch =
        !term ||
        expense.description?.toLowerCase().includes(term) ||
        expense.receipt_reference?.toLowerCase().includes(term) ||
        expense.notes?.toLowerCase().includes(term);

      const matchesCategory =
        categoryFilter === 'all' ||
        expense.expense_category === categoryFilter;

      const matchesStart =
        !startDate || expense.expense_date >= startDate;

      const matchesEnd =
        !endDate || expense.expense_date <= endDate;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStart &&
        matchesEnd
      );
    });
  }, [expenses, search, categoryFilter, startDate, endDate]);

  const report = useMemo(() => {
    const inRange = (date) =>
      (!startDate || date >= startDate) &&
      (!endDate || date <= endDate);

    const periodExpenses = expenses.filter((item) =>
      inRange(item.expense_date)
    );

    const periodPayments = payments.filter((item) =>
      inRange(item.payment_date)
    );

    const expenseTotal = periodExpenses.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const paymentsCollected = periodPayments.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const paidByInvoice = {};
    payments.forEach((payment) => {
      paidByInvoice[payment.invoice_id] =
        (paidByInvoice[payment.invoice_id] || 0) +
        Number(payment.amount || 0);
    });

    const outstandingBalance = invoices.reduce((sum, invoice) => {
      if (['draft', 'cancelled'].includes(invoice.status)) return sum;

      const balance = Math.max(
        0,
        Number(invoice.total_amount || 0) -
          (paidByInvoice[invoice.id] || 0)
      );

      return sum + balance;
    }, 0);

    const categoryTotals = {};
    periodExpenses.forEach((item) => {
      categoryTotals[item.expense_category] =
        (categoryTotals[item.expense_category] || 0) +
        Number(item.amount || 0);
    });

    return {
      expenseTotal,
      paymentsCollected,
      cashFlow: paymentsCollected - expenseTotal,
      outstandingBalance,
      expenseCount: periodExpenses.length,
      paymentCount: periodPayments.length,
      categoryTotals,
    };
  }, [expenses, payments, invoices, startDate, endDate]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, expense_date: todayString() });
    setEditingId(null);
    setShowForm(false);
  };

  const startEditing = (expense) => {
    setForm({
      order_id: expense.order_id ? String(expense.order_id) : '',
      expense_category: expense.expense_category,
      description: expense.description || '',
      amount: String(expense.amount ?? ''),
      expense_date: expense.expense_date || todayString(),
      receipt_reference: expense.receipt_reference || '',
      notes: expense.notes || '',
    });
    setEditingId(expense.id);
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const saveExpense = async (event) => {
    event.preventDefault();
    if (!canManage) return;

    setSaving(true);
    setError('');
    setSuccess('');

    const amount = Number(form.amount);

    if (!form.description.trim()) {
      setError('Please enter an expense description.');
      setSaving(false);
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be greater than zero.');
      setSaving(false);
      return;
    }

    if (!form.expense_date) {
      setError('Please select an expense date.');
      setSaving(false);
      return;
    }

    const payload = {
      order_id: form.order_id ? Number(form.order_id) : null,
      expense_category: form.expense_category,
      description: form.description.trim(),
      amount,
      expense_date: form.expense_date,
      receipt_reference: form.receipt_reference.trim() || null,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId) {
        const { error: updateError } = await supabase
          .from('expenses')
          .update(payload)
          .eq('id', editingId);

        if (updateError) throw updateError;
        setSuccess('Expense updated successfully.');
      } else {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        const { error: insertError } = await supabase
          .from('expenses')
          .insert({
            ...payload,
            recorded_by: user?.id || null,
          });

        if (insertError) throw insertError;
        setSuccess('Expense recorded successfully.');
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to save the expense.');
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = async (expense) => {
    if (!canManage) return;

    const confirmed = window.confirm(
      `Delete "${expense.description}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    setError('');
    setSuccess('');

    try {
      const { error: deleteError } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expense.id);

      if (deleteError) throw deleteError;

      setSuccess('Expense deleted successfully.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to delete the expense.');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setStartDate('');
    setEndDate('');
  };

  if (loading) {
    return (
      <div className="financial-page">
        <div className="financial-loading">Loading financial records...</div>
      </div>
    );
  }

  return (
    <div className="financial-page">
      <div className="financial-header">
        <div>
          <p className="financial-eyebrow">RESOURCES & FINANCE</p>
          <h2>Expenses & Reports</h2>
          <p className="financial-subtitle">
            Track business expenses and review your cash flow.
          </p>
        </div>

        {canManage && (
          <button
            className="financial-primary-button"
            onClick={() => {
              setError('');
              setSuccess('');
              if (showForm && !editingId) {
                resetForm();
              } else {
                setForm({
                  ...EMPTY_FORM,
                  expense_date: todayString(),
                });
                setEditingId(null);
                setShowForm(true);
              }
            }}
          >
            + Record Expense
          </button>
        )}
      </div>

      {error && (
        <div className="financial-alert financial-alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="financial-alert financial-alert-success">
          {success}
        </div>
      )}

      {showForm && canManage && (
        <section className="financial-panel">
          <div className="financial-panel-heading">
            <h3>{editingId ? 'Edit Expense' : 'Record New Expense'}</h3>
            <button
              type="button"
              className="financial-text-button"
              onClick={resetForm}
            >
              Close
            </button>
          </div>

          <form className="financial-form" onSubmit={saveExpense}>
            <label>
              Description *
              <input
                name="description"
                value={form.description}
                onChange={updateField}
                placeholder="e.g. PVC cards for School ABC"
                required
              />
            </label>

            <label>
              Category *
              <select
                name="expense_category"
                value={form.expense_category}
                onChange={updateField}
                required
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category.replaceAll('_', ' ').replace(
                      /^\w/,
                      (letter) => letter.toUpperCase()
                    )}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Amount (PHP) *
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={updateField}
                placeholder="0.00"
                required
              />
            </label>

            <label>
              Expense Date *
              <input
                name="expense_date"
                type="date"
                value={form.expense_date}
                onChange={updateField}
                required
              />
            </label>

            <label>
              Related Order
              <select
                name="order_id"
                value={form.order_id}
                onChange={updateField}
              >
                <option value="">General business expense</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number} - {order.order_title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Receipt / Reference
              <input
                name="receipt_reference"
                value={form.receipt_reference}
                onChange={updateField}
                placeholder="Receipt number or reference"
              />
            </label>

            <label className="financial-full-width">
              Notes
              <textarea
                name="notes"
                value={form.notes}
                onChange={updateField}
                rows="3"
                placeholder="Additional details (optional)"
              />
            </label>

            <div className="financial-form-actions financial-full-width">
              <button
                type="button"
                className="financial-secondary-button"
                onClick={resetForm}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="financial-primary-button"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingId
                    ? 'Save Changes'
                    : 'Save Expense'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="financial-metrics">
        <div className="financial-metric-card">
          <span>Expenses in Period</span>
          <strong>{peso(report.expenseTotal)}</strong>
          <small>{report.expenseCount} expense records</small>
        </div>

        <div className="financial-metric-card">
          <span>Payments Collected</span>
          <strong>{peso(report.paymentsCollected)}</strong>
          <small>{report.paymentCount} payment records</small>
        </div>

        <div className="financial-metric-card">
          <span>Net Cash Flow</span>
          <strong className={report.cashFlow < 0 ? 'financial-negative' : ''}>
            {peso(report.cashFlow)}
          </strong>
          <small>Payments collected minus expenses</small>
        </div>

        <div className="financial-metric-card">
          <span>Outstanding Invoices</span>
          <strong>{peso(report.outstandingBalance)}</strong>
          <small>Current unpaid balances, all dates</small>
        </div>
      </section>

      <section className="financial-panel">
        <div className="financial-panel-heading">
          <div>
            <h3>Financial Report</h3>
            <p className="financial-muted">
              The date range affects expenses and payments collected.
              Outstanding invoices show the current balance across all dates.
            </p>
          </div>
        </div>

        <div className="financial-date-filters">
          <label>
            From
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <button
            className="financial-secondary-button"
            onClick={() => {
              setStartDate('');
              setEndDate('');
            }}
          >
            All Dates
          </button>
        </div>

        <div className="financial-report-grid">
          <div className="financial-report-item">
            <span>Payments Collected</span>
            <strong>{peso(report.paymentsCollected)}</strong>
          </div>
          <div className="financial-report-item">
            <span>Less: Expenses</span>
            <strong>{peso(report.expenseTotal)}</strong>
          </div>
          <div className="financial-report-item">
            <span>Net Cash Flow</span>
            <strong className={report.cashFlow < 0 ? 'financial-negative' : ''}>
              {peso(report.cashFlow)}
            </strong>
          </div>
        </div>

        <h4 className="financial-section-title">Expenses by Category</h4>

        {Object.keys(report.categoryTotals).length === 0 ? (
          <p className="financial-empty">No expenses in this date range.</p>
        ) : (
          <div className="financial-category-list">
            {CATEGORIES.filter((category) => report.categoryTotals[category] > 0)
              .map((category) => {
                const amount = report.categoryTotals[category];
                const percent = report.expenseTotal > 0
                  ? (amount / report.expenseTotal) * 100
                  : 0;

                return (
                  <div className="financial-category-row" key={category}>
                    <div className="financial-category-label">
                      <span>
                        {category.replaceAll('_', ' ').replace(
                          /^\w/,
                          (letter) => letter.toUpperCase()
                        )}
                      </span>
                      <strong>{peso(amount)}</strong>
                    </div>
                    <div className="financial-progress-track">
                      <div
                        className="financial-progress-fill"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      <section className="financial-panel">
        <div className="financial-panel-heading">
          <div>
            <h3>Expense Records</h3>
            <p className="financial-muted">
              Showing {filteredExpenses.length} of {expenses.length} records
            </p>
          </div>
          <button
            className="financial-secondary-button"
            onClick={loadData}
          >
            Refresh
          </button>
        </div>

        <div className="financial-filters">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search description, receipt, or notes..."
          />

          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.replaceAll('_', ' ').replace(
                  /^\w/,
                  (letter) => letter.toUpperCase()
                )}
              </option>
            ))}
          </select>

          <button
            className="financial-text-button"
            onClick={clearFilters}
          >
            Clear Filters
          </button>
        </div>

        <div className="financial-table-wrapper">
          <table className="financial-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Related Order</th>
                <th>Receipt / Reference</th>
                <th>Amount</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((expense) => {
                const relatedOrder = orders.find(
                  (order) => order.id === expense.order_id
                );

                return (
                  <tr key={expense.id}>
                    <td>{formatDate(expense.expense_date)}</td>
                    <td>
                      <strong>{expense.description}</strong>
                      {expense.notes && (
                        <small className="financial-cell-note">
                          {expense.notes}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className="financial-category-chip">
                        {expense.expense_category.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {relatedOrder
                        ? `${relatedOrder.order_number} - ${relatedOrder.order_title}`
                        : 'General'}
                    </td>
                    <td>{expense.receipt_reference || '—'}</td>
                    <td className="financial-amount">
                      {peso(expense.amount)}
                    </td>
                    {canManage && (
                      <td>
                        <div className="financial-row-actions">
                          <button
                            className="financial-text-button"
                            onClick={() => startEditing(expense)}
                          >
                            Edit
                          </button>
                          <button
                            className="financial-text-button financial-delete-button"
                            onClick={() => deleteExpense(expense)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {filteredExpenses.length === 0 && (
                <tr>
                  <td
                    colSpan={canManage ? 7 : 6}
                    className="financial-empty"
                  >
                    No expense records match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
