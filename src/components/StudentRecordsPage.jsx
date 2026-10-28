
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const PHOTO_STATUSES = [
  'pending',
  'received',
  'verified',
  'needs_retake',
];

const RECORD_STATUSES = ['active', 'excluded', 'completed'];

const emptyForm = {
  order_id: '',
  student_number: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  grade_level: '',
  section: '',
  photo_status: 'pending',
  record_status: 'active',
  notes: '',
};

function formatStatus(value) {
  if (!value) return 'Unknown';

  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatName(student) {
  return [
    student.first_name,
    student.middle_name,
    student.last_name,
    student.suffix,
  ]
    .filter(Boolean)
    .join(' ');
}

function getErrorMessage(error) {
  if (error?.code === '23505') {
    return 'This student number may already exist for this order.';
  }

  if (error?.code === '23503') {
    return 'The selected order does not exist or cannot be accessed.';
  }

  return error?.message || 'Something went wrong. Please try again.';
}

export default function StudentRecordsPage({ userRole }) {
  const isOwner = userRole === 'owner';

  const [students, setStudents] = useState([]);
  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [search, setSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState('all');
  const [photoFilter, setPhotoFilter] = useState('all');
  const [recordFilter, setRecordFilter] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError('');

    try {
      const [ordersResult, studentsResult] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, order_title, status')
          .order('created_at', { ascending: false }),

        supabase
          .from('students')
          .select('*')
          .order('last_name', { ascending: true }),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (studentsResult.error) throw studentsResult.error;

      setOrders(ordersResult.data || []);
      setStudents(studentsResult.data || []);
    } catch (err) {
      setError(
        `Unable to load student records. ${getErrorMessage(err)}`
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function openCreateForm() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      order_id: orderFilter !== 'all' ? orderFilter : '',
    });
    setError('');
    setSuccess('');
    setShowForm(true);
  }

  function openEditForm(student) {
    setEditingId(student.id);

    setForm({
      order_id: String(student.order_id ?? ''),
      student_number: student.student_number ?? '',
      first_name: student.first_name ?? '',
      middle_name: student.middle_name ?? '',
      last_name: student.last_name ?? '',
      suffix: student.suffix ?? '',
      grade_level: student.grade_level ?? '',
      section: student.section ?? '',
      photo_status: student.photo_status ?? 'pending',
      record_status: student.record_status ?? 'active',
      notes: student.notes ?? '',
    });

    setError('');
    setSuccess('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isOwner) {
      setError('Only the owner can add or edit student records.');
      return;
    }

    if (
      !form.order_id ||
      !form.student_number.trim() ||
      !form.first_name.trim() ||
      !form.last_name.trim()
    ) {
      setError(
        'Please select an order and provide the student number, first name, and last name.'
      );
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const payload = {
      order_id: form.order_id,
      student_number: form.student_number.trim(),
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim() || null,
      last_name: form.last_name.trim(),
      suffix: form.suffix.trim() || null,
      grade_level: form.grade_level.trim() || null,
      section: form.section.trim() || null,
      photo_status: form.photo_status,
      record_status: form.record_status,
      notes: form.notes.trim() || null,
    };

    try {
      let result;

      if (editingId !== null) {
        result = await supabase
          .from('students')
          .update(payload)
          .eq('id', editingId);
      } else {
        result = await supabase
          .from('students')
          .insert(payload);
      }

      if (result.error) throw result.error;

      closeForm();

      await loadData(true);

      setSuccess(
        editingId !== null
          ? 'Student record updated successfully.'
          : 'Student record added successfully.'
      );
    } catch (err) {
      setError(
        `Unable to save student record. ${getErrorMessage(err)}`
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(student) {
    if (!isOwner) return;

    const confirmed = window.confirm(
      `Delete the record for ${formatName(student)}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setError('');
    setSuccess('');

    try {
      const { error: deleteError } = await supabase
        .from('students')
        .delete()
        .eq('id', student.id);

      if (deleteError) throw deleteError;

      setStudents((current) =>
        current.filter((item) => item.id !== student.id)
      );

      setSuccess('Student record deleted successfully.');
    } catch (err) {
      setError(
        `Unable to delete this record. ${getErrorMessage(err)}`
      );
    }
  }

  const orderMap = useMemo(
    () => new Map(orders.map((order) => [String(order.id), order])),
    [orders]
  );

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return students.filter((student) => {
      const order = orderMap.get(String(student.order_id));

      const searchableText = [
        student.student_number,
        student.first_name,
        student.middle_name,
        student.last_name,
        student.suffix,
        student.grade_level,
        student.section,
        order?.order_number,
        order?.order_title,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        !query || searchableText.includes(query);

      const matchesOrder =
        orderFilter === 'all' ||
        String(student.order_id) === orderFilter;

      const matchesPhoto =
        photoFilter === 'all' ||
        student.photo_status === photoFilter;

      const matchesRecord =
        recordFilter === 'all' ||
        student.record_status === recordFilter;

      return (
        matchesSearch &&
        matchesOrder &&
        matchesPhoto &&
        matchesRecord
      );
    });
  }, [
    students,
    orderMap,
    search,
    orderFilter,
    photoFilter,
    recordFilter,
  ]);

  const verifiedPhotos = students.filter(
    (student) => student.photo_status === 'verified'
  ).length;

  const pendingPhotos = students.filter(
    (student) => student.photo_status === 'pending'
  ).length;

  const needsRetake = students.filter(
    (student) => student.photo_status === 'needs_retake'
  ).length;

  const activeRecords = students.filter(
    (student) => student.record_status === 'active'
  ).length;

  return (
    <section className="student-page">
      <div className="student-page-header">
        <div>
          <h2 className="student-page-title">Student Records</h2>
          <p className="student-page-subtitle">
            Manage student information and monitor ID photo readiness.
          </p>
        </div>

        <div className="student-header-actions">
          <button
            type="button"
            className="student-btn student-btn-secondary"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          {isOwner && (
            <button
              type="button"
              className="student-btn student-btn-primary"
              onClick={openCreateForm}
              disabled={orders.length === 0}
            >
              + Add Student
            </button>
          )}
        </div>
      </div>

      {!isOwner && (
        <div className="student-notice">
          You have read-only access to student records.
        </div>
      )}

      {error && (
        <div className="student-alert student-alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="student-alert student-alert-success" role="status">
          {success}
        </div>
      )}

      <div className="student-stats-grid">
        <div className="student-stat-card">
          <span>Total Records</span>
          <strong>{students.length}</strong>
        </div>

        <div className="student-stat-card">
          <span>Active Records</span>
          <strong>{activeRecords}</strong>
        </div>

        <div className="student-stat-card">
          <span>Photos Verified</span>
          <strong>{verifiedPhotos}</strong>
        </div>

        <div className="student-stat-card">
          <span>Photos Pending</span>
          <strong>{pendingPhotos}</strong>
        </div>

        <div className="student-stat-card">
          <span>Needs Retake</span>
          <strong>{needsRetake}</strong>
        </div>
      </div>

      {showForm && isOwner && (
        <div className="student-form-card">
          <div className="student-form-heading">
            <div>
              <h3>{editingId !== null ? 'Edit Student' : 'Add Student'}</h3>
              <p>Fields marked with * are required.</p>
            </div>

            <button
              type="button"
              className="student-close-btn"
              onClick={closeForm}
              aria-label="Close form"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="student-form-grid">
              <label className="student-field student-field-full">
                Production Order *
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

              <label className="student-field">
                Student Number *
                <input
                  name="student_number"
                  value={form.student_number}
                  onChange={updateField}
                  placeholder="e.g. 2026-001"
                  required
                />
              </label>

              <label className="student-field">
                First Name *
                <input
                  name="first_name"
                  value={form.first_name}
                  onChange={updateField}
                  required
                />
              </label>

              <label className="student-field">
                Middle Name
                <input
                  name="middle_name"
                  value={form.middle_name}
                  onChange={updateField}
                />
              </label>

              <label className="student-field">
                Last Name *
                <input
                  name="last_name"
                  value={form.last_name}
                  onChange={updateField}
                  required
                />
              </label>

              <label className="student-field">
                Suffix
                <input
                  name="suffix"
                  value={form.suffix}
                  onChange={updateField}
                  placeholder="Jr., Sr., III"
                />
              </label>

              <label className="student-field">
                Grade Level
                <input
                  name="grade_level"
                  value={form.grade_level}
                  onChange={updateField}
                  placeholder="e.g. Grade 12"
                />
              </label>

              <label className="student-field">
                Section
                <input
                  name="section"
                  value={form.section}
                  onChange={updateField}
                  placeholder="e.g. STEM A"
                />
              </label>

              <label className="student-field">
                Photo Status
                <select
                  name="photo_status"
                  value={form.photo_status}
                  onChange={updateField}
                  required
                >
                  {PHOTO_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="student-field">
                Record Status
                <select
                  name="record_status"
                  value={form.record_status}
                  onChange={updateField}
                  required
                >
                  {RECORD_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="student-field student-field-full">
                Notes
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={updateField}
                  rows={3}
                  placeholder="Additional information or corrections"
                />
              </label>
            </div>

            <div className="student-form-actions">
              <button
                type="button"
                className="student-btn student-btn-secondary"
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="student-btn student-btn-primary"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingId !== null
                    ? 'Save Changes'
                    : 'Add Student'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="student-filters">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, student number, section..."
          aria-label="Search student records"
        />

        <select
          value={orderFilter}
          onChange={(event) => setOrderFilter(event.target.value)}
          aria-label="Filter by order"
        >
          <option value="all">All Orders</option>
          {orders.map((order) => (
            <option key={order.id} value={String(order.id)}>
              {order.order_number}
            </option>
          ))}
        </select>

        <select
          value={photoFilter}
          onChange={(event) => setPhotoFilter(event.target.value)}
          aria-label="Filter by photo status"
        >
          <option value="all">All Photo Statuses</option>
          {PHOTO_STATUSES.map((status) => (
            <option key={status} value={status}>
              {formatStatus(status)}
            </option>
          ))}
        </select>

        <select
          value={recordFilter}
          onChange={(event) => setRecordFilter(event.target.value)}
          aria-label="Filter by record status"
        >
          <option value="all">All Record Statuses</option>
          {RECORD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {formatStatus(status)}
            </option>
          ))}
        </select>
      </div>

      <div className="student-table-card">
        {loading ? (
          <div className="student-empty-state">
            Loading student records...
          </div>
        ) : students.length === 0 ? (
          <div className="student-empty-state">
            <h3>No student records yet</h3>
            <p>
              Add students to an existing production order to get started.
            </p>
            {isOwner && orders.length === 0 && (
              <p>Create an order first in Orders &amp; Deadlines.</p>
            )}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="student-empty-state">
            No records match your search or filters.
          </div>
        ) : (
          <div className="student-table-scroll">
            <table className="student-table">
              <thead>
                <tr>
                  <th>Student Number</th>
                  <th>Student Name</th>
                  <th>Grade / Section</th>
                  <th>Production Order</th>
                  <th>Photo Status</th>
                  <th>Record Status</th>
                  {isOwner && <th>Actions</th>}
                </tr>
              </thead>

              <tbody>
                {filteredStudents.map((student) => {
                  const order = orderMap.get(String(student.order_id));

                  return (
                    <tr key={student.id}>
                      <td className="student-number-cell">
                        {student.student_number}
                      </td>

                      <td>
                        <strong>{formatName(student)}</strong>
                        {student.notes && (
                          <p className="student-row-note">
                            {student.notes}
                          </p>
                        )}
                      </td>

                      <td>
                        {[student.grade_level, student.section]
                          .filter(Boolean)
                          .join(' / ') || '—'}
                      </td>

                      <td>
                        {order ? (
                          <>
                            <strong>{order.order_number}</strong>
                            <p className="student-row-note">
                              {order.order_title}
                            </p>
                          </>
                        ) : (
                          'Order unavailable'
                        )}
                      </td>

                      <td>
                        <span
                          className={`student-status student-photo-${student.photo_status}`}
                        >
                          {formatStatus(student.photo_status)}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`student-status student-record-${student.record_status}`}
                        >
                          {formatStatus(student.record_status)}
                        </span>
                      </td>

                      {isOwner && (
                        <td>
                          <div className="student-row-actions">
                            <button
                              type="button"
                              className="student-action-btn"
                              onClick={() => openEditForm(student)}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="student-action-btn student-action-danger"
                              onClick={() => handleDelete(student)}
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

        <div className="student-table-footer">
          Showing {filteredStudents.length} of {students.length} records
        </div>
      </div>
    </section>
  );
}
