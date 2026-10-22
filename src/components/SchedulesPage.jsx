
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const ACTIVITY_TYPES = [
  { value: 'photo_taking', label: 'Photo Taking' },
  { value: 'design_approval', label: 'Design Approval' },
  { value: 'photo_collection', label: 'Photo Collection' },
  { value: 'printing', label: 'Printing' },
  { value: 'laminating', label: 'Laminating' },
  { value: 'cutting', label: 'Cutting' },
  { value: 'sorting', label: 'Sorting' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Other' },
];

const SCHEDULE_STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EMPTY_FORM = {
  order_id: '',
  activity_type: 'photo_taking',
  title: '',
  date: '',
  start_time: '09:00',
  end_time: '10:00',
  location: '',
  status: 'scheduled',
};

function formatDate(date) {
  if (!date) return 'Not set';

  const [year, month, day] = date.slice(0, 10).split('-');
  return `${month}/${day}/${year}`;
}

function formatTime(value) {
  if (!value) return 'Not set';

  const [hours, minutes] = value.slice(0, 5).split(':');
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return date.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getActivityLabel(value) {
  return (
    ACTIVITY_TYPES.find((item) => item.value === value)?.label ||
    value ||
    'Other'
  );
}

function getStatusLabel(value) {
  return (
    SCHEDULE_STATUSES.find((item) => item.value === value)?.label ||
    value ||
    'Scheduled'
  );
}

export default function SchedulesPage({ userRole }) {
  const [schedules, setSchedules] = useState([]);
  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const isOwner = userRole === 'owner';

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [scheduleResult, orderResult] = await Promise.all([
        supabase
          .from('schedules')
          .select('*')
          .order('start_time', { ascending: true }),

        supabase
          .from('orders')
          .select(
            'id, order_number, order_title, school_id, order_date, deadline, status'
          )
          .order('created_at', { ascending: false }),
      ]);

      if (scheduleResult.error) throw scheduleResult.error;
      if (orderResult.error) throw orderResult.error;

      setSchedules(scheduleResult.data || []);
      setOrders(orderResult.data || []);
    } catch (err) {
      console.error('Error loading schedules:', err);
      setError(
        'Unable to load schedules or orders. Check your connection and access permissions.'
      );
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingScheduleId(null);
    setFormData({ ...EMPTY_FORM });
    setFormError('');
    setSuccess('');
    setShowForm(true);
  }

  function openEditForm(schedule) {
    const start = new Date(schedule.start_time);
    const end = new Date(schedule.end_time);

    const date = [
      start.getFullYear(),
      String(start.getMonth() + 1).padStart(2, '0'),
      String(start.getDate()).padStart(2, '0'),
    ].join('-');

    const startTime = [
      String(start.getHours()).padStart(2, '0'),
      String(start.getMinutes()).padStart(2, '0'),
    ].join(':');

    const endTime = [
      String(end.getHours()).padStart(2, '0'),
      String(end.getMinutes()).padStart(2, '0'),
    ].join(':');

    setEditingScheduleId(schedule.id);

    setFormData({
      order_id: String(schedule.order_id),
      activity_type: schedule.activity_type || 'other',
      title: schedule.title || '',
      date,
      start_time: startTime,
      end_time: endTime,
      location: schedule.location || '',
      status: schedule.status || 'scheduled',
    });

    setFormError('');
    setSuccess('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingScheduleId(null);
    setFormData({ ...EMPTY_FORM });
    setFormError('');
  }

  function updateField(field, value) {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function findConflict(startTime, endTime, location) {
    const newStart = new Date(startTime).getTime();
    const newEnd = new Date(endTime).getTime();
    const newLocation = location.trim().toLowerCase();

    return schedules.find((schedule) => {
      if (schedule.id === editingScheduleId) return false;
      if (schedule.status === 'cancelled') return false;

      const existingStart = new Date(schedule.start_time).getTime();
      const existingEnd = new Date(schedule.end_time).getTime();

      const overlaps =
        newStart < existingEnd && newEnd > existingStart;

      if (!overlaps) return false;

      // Flag overlapping bookings for the same location.
      const existingLocation = (schedule.location || '')
        .trim()
        .toLowerCase();

      const sameLocation =
        newLocation !== '' && existingLocation === newLocation;

      return sameLocation;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isOwner) {
      setFormError('Only the owner can create or edit schedules.');
      return;
    }

    if (!formData.order_id) {
      setFormError('Please select a production order.');
      return;
    }

    if (!formData.title.trim()) {
      setFormError('Activity title is required.');
      return;
    }

    if (!formData.date || !formData.start_time || !formData.end_time) {
      setFormError('Date, start time, and end time are required.');
      return;
    }

    const start = new Date(
      `${formData.date}T${formData.start_time}:00`
    );
    const end = new Date(
      `${formData.date}T${formData.end_time}:00`
    );

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      setFormError('End time must be later than start time.');
      return;
    }

    const order = orders.find(
      (item) => String(item.id) === formData.order_id
    );

    if (!order) {
      setFormError('The selected order is unavailable. Refresh and try again.');
      return;
    }

    const startISO = start.toISOString();
    const endISO = end.toISOString();

    const conflict = findConflict(
      startISO,
      endISO,
      formData.location
    );

    if (conflict) {
      const confirmed = window.confirm(
        `Scheduling conflict detected!\n\n"${conflict.title}" already occupies this location during an overlapping time.\n\nDo you want to continue anyway?`
      );

      if (!confirmed) return;
    }

    setSaving(true);
    setFormError('');
    setError('');
    setSuccess('');

    const scheduleData = {
      order_id: Number(formData.order_id),
      activity_type: formData.activity_type,
      title: formData.title.trim(),
      start_time: startISO,
      end_time: endISO,
      location: formData.location.trim() || null,
      status: formData.status,
    };

    try {
      if (editingScheduleId !== null) {
        const { error } = await supabase
          .from('schedules')
          .update(scheduleData)
          .eq('id', editingScheduleId);

        if (error) throw error;

        setSuccess('Schedule updated successfully.');
      } else {
        const { error } = await supabase
          .from('schedules')
          .insert([scheduleData]);

        if (error) throw error;

        setSuccess('Schedule created successfully.');
      }

      closeForm();
      await loadData();
    } catch (err) {
      console.error('Error saving schedule:', err);
      setFormError(
        'Unable to save the schedule. Check your database permissions and table constraints.'
      );
    } finally {
      setSaving(false);
    }
  }

  const filteredSchedules = schedules.filter((schedule) => {
    const order = orders.find(
      (item) => Number(item.id) === Number(schedule.order_id)
    );

    const search = searchTerm.trim().toLowerCase();

    const matchesSearch =
      schedule.title?.toLowerCase().includes(search) ||
      schedule.location?.toLowerCase().includes(search) ||
      schedule.activity_type?.toLowerCase().includes(search) ||
      order?.order_number?.toLowerCase().includes(search) ||
      order?.order_title?.toLowerCase().includes(search);

    const matchesStatus =
      statusFilter === 'all' || schedule.status === statusFilter;

    const scheduleDate = schedule.start_time?.slice(0, 10);

    const matchesDate =
      dateFilter === 'all' ||
      (dateFilter === 'upcoming' &&
        scheduleDate >= new Date().toLocaleDateString('en-CA') &&
        schedule.status !== 'cancelled' &&
        schedule.status !== 'completed') ||
      (dateFilter === 'past' &&
        scheduleDate < new Date().toLocaleDateString('en-CA'));

    return matchesSearch && matchesStatus && matchesDate;
  });

  const upcomingCount = schedules.filter(
    (schedule) =>
      schedule.start_time?.slice(0, 10) >=
        new Date().toLocaleDateString('en-CA') &&
      schedule.status !== 'completed' &&
      schedule.status !== 'cancelled'
  ).length;

  const completedCount = schedules.filter(
    (schedule) => schedule.status === 'completed'
  ).length;

  useEffect(() => {
    loadData();
  }, []);

  return (
    <section>
      <h2 className="dashboard-title">Schedules &amp; Calendar</h2>

      <p className="dashboard-subtitle">
        Plan production activities, photo sessions, approvals, and deliveries.
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
          <p className="dashboard-subtitle">Total Activities</p>
          <h3>{schedules.length}</h3>
        </div>

        <div className="dashboard-panel">
          <p className="dashboard-subtitle">Upcoming Activities</p>
          <h3>{upcomingCount}</h3>
        </div>

        <div className="dashboard-panel">
          <p className="dashboard-subtitle">Completed Activities</p>
          <h3>{completedCount}</h3>
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
            <h3>Scheduled Activities</h3>
            <p className="dashboard-subtitle">
              {filteredSchedules.length} of {schedules.length} activities
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {isOwner && (
              <button
                type="button"
                className="logout-button"
                onClick={openCreateForm}
                disabled={loading || orders.length === 0}
              >
                + Add Schedule
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

        {!loading && orders.length === 0 && (
          <p className="dashboard-subtitle">
            Create a production order first before scheduling an activity.
          </p>
        )}

        {showForm && isOwner && (
          <form
            onSubmit={handleSubmit}
            className="dashboard-panel"
            style={{ marginTop: '20px' }}
          >
            <h3>
              {editingScheduleId !== null ? 'Edit Schedule' : 'Add Schedule'}
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
                Production Order *
                <select
                  required
                  value={formData.order_id}
                  onChange={(event) =>
                    updateField('order_id', event.target.value)
                  }
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
                Activity Type *
                <select
                  required
                  value={formData.activity_type}
                  onChange={(event) =>
                    updateField('activity_type', event.target.value)
                  }
                >
                  {ACTIVITY_TYPES.map((activity) => (
                    <option key={activity.value} value={activity.value}>
                      {activity.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Activity Title *
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={formData.title}
                  onChange={(event) =>
                    updateField('title', event.target.value)
                  }
                  placeholder="e.g. Grade 7 Photo Session"
                />
              </label>

              <label>
                Date *
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(event) =>
                    updateField('date', event.target.value)
                  }
                />
              </label>

              <label>
                Start Time *
                <input
                  type="time"
                  required
                  value={formData.start_time}
                  onChange={(event) =>
                    updateField('start_time', event.target.value)
                  }
                />
              </label>

              <label>
                End Time *
                <input
                  type="time"
                  required
                  value={formData.end_time}
                  onChange={(event) =>
                    updateField('end_time', event.target.value)
                  }
                />
              </label>

              <label>
                Location
                <input
                  type="text"
                  value={formData.location}
                  onChange={(event) =>
                    updateField('location', event.target.value)
                  }
                  placeholder="e.g. School AVR"
                />
              </label>

              <label>
                Status *
                <select
                  required
                  value={formData.status}
                  onChange={(event) =>
                    updateField('status', event.target.value)
                  }
                >
                  {SCHEDULE_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
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
                  : editingScheduleId !== null
                    ? 'Save Changes'
                    : 'Create Schedule'}
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
            placeholder="Search activity, order, or location..."
            aria-label="Search schedules"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter schedules by status"
          >
            <option value="all">All statuses</option>
            {SCHEDULE_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>

          <select
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            aria-label="Filter schedules by date"
          >
            <option value="all">All dates</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past activities</option>
          </select>
        </div>

        {loading ? (
          <p>Loading schedules...</p>
        ) : filteredSchedules.length === 0 ? (
          <p className="dashboard-subtitle">
            No activities match your current search or filters.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    'Date',
                    'Time',
                    'Activity',
                    'Production Order',
                    'Location',
                    'Status',
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
                {filteredSchedules.map((schedule) => {
                  const order = orders.find(
                    (item) =>
                      Number(item.id) === Number(schedule.order_id)
                  );

                  return (
                    <tr key={schedule.id}>
                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                        {formatDate(schedule.start_time)}
                      </td>

                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                        {formatTime(schedule.start_time)} –{' '}
                        {formatTime(schedule.end_time)}
                      </td>

                      <td style={{ padding: '12px' }}>
                        <strong>{schedule.title}</strong>
                        <div className="dashboard-subtitle">
                          {getActivityLabel(schedule.activity_type)}
                        </div>
                      </td>

                      <td style={{ padding: '12px' }}>
                        {order
                          ? `${order.order_number} - ${order.order_title}`
                          : 'Unavailable order'}
                      </td>

                      <td style={{ padding: '12px' }}>
                        {schedule.location || 'Not specified'}
                      </td>

                      <td style={{ padding: '12px' }}>
                        {getStatusLabel(schedule.status)}
                      </td>

                      {isOwner && (
                        <td style={{ padding: '12px' }}>
                          <button
                            type="button"
                            className="logout-button"
                            onClick={() => openEditForm(schedule)}
                          >
                            Edit
                          </button>
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
