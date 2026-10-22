
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const EMPTY_FORM = {
  school_name: '',
  contact_person: '',
  contact_number: '',
  email: '',
  address: '',
};

export default function SchoolsPage({ userRole }) {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingSchoolId, setEditingSchoolId] = useState(null);
  const [deletingSchoolId, setDeletingSchoolId] = useState(null);

  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const isOwner = userRole === 'owner';

  const filteredSchools = schools.filter((school) => {
    const search = searchTerm.trim().toLowerCase();

    return (
      school.school_name?.toLowerCase().includes(search) ||
      school.contact_person?.toLowerCase().includes(search) ||
      school.contact_number?.toLowerCase().includes(search) ||
      school.email?.toLowerCase().includes(search) ||
      school.address?.toLowerCase().includes(search)
    );
  });

  async function loadSchools() {
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .order('school_name', { ascending: true });

      if (error) throw error;

      setSchools(data || []);
    } catch (err) {
      console.error('Error loading schools:', err);
      setError('Unable to load schools. Check your access permissions.');
    } finally {
      setLoading(false);
    }
  }

  function openNewSchoolForm() {
    setEditingSchoolId(null);
    setFormData({ ...EMPTY_FORM });
    setFormError('');
    setSuccess('');
    setShowForm(true);
  }

  function openEditForm(school) {
    setEditingSchoolId(school.id);
    setFormData({
      school_name: school.school_name || '',
      contact_person: school.contact_person || '',
      contact_number: school.contact_number || '',
      email: school.email || '',
      address: school.address || '',
    });
    setFormError('');
    setSuccess('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingSchoolId(null);
    setFormData({ ...EMPTY_FORM });
    setFormError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isOwner) {
      setFormError('Only the owner can register or edit schools.');
      return;
    }

    const schoolName = formData.school_name.trim();

    if (!schoolName) {
      setFormError('School name is required.');
      return;
    }

    setSaving(true);
    setFormError('');
    setSuccess('');

    const schoolData = {
      school_name: schoolName,
      contact_person: formData.contact_person.trim() || null,
      contact_number: formData.contact_number.trim() || null,
      email: formData.email.trim() || null,
      address: formData.address.trim() || null,
    };

    try {
      if (editingSchoolId !== null) {
        const { error } = await supabase
          .from('schools')
          .update(schoolData)
          .eq('id', editingSchoolId);

        if (error) throw error;

        setSuccess('School details updated successfully.');
      } else {
        const { error } = await supabase
          .from('schools')
          .insert([schoolData]);

        if (error) throw error;

        setSuccess('School registered successfully.');
      }

      closeForm();
      setSearchTerm('');
      await loadSchools();
    } catch (err) {
      console.error('Error saving school:', err);
      setFormError(
        err.code === '23505'
          ? 'A school with these unique details already exists.'
          : 'Unable to save school. Check your permissions and try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(school) {
    if (!isOwner) {
      setError('Only the owner can delete schools.');
      return;
    }

    const confirmed = window.confirm(
      `Delete "${school.school_name}"?\n\nThis action cannot be undone. Schools linked to existing orders cannot be deleted.`
    );

    if (!confirmed) return;

    setDeletingSchoolId(school.id);
    setError('');
    setSuccess('');

    try {
      // Check for linked orders before attempting deletion.
      const { count, error: orderCheckError } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', school.id);

      if (orderCheckError) {
        throw new Error(
          'Unable to check linked orders. Please verify your database permissions.'
        );
      }

      if (count > 0) {
        setError(
          `Cannot delete "${school.school_name}" because it has ${count} linked order(s).`
        );
        return;
      }

      const { error: deleteError } = await supabase
        .from('schools')
        .delete()
        .eq('id', school.id);

      if (deleteError) {
        if (deleteError.code === '23503') {
          throw new Error(
            'This school is linked to other records and cannot be deleted.'
          );
        }

        throw deleteError;
      }

      setSchools((current) =>
        current.filter((item) => item.id !== school.id)
      );

      setSuccess(`"${school.school_name}" was deleted successfully.`);
    } catch (err) {
      console.error('Error deleting school:', err);
      setError(
        err.message ||
          'Unable to delete school. Check your permissions and try again.'
      );
    } finally {
      setDeletingSchoolId(null);
    }
  }

  useEffect(() => {
    loadSchools();
  }, []);

  return (
    <section>
      <h2 className="dashboard-title">Schools &amp; Clients</h2>

      <p className="dashboard-subtitle">
        Manage the schools and organizations that request ID production.
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

      {loading && <p>Loading schools...</p>}

      {error && (
        <div className="dashboard-panel" role="alert">
          <p className="login-error">{error}</p>
          <button
            type="button"
            className="logout-button"
            onClick={loadSchools}
            disabled={loading}
          >
            Try Again
          </button>
          <button
            type="button"
            className="logout-button"
            onClick={() => setError('')}
          >
            Dismiss
          </button>
        </div>
      )}

      {!loading && !error && (
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
              <h3>Registered Schools</h3>
              <p className="dashboard-subtitle">
                Total schools: {schools.length}
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search schools..."
                aria-label="Search schools"
                style={{
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  minWidth: '200px',
                }}
              />

              {isOwner && (
                <button
                  type="button"
                  className="logout-button"
                  onClick={openNewSchoolForm}
                >
                  + Register School
                </button>
              )}

              <button
                type="button"
                className="logout-button"
                onClick={loadSchools}
                disabled={loading}
              >
                Refresh List
              </button>
            </div>
          </div>

          {showForm && isOwner && (
            <form
              onSubmit={handleSubmit}
              className="dashboard-panel"
              style={{ marginTop: '20px' }}
            >
              <h3>
                {editingSchoolId !== null
                  ? 'Edit School'
                  : 'Register a School'}
              </h3>

              {formError && (
                <p className="login-error" role="alert">
                  {formError}
                </p>
              )}

              <div style={{ display: 'grid', gap: '16px' }}>
                <label>
                  School Name *
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={formData.school_name}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        school_name: event.target.value,
                      })
                    }
                    placeholder="Enter school name"
                  />
                </label>

                <label>
                  Contact Person
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        contact_person: event.target.value,
                      })
                    }
                    placeholder="Enter contact person's name"
                  />
                </label>

                <label>
                  Contact Number
                  <input
                    type="tel"
                    value={formData.contact_number}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        contact_number: event.target.value,
                      })
                    }
                    placeholder="Enter contact number"
                  />
                </label>

                <label>
                  Email Address
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        email: event.target.value,
                      })
                    }
                    placeholder="school@example.com"
                  />
                </label>

                <label>
                  Address
                  <textarea
                    rows={3}
                    value={formData.address}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        address: event.target.value,
                      })
                    }
                    placeholder="Enter school address"
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
                    : editingSchoolId !== null
                      ? 'Save Changes'
                      : 'Save School'}
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

          {filteredSchools.length === 0 ? (
            <p className="dashboard-subtitle" style={{ marginTop: '20px' }}>
              {schools.length === 0
                ? 'No schools have been registered yet.'
                : 'No schools match your search.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px', textAlign: 'left' }}>
                      School Name
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>
                      Contact Person
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>
                      Contact Number
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>
                      Email
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>
                      Address
                    </th>
                    {isOwner && (
                      <th style={{ padding: '12px', textAlign: 'left' }}>
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filteredSchools.map((school) => (
                    <tr key={school.id}>
                      <td style={{ padding: '12px' }}>
                        {school.school_name}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {school.contact_person || 'Not provided'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {school.contact_number || 'Not provided'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {school.email || 'Not provided'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {school.address || 'Not provided'}
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
                              onClick={() => openEditForm(school)}
                              disabled={deletingSchoolId !== null}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="logout-button"
                              onClick={() => handleDelete(school)}
                              disabled={deletingSchoolId === school.id}
                            >
                              {deletingSchoolId === school.id
                                ? 'Deleting...'
                                : 'Delete'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
