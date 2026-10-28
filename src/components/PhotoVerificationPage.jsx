
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const BUCKET = 'student-photos';

const VERIFICATION_STATUSES = [
  'pending',
  'verified',
  'rejected',
  'needs_retake',
];

function formatStatus(status = '') {
  return status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStudentName(student) {
  return [
    student.first_name,
    student.middle_name,
    student.last_name,
    student.suffix,
  ]
    .filter(Boolean)
    .join(' ');
}

export default function PhotoVerificationPage({ userRole }) {
  const [students, setStudents] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [previewUrls, setPreviewUrls] = useState({});

  const isOwner = userRole === 'owner';

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, [previewUrls]);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [
        { data: studentData, error: studentError },
        { data: photoData, error: photoError },
        { data: orderData, error: orderError },
      ] = await Promise.all([
        supabase
          .from('students')
          .select('*')
          .order('last_name', { ascending: true }),
        supabase
          .from('student_photos')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select('id, order_number, order_title'),
      ]);

      if (studentError) throw studentError;
      if (photoError) throw photoError;
      if (orderError) throw orderError;

      setStudents(studentData || []);
      setPhotos(photoData || []);
      setOrders(orderData || []);

      const paths = [...new Set(
        (photoData || [])
          .filter((photo) => photo.storage_path)
          .map((photo) => photo.storage_path)
      )];

      const urlEntries = await Promise.all(
        paths.map(async (path) => {
          const { data, error: urlError } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(path, 3600);

          if (urlError || !data?.signedUrl) return [path, ''];
          return [path, data.signedUrl];
        })
      );

      setPreviewUrls(Object.fromEntries(urlEntries));
    } catch (err) {
      setError(err.message || 'Failed to load photo verification data.');
    } finally {
      setLoading(false);
    }
  }

  function getLatestPhoto(studentId) {
    return photos.find(
      (photo) => String(photo.student_id) === String(studentId)
    );
  }

  function getOrderLabel(orderId) {
    const order = orders.find(
      (item) => String(item.id) === String(orderId)
    );

    return order
      ? `${order.order_number} - ${order.order_title}`
      : 'Unknown order';
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];

    setSelectedFile(null);
    setMessage('');
    setError('');

    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedTypes.includes(file.type)) {
      setError('Please select a JPG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('The photo must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }

    setSelectedFile(file);
  }

  async function handleUpload(event) {
    event.preventDefault();

    if (!isOwner) {
      setError('Only the owner can upload student photos.');
      return;
    }

    if (!selectedStudent || !selectedFile) {
      setError('Select a student and a photo first.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    let uploadedPath = '';

    try {
      const student = students.find(
        (item) => String(item.id) === String(selectedStudent)
      );

      if (!student) throw new Error('Selected student was not found.');

      const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const uniqueName = `${crypto.randomUUID()}.${extension}`;
      uploadedPath = `${student.id}/${uniqueName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(uploadedPath, selectedFile, {
          contentType: selectedFile.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      const { error: insertError } = await supabase
        .from('student_photos')
        .insert({
          student_id: student.id,
          storage_path: uploadedPath,
          original_filename: selectedFile.name,
          uploaded_by: authData.user?.id || null,
          verification_status: 'pending',
          notes: notes.trim() || null,
        });

      if (insertError) throw insertError;

      const { error: studentUpdateError } = await supabase
        .from('students')
        .update({ photo_status: 'received' })
        .eq('id', student.id);

      if (studentUpdateError) {
        setMessage(
          'Photo uploaded, but the student status could not be updated. Refresh and check your database permissions.'
        );
      } else {
        setMessage('Photo uploaded successfully and is awaiting verification.');
      }

      setSelectedFile(null);
      setSelectedStudent('');
      setNotes('');

      await loadData();
    } catch (err) {
      if (uploadedPath) {
        await supabase.storage.from(BUCKET).remove([uploadedPath]);
      }

      setError(err.message || 'Photo upload failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleVerification(photo, status) {
    if (!isOwner) {
      setError('Only the owner can verify photos.');
      return;
    }

    if (!VERIFICATION_STATUSES.includes(status)) return;

    const verificationNote = window.prompt(
      `Optional note for ${formatStatus(status)}:`,
      photo.notes || ''
    );

    if (verificationNote === null) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      const updateData = {
        verification_status: status,
        notes: verificationNote.trim() || null,
        verified_by: status === 'pending' ? null : authData.user?.id || null,
        verified_at: status === 'pending' ? null : new Date().toISOString(),
      };

      const { error: photoUpdateError } = await supabase
        .from('student_photos')
        .update(updateData)
        .eq('id', photo.id);

      if (photoUpdateError) throw photoUpdateError;

      const studentPhotoStatus =
        status === 'verified'
          ? 'verified'
          : status === 'needs_retake'
            ? 'needs_retake'
            : status === 'rejected'
              ? 'pending'
              : 'received';

      const { error: studentUpdateError } = await supabase
        .from('students')
        .update({ photo_status: studentPhotoStatus })
        .eq('id', photo.student_id);

      if (studentUpdateError) throw studentUpdateError;

      setMessage(`Photo marked as ${formatStatus(status)}.`);
      await loadData();
    } catch (err) {
      setError(err.message || 'Could not update photo verification status.');
    } finally {
      setSaving(false);
    }
  }

  const filteredStudents = students.filter((student) => {
    const latestPhoto = getLatestPhoto(student.id);
    const query = search.toLowerCase();

    const matchesSearch = [
      getStudentName(student),
      student.student_number,
      student.grade_level,
      student.section,
      getOrderLabel(student.order_id),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));

    const matchesStatus =
      statusFilter === 'all' ||
      (latestPhoto?.verification_status || 'no_photo') === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const verifiedCount = photos.filter(
    (photo) => photo.verification_status === 'verified'
  ).length;

  const pendingCount = photos.filter(
    (photo) =>
      !photo.verification_status ||
      photo.verification_status === 'pending'
  ).length;

  const retakeCount = photos.filter(
    (photo) => photo.verification_status === 'needs_retake'
  ).length;

  if (loading) {
    return <div className="photo-page"><p>Loading photo verification...</p></div>;
  }

  return (
    <div className="photo-page">
      <div className="photo-page-header">
        <div>
          <p className="photo-eyebrow">PRODUCTION</p>
          <h1>Photo Verification</h1>
          <p className="photo-subtitle">
            Upload, review, and verify student photos before ID production.
          </p>
        </div>
        <button className="photo-button secondary" onClick={loadData} disabled={saving}>
          Refresh
        </button>
      </div>

      {!isOwner && (
        <div className="photo-alert info">
          You can view photo records, but only the owner can upload or verify photos.
        </div>
      )}

      {error && <div className="photo-alert error">{error}</div>}
      {message && <div className="photo-alert success">{message}</div>}

      <div className="photo-stats">
        <div className="photo-stat-card">
          <span>Total Photos</span>
          <strong>{photos.length}</strong>
        </div>
        <div className="photo-stat-card">
          <span>Pending Review</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="photo-stat-card">
          <span>Verified</span>
          <strong>{verifiedCount}</strong>
        </div>
        <div className="photo-stat-card">
          <span>Needs Retake</span>
          <strong>{retakeCount}</strong>
        </div>
      </div>

      <section className="photo-panel">
        <div className="photo-panel-heading">
          <div>
            <h2>Upload Student Photo</h2>
            <p>Accepted formats: JPG, PNG, and WebP. Maximum size: 5 MB.</p>
          </div>
        </div>

        {isOwner ? (
          <form className="photo-upload-form" onSubmit={handleUpload}>
            <label>
              Student
              <select
                value={selectedStudent}
                onChange={(event) => setSelectedStudent(event.target.value)}
                required
              >
                <option value="">Choose a student</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {getStudentName(student)} ({student.student_number || 'No student number'})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Photo file
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                required
              />
            </label>

            {selectedFile && (
              <p className="photo-file-info">
                Selected: {selectedFile.name} (
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}

            <label className="photo-full-width">
              Notes (optional)
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="Add any details about this photo..."
              />
            </label>

            <div className="photo-full-width">
              <button className="photo-button primary" type="submit" disabled={saving}>
                {saving ? 'Uploading...' : 'Upload Photo'}
              </button>
            </div>
          </form>
        ) : (
          <p className="photo-muted">Upload controls are restricted to the owner.</p>
        )}
      </section>

      <section className="photo-panel">
        <div className="photo-panel-heading">
          <div>
            <h2>Student Photo Records</h2>
            <p>Review the latest photo attached to each student.</p>
          </div>
        </div>

        <div className="photo-filters">
          <input
            type="search"
            placeholder="Search student, number, grade, or order..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="no_photo">No photo</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="needs_retake">Needs retake</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="photo-empty">
            <h3>No student records found</h3>
            <p>Add students in Student Records or change your filters.</p>
          </div>
        ) : (
          <div className="photo-record-grid">
            {filteredStudents.map((student) => {
              const photo = getLatestPhoto(student.id);
              const status = photo?.verification_status || 'no_photo';
              const imageUrl = photo?.storage_path
                ? previewUrls[photo.storage_path]
                : '';

              return (
                <article className="photo-record-card" key={student.id}>
                  <div className="photo-preview">
                    {imageUrl ? (
                      <img src={imageUrl} alt={`Photo of ${getStudentName(student)}`} />
                    ) : (
                      <div className="photo-placeholder">
                        <span>No preview</span>
                      </div>
                    )}
                  </div>

                  <div className="photo-record-body">
                    <div className="photo-record-title">
                      <div>
                        <h3>{getStudentName(student) || 'Unnamed student'}</h3>
                        <p>{student.student_number || 'No student number'}</p>
                      </div>
                      <span className={`photo-status status-${status}`}>
                        {formatStatus(status)}
                      </span>
                    </div>

                    <p className="photo-detail">
                      <strong>Order:</strong> {getOrderLabel(student.order_id)}
                    </p>
                    <p className="photo-detail">
                      <strong>Grade/Section:</strong>{' '}
                      {[student.grade_level, student.section].filter(Boolean).join(' / ') || 'Not provided'}
                    </p>
                    {photo?.original_filename && (
                      <p className="photo-detail photo-filename">
                        <strong>File:</strong> {photo.original_filename}
                      </p>
                    )}
                    {photo?.notes && (
                      <p className="photo-notes">{photo.notes}</p>
                    )}

                    {isOwner && photo && (
                      <div className="photo-actions">
                        <button
                          className="photo-button small success"
                          onClick={() => handleVerification(photo, 'verified')}
                          disabled={saving || status === 'verified'}
                        >
                          Verify
                        </button>
                        <button
                          className="photo-button small warning"
                          onClick={() => handleVerification(photo, 'needs_retake')}
                          disabled={saving || status === 'needs_retake'}
                        >
                          Needs Retake
                        </button>
                        <button
                          className="photo-button small danger"
                          onClick={() => handleVerification(photo, 'rejected')}
                          disabled={saving || status === 'rejected'}
                        >
                          Reject
                        </button>
                      </div>
                    )}

                    {!photo && (
                      <p className="photo-muted">
                        Upload a photo to begin verification.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
