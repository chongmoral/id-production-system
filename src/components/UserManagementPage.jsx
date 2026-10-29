
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'production_staff', label: 'Production Staff' },
  { value: 'accountant', label: 'Accountant' },
];

const formatDate = (value) => {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const roleLabel = (role) =>
  ROLES.find((item) => item.value === role)?.label || role;

export default function UserManagementPage({ userRole }) {
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');

  const isOwner = userRole === 'owner';

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      setCurrentUserId(user?.id || null);

      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('id, full_name, role, created_at, updated_at')
        .order('full_name', { ascending: true });

      if (queryError) throw queryError;

      setUsers(data || []);
    } catch (err) {
      setError(err.message || 'Unable to load user profiles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOwner) {
      loadUsers();
    } else {
      setLoading(false);
    }
  }, [isOwner, loadUsers]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !term ||
        user.full_name?.toLowerCase().includes(term) ||
        user.id?.toLowerCase().includes(term);

      const matchesRole =
        roleFilter === 'all' || user.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  const startEditing = (user) => {
    setEditingId(user.id);
    setEditName(user.full_name);
    setEditRole(user.role);
    setError('');
    setSuccess('');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditRole('');
  };

  const saveUser = async (event) => {
    event.preventDefault();

    if (!isOwner || !editingId) return;

    const name = editName.trim();

    if (!name) {
      setError('Full name is required.');
      return;
    }

    if (!ROLES.some((role) => role.value === editRole)) {
      setError('Please select a valid role.');
      return;
    }

    const targetUser = users.find((user) => user.id === editingId);

    if (!targetUser) {
      setError('The selected user could not be found.');
      return;
    }

    if (
      targetUser.id === currentUserId &&
      editRole !== targetUser.role
    ) {
      setError(
        'You cannot change your own role. Ask another authorized owner to make that change.'
      );
      return;
    }

    if (
      targetUser.role === 'owner' &&
      editRole !== 'owner'
    ) {
      const otherOwners = users.filter(
        (user) => user.role === 'owner' && user.id !== targetUser.id
      );

      if (otherOwners.length === 0) {
        setError('The last owner cannot be demoted.');
        return;
      }
    }

    setSavingId(editingId);
    setError('');
    setSuccess('');

    try {
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: name,
          role: editRole,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingId)
        .select('id, full_name, role, created_at, updated_at')
        .single();

      if (updateError) throw updateError;

      setUsers((current) =>
        current.map((user) => (user.id === data.id ? data : user))
      );

      setSuccess(`Profile for ${data.full_name} was updated.`);
      cancelEditing();
    } catch (err) {
      setError(
        err.message ||
          'Unable to update the profile. Check your Supabase permissions.'
      );
    } finally {
      setSavingId(null);
    }
  };

  if (!isOwner) {
    return (
      <div className="users-page">
        <section className="users-panel users-access-denied">
          <h2>Access Restricted</h2>
          <p>Only the owner can access User Management.</p>
        </section>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="users-page">
        <div className="users-loading">Loading user profiles...</div>
      </div>
    );
  }

  return (
    <div className="users-page">
      <header className="users-header">
        <div>
          <p className="users-eyebrow">ADMINISTRATION</p>
          <h2>User Management</h2>
          <p className="users-subtitle">
            Manage registered profiles and assign system roles.
          </p>
        </div>

        <button
          type="button"
          className="users-secondary-button"
          onClick={loadUsers}
        >
          Refresh
        </button>
      </header>

      {error && (
        <div className="users-alert users-alert-error">{error}</div>
      )}

      {success && (
        <div className="users-alert users-alert-success">{success}</div>
      )}

      <section className="users-stats">
        <div className="users-stat-card">
          <span>Total Profiles</span>
          <strong>{users.length}</strong>
        </div>
        <div className="users-stat-card">
          <span>Owners</span>
          <strong>{users.filter((user) => user.role === 'owner').length}</strong>
        </div>
        <div className="users-stat-card">
          <span>Production Staff</span>
          <strong>
            {users.filter((user) => user.role === 'production_staff').length}
          </strong>
        </div>
        <div className="users-stat-card">
          <span>Accountants</span>
          <strong>
            {users.filter((user) => user.role === 'accountant').length}
          </strong>
        </div>
      </section>

      <section className="users-panel">
        <div className="users-panel-heading">
          <div>
            <h3>Registered Users</h3>
            <p className="users-muted">
              {filteredUsers.length} of {users.length} profiles
            </p>
          </div>
        </div>

        <div className="users-filters">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or user ID..."
            aria-label="Search users"
          />

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            aria-label="Filter by role"
          >
            <option value="all">All roles</option>
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>

        <div className="users-table-wrapper">
          <table className="users-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Role</th>
                <th>User ID</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const editing = editingId === user.id;
                const self = user.id === currentUserId;

                return (
                  <tr key={user.id}>
                    <td>
                      {editing ? (
                        <input
                          className="users-inline-input"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          aria-label="Full name"
                          required
                        />
                      ) : (
                        <div className="users-name-cell">
                          <span className="users-avatar">
                            {(user.full_name || '?').charAt(0).toUpperCase()}
                          </span>
                          <span>
                            <strong>{user.full_name}</strong>
                            {self && (
                              <small className="users-self-label">
                                You
                              </small>
                            )}
                          </span>
                        </div>
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <select
                          className="users-inline-input"
                          value={editRole}
                          onChange={(event) => setEditRole(event.target.value)}
                          aria-label="User role"
                          disabled={self}
                        >
                          {ROLES.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`users-role users-role-${user.role}`}>
                          {roleLabel(user.role)}
                        </span>
                      )}
                    </td>

                    <td>
                      <code className="users-id">{user.id}</code>
                    </td>

                    <td>{formatDate(user.created_at)}</td>

                    <td>
                      {editing ? (
                        <div className="users-actions">
                          <button
                            type="button"
                            className="users-save-button"
                            onClick={saveUser}
                            disabled={savingId === user.id}
                          >
                            {savingId === user.id ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="users-text-button"
                            onClick={cancelEditing}
                            disabled={savingId === user.id}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="users-text-button"
                          onClick={() => startEditing(user)}
                        >
                          Edit Profile
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="5" className="users-empty">
                    No profiles match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="users-note">
          Changing a profile role affects the permissions used by this
          application. User creation, password resets, and account deletion
          are not available on this page.
        </p>
      </section>
    </div>
  );
}
