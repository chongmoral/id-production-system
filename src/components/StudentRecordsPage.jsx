
import { useCallback, useEffect, useMemo, useState } from 'react';
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

function splitFullName(value) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const suffixes = ['Jr.', 'Jr', 'Sr.', 'Sr', 'II', 'III', 'IV'];
  let suffix = '';

  if (parts.length > 2 && suffixes.includes(parts[parts.length - 1])) {
    suffix = parts.pop();
  }

  return {
    firstName: parts[0] || '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : '',
    suffix,
  };
}

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

export default function StudentRecordsPage({ userRole, selectedStudentId = null }) {
  const isOwner = userRole === 'owner';

  const [students, setStudents] = useState([]);
  const [orders, setOrders] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [photoUrls, setPhotoUrls] = useState({});
  const [bulkFiles, setBulkFiles] = useState([]);
  const [bulkPreviewUrls, setBulkPreviewUrls] = useState([]);
  const [bulkAssignments, setBulkAssignments] = useState({});
  const [bulkUploading, setBulkUploading] = useState(false);

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
  const [historyStudent, setHistoryStudent] = useState(null);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [verificationPhoto, setVerificationPhoto] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState('pending');
  const [verificationNote, setVerificationNote] = useState('');

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
      const [ordersResult, studentsResult, photosResult] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, order_title, status')
          .order('created_at', { ascending: false }),

        supabase
          .from('students')
          .select('*')
          .order('last_name', { ascending: true }),
        supabase
          .from('student_photos')
          .select('*')
          .order('created_at', { ascending: false }),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (studentsResult.error) throw studentsResult.error;
      if (photosResult.error) throw photosResult.error;

      const photoRows = photosResult.data || [];
      const paths = [...new Set(photoRows.map((photo) => photo.storage_path).filter(Boolean))];
      const urlPairs = await Promise.all(paths.map(async (path) => {
        const { data } = await supabase.storage.from('student-photos').createSignedUrl(path, 3600);
        return [path, data?.signedUrl || ''];
      }));
      setPhotoUrls(Object.fromEntries(urlPairs));
      setPhotos(photoRows);
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

  function handleBulkFileChange(event) {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 5 * 1024 * 1024);
    setBulkPreviewUrls((current) => { current.forEach((url) => URL.revokeObjectURL(url)); return validFiles.map((file) => URL.createObjectURL(file)); });
    setBulkFiles(validFiles);
    setBulkAssignments({});
    setError(files.length !== validFiles.length ? 'Some files were skipped. Use JPG, PNG, or WebP files up to 5 MB each.' : '');
  }

  async function uploadBulkPhotos() {
    if (!isOwner) {
      setError('You do not have permission to upload student photos.');
      return;
    }
    if (bulkFiles.length === 0) {
      setError('Please choose at least one student photo first.');
      return;
    }

    const incomplete = bulkFiles.some((file, index) => {
      const assignment = bulkAssignments[index] || {};
      return (
        !assignment.fullName?.trim() ||
        !assignment.studentNumber?.trim()
      );
    });

    if (incomplete) {
      setError("Enter the student’s full name and student ID for every photo.");
      return;
    }

    setBulkUploading(true);
    setError('');
    setSuccess('');

    let uploadedCount = 0;

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      for (let index = 0; index < bulkFiles.length; index += 1) {
        const file = bulkFiles[index];
        const assignment = bulkAssignments[index];
        const studentNumber = assignment.studentNumber.trim();
        const parsedName = splitFullName(assignment.fullName);
        if (!parsedName.firstName || !parsedName.lastName) {
          throw new Error(`Enter at least a first and last name for Student ID ${studentNumber}.`);
        }

        const { data: matchingStudents, error: lookupError } = await supabase
          .from('students')
          .select('id, order_id, first_name, middle_name, last_name, suffix, student_number')
          .eq('student_number', studentNumber)
          .limit(2);

        if (lookupError) throw lookupError;

        let student;
        let createdStudent = false;

        if (matchingStudents?.length > 1) {
          throw new Error(`Student ID ${studentNumber} appears more than once. Correct the duplicate Student Records before uploading this photo.`);
        }

        if (matchingStudents?.length === 1) {
          student = matchingStudents[0];

          const savedName = [
            student.first_name,
            student.middle_name,
            student.last_name,
            student.suffix,
          ].filter(Boolean).join(' ').trim();

          const enteredName = assignment.fullName.trim().replace(/\s+/g, ' ');

          if (savedName.toLowerCase() !== enteredName.toLowerCase()) {
            throw new Error(`The name entered for ID ${studentNumber} does not match the existing Student Record name (${savedName}).`);
          }
        } else {
          const { data: newStudent, error: createError } = await supabase
            .from('students')
            .insert({
              order_id: null,
              student_number: studentNumber,
              first_name: parsedName.firstName,
              middle_name: parsedName.middleName || null,
              last_name: parsedName.lastName,
              suffix: parsedName.suffix || null,
              photo_status: 'pending',
              record_status: 'active',
            })
            .select('id, order_id, first_name, middle_name, last_name, suffix, student_number')
            .single();

          if (createError) throw createError;
          student = newStudent;
          createdStudent = true;
        }

        const studentId = student.id;
        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${studentId}/${crypto.randomUUID()}.${extension}`;

        try {
          const { error: uploadError } = await supabase.storage
            .from('student-photos')
            .upload(path, file, { contentType: file.type, upsert: false });

          if (uploadError) throw uploadError;

          const { error: insertError } = await supabase.from('student_photos').insert({
            student_id: studentId,
            storage_path: path,
            original_filename: file.name,
            uploaded_by: authData.user?.id || null,
            verification_status: 'pending',
          });

          if (insertError) {
            await supabase.storage.from('student-photos').remove([path]);
            throw insertError;
          }

          const { error: studentError } = await supabase
            .from('students')
            .update({ photo_status: 'received' })
            .eq('id', studentId);

          if (studentError) throw studentError;
          uploadedCount += 1;
        } catch (photoError) {
          if (createdStudent) {
            await supabase.from('students').delete().eq('id', studentId);
          }
          throw photoError;
        }
      }

      setSuccess(`${uploadedCount} student photo(s) uploaded successfully. New Student Records were created when needed. Photos are pending verification.`);
      setBulkFiles([]);
      setBulkPreviewUrls((current) => {
        current.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
      setBulkAssignments({});
      await loadData(true);
    } catch (err) {
      await loadData(true);
      setError(`Bulk upload stopped after ${uploadedCount} photo(s). ${err.message || 'Unable to upload photos.'}`);
    } finally {
      setBulkUploading(false);
    }
  }

  async function updatePhotoVerification(photo, status, note = '') {
    if (!isOwner) return;
    setSaving(true);
    setError('');
    try {
      const { error: photoError } = await supabase
  .from('student_photos')
  .update({
    verification_status: status,
    notes: note.trim() || null,
  })
  .eq('id', photo.id);
      if (photoError) throw photoError;
      const studentStatus = status === 'verified' ? 'verified' : status === 'needs_retake' ? 'needs_retake' : status === 'rejected' ? 'pending' : 'received';
      const { error: studentError } = await supabase.from('students').update({ photo_status: studentStatus }).eq('id', photo.student_id);
      if (studentError) throw studentError;
      setSuccess(`Photo marked as ${formatStatus(status)}.`);
      await loadData(true);
    } catch (err) {
      setError(`Unable to update verification: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  function latestPhotoFor(studentId) {
    return photos.find((photo) => String(photo.student_id) === String(studentId));
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

  const openStudentHistory = useCallback(async (student) => {
    setHistoryStudent(student);
    setHistoryEvents([]);
    setHistoryError('');
    setHistoryLoading(true);
    try {
      const historyResult = await supabase.from('student_id_history').select('*').eq('student_id', String(student.id)).order('event_date', { ascending: true });
      if (!historyResult.error && historyResult.data?.length) {
        setHistoryEvents(historyResult.data.map((event) => ({
          date: event.event_date,
          type: event.event_type,
          title: event.event_title,
          detail: event.event_detail || '',
        })));
        return;
      }
      const [photosResult, reprintsResult, batchesResult, endorsementsResult] = await Promise.all([
        supabase.from('student_photos').select('*').eq('student_id', student.id).order('created_at', { ascending: true }),
        supabase.from('reprints').select('*').eq('student_id', student.id).order('requested_at', { ascending: true }),
        supabase.from('production_batches').select('*').eq('order_id', student.order_id).order('created_at', { ascending: true }),
        supabase.from('endorsements').select('*').eq('order_id', student.order_id).order('endorsement_date', { ascending: true }),
      ]);
      for (const result of [photosResult, reprintsResult, batchesResult, endorsementsResult]) {
        if (result.error) throw result.error;
      }
      const events = [];
      if (student.created_at) events.push({ date: student.created_at, type: 'Student record', title: 'Student record created', detail: `Student ID: ${student.student_number}` });
      for (const photo of photosResult.data || []) {
        events.push({ date: photo.created_at, type: 'Photo', title: `Photo uploaded: ${photo.verification_status || 'pending'}`, detail: photo.original_filename || 'Student ID photo' });
      }
      if (student.photo_status) events.push({ date: student.updated_at || student.created_at, type: 'Quality check', title: `Current quality status: ${student.photo_status}`, detail: 'Current student record quality status. Earlier changes are shown only where individual photo records retained them.' });
      if (student.id_accepted) events.push({ date: student.id_accepted_at || student.updated_at, type: 'Acceptance', title: 'ID marked as accepted', detail: student.id_accepted_at ? 'Acceptance recorded for this student.' : 'ID is currently marked accepted. No acceptance timestamp is available.' });
      for (const batch of batchesResult.data || []) {
        events.push({ date: batch.created_at || batch.start_date, type: 'Production', title: `Production batch ${batch.batch_number}: ${batch.status}`, detail: `${Number(batch.completed_quantity || 0)} of ${Number(batch.planned_quantity || 0)} IDs completed. This is the batch record status, not a per-student print event.` });
      }
      for (const reprint of reprintsResult.data || []) {
        events.push({ date: reprint.requested_at || reprint.created_at, type: 'Reprint', title: `Reprint request: ${reprint.status}`, detail: `${reprint.reason || 'Reason not specified'}${reprint.notes ? ` — ${reprint.notes}` : ''}` });
        if (reprint.updated_at && reprint.updated_at !== reprint.requested_at) events.push({ date: reprint.updated_at, type: 'Reprint update', title: `Latest reprint status: ${reprint.status}`, detail: 'Last updated timestamp for this request.' });
      }
      for (const endorsement of endorsementsResult.data || []) {
        events.push({ date: endorsement.endorsement_date, type: 'Endorsement', title: 'Production Order endorsement / handover', detail: `Reference: ${endorsement.reference_number || '—'} · Received by: ${endorsement.received_by || '—'} · Quantity endorsed: ${endorsement.quantity_endorsed ?? '—'}` });
      }
      events.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
      setHistoryEvents(events);
    } catch (err) {
      setHistoryError(`Unable to load ID history: ${err.message}`);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && selectedStudentId) {
      const student = students.find((item) => String(item.id) === String(selectedStudentId));
      if (student) openStudentHistory(student);
    }
  }, [loading, selectedStudentId, students, openStudentHistory]);

  async function createReprintRequest(student) {
    if (!isOwner) return;
    const confirmed = window.confirm(`Create a reprint request for ${formatName(student)} (${student.student_number})?`);
    if (!confirmed) return;
    try {
      const { data: existing, error: lookupError } = await supabase
        .from('reprints')
        .select('id, status')
        .eq('student_id', student.id)
        .in('status', ['requested', 'approved', 'in_production'])
        .limit(1);
      if (lookupError) throw lookupError;
      if (existing?.length) {
        setError('An active reprint request already exists for this student.');
        return;
      }
      const { error: insertError } = await supabase.from('reprints').insert({
        order_id: student.order_id,
        student_id: student.id,
        reason: 'printing_defect',
        quantity: 1,
        status: 'requested',
        additional_cost: 0,
        notes: `Created from failed quality check (${student.photo_status || 'quality check failed'}).`,
      });
      if (insertError) throw insertError;
      setSuccess(`Reprint request created for ${formatName(student)}.`);
    } catch (err) {
      setError(`Unable to create reprint request. ${getErrorMessage(err)}`);
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

      {isOwner && (
        <div className="student-form-card" style={{ marginBottom: 20 }}>
          <div className="student-form-heading"><div><h3>Bulk Student Photo Upload</h3><p>Select multiple photos and enter each student's full name and ID. Existing IDs will use their Student Record; new IDs will automatically create a Student Record. Production Order is not required for photo uploads.</p></div></div>
          <label className="student-field student-field-full">Choose photos (JPG, PNG, or WebP; up to 5 MB each)
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleBulkFileChange} />
          </label>
          {bulkFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} className="student-form-grid" style={{ alignItems: 'end', marginTop: 10 }}>
              <div className="student-field student-field-full">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
                  <img src={bulkPreviewUrls[index]} alt={`Preview of ${file.name}`} style={{ width: 104, height: 124, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border, #ccc)' }} />
                  <div><strong>{file.name}</strong><p style={{ margin: '5px 0', fontSize: 12, opacity: 0.75 }}>{(file.size / 1024).toFixed(0)} KB</p><span style={{ fontSize: 12 }}>Photo preview</span></div>
                </div>
                <div className="student-form-grid">
                  <label className="student-field student-field-full">Full Name *
                    <input value={bulkAssignments[index]?.fullName || ''} placeholder="Enter student's full name as it should appear on the ID" onChange={(event) => setBulkAssignments((current) => ({ ...current, [index]: { ...current[index], fullName: event.target.value } }))} />
                  </label>
                  <label className="student-field">Student ID *
                    <input value={bulkAssignments[index]?.studentNumber || ''} placeholder="Enter student ID" onChange={(event) => setBulkAssignments((current) => ({ ...current, [index]: { ...current[index], studentNumber: event.target.value } }))} />
                  </label>
                </div>
                {(bulkAssignments[index]?.fullName || bulkAssignments[index]?.studentNumber) && <p>Photo will be labeled: <strong>{bulkAssignments[index]?.fullName || 'Name not entered'}</strong> — ID: <strong>{bulkAssignments[index]?.studentNumber || 'ID not entered'}</strong></p>}
              </div>
            </div>
          ))}
          {bulkFiles.length > 0 && <button type="button" className="student-btn student-btn-primary" onClick={uploadBulkPhotos} disabled={bulkUploading}>{bulkUploading ? 'Uploading photos...' : `Upload ${bulkFiles.length} photo(s)`}</button>}
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
                  <th>Student Photo &amp; Verification</th>
                  <th>Record Status</th>
                  <th>Actions</th>
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
                        {(() => {
                          const photo = latestPhotoFor(student.id);
                          const imageUrl = photo?.storage_path ? photoUrls[photo.storage_path] : '';
                          return <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 220 }}>
                            {imageUrl ? <img src={imageUrl} alt={`Photo of ${formatName(student)}`} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8 }} /> : <span style={{ width: 52, height: 52, display: 'grid', placeItems: 'center', background: 'var(--surface-muted, #eee)', borderRadius: 8, fontSize: 11 }}>No photo</span>}
                            <div><span className={`student-status student-photo-${student.photo_status}`}>{formatStatus(photo?.verification_status || student.photo_status)}</span>
                              {photo && <p className="student-row-note">{photo.original_filename || 'Uploaded photo'}</p>}
                              {photo && isOwner && <select aria-label={`Verify photo for ${formatName(student)}`} value={photo.verification_status || 'pending'} disabled={saving} onChange={(event) => { setVerificationPhoto(photo); setVerificationStatus(event.target.value); setVerificationNote(photo.notes || ''); }} style={{ marginTop: 5 }}>
                                <option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="needs_retake">Needs Retake</option>
                              </select>}
                            </div>
                          </div>;
                        })()}
                      </td>

                      <td>
                        <span
                          className={`student-status student-record-${student.record_status}`}
                        >
                          {formatStatus(student.record_status)}
                        </span>
                      </td>

                      <td>
                        <div className="student-row-actions">
                          <button type="button" className="student-action-btn" onClick={() => openStudentHistory(student)}>ID History</button>
                          {isOwner && <>
                            <button
                              type="button"
                              className="student-action-btn"
                              onClick={() => openEditForm(student)}
                            >
                              Edit
                            </button>

                            {(student.photo_status === 'needs_retake' || latestPhotoFor(student.id)?.verification_status === 'needs_retake') && (
                              <button type="button" className="student-action-btn" onClick={() => createReprintRequest(student)}>
                                Create Reprint Request
                              </button>
                            )}
                            <button
                              type="button"
                              className="student-action-btn student-action-danger"
                              onClick={() => handleDelete(student)}
                            >
                              Delete
                            </button>
                          </>}
                        </div>
                      </td>
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

      {verificationPhoto && (
        <div role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !saving) setVerificationPhoto(null); }} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.48)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby="photo-verification-title" style={{ width: 'min(480px, 100%)', background: 'var(--surface, #fff)', color: 'var(--text, #222)', borderRadius: 14, padding: 22, boxShadow: '0 18px 60px rgba(0,0,0,.25)' }}>
            <h3 id="photo-verification-title" style={{ marginTop: 0 }}>Confirm Photo Verification</h3>
            <p>Change {verificationPhoto.original_filename || 'this student photo'} to <strong>{formatStatus(verificationStatus)}</strong>?</p>
            <label htmlFor="verification-note" style={{ display: 'block', marginBottom: 6 }}>Verification note (optional)</label>
            <textarea id="verification-note" value={verificationNote} onChange={(event) => setVerificationNote(event.target.value)} rows={3} style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid var(--border, #ccc)', borderRadius: 8, font: 'inherit' }} placeholder="Add a note if needed" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" className="student-btn student-btn-secondary" disabled={saving} onClick={() => setVerificationPhoto(null)}>Cancel</button>
              <button type="button" className="student-btn student-btn-primary" disabled={saving} onClick={async () => { const photo = verificationPhoto; const status = verificationStatus; const note = verificationNote; setVerificationPhoto(null); await updatePhotoVerification(photo, status, note); }}>{saving ? 'Saving...' : 'Confirm'}</button>
            </div>
          </section>
        </div>
      )}

      {historyStudent && (
        <div role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setHistoryStudent(null); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.48)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby="student-history-title" style={{ width: 'min(760px, 100%)', maxHeight: '85vh', overflow: 'auto', background: 'var(--surface, #fff)', color: 'var(--text, #222)', borderRadius: 14, padding: 22, boxShadow: '0 18px 60px rgba(0,0,0,.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div><h3 id="student-history-title" style={{ margin: 0 }}>Student ID History</h3><p style={{ margin: '6px 0 0' }}>{formatName(historyStudent)} · {historyStudent.student_number}</p></div>
              <button type="button" className="student-btn student-btn-secondary" onClick={() => setHistoryStudent(null)}>Close</button>
            </div>
            <p style={{ margin: '12px 0', fontSize: 13, opacity: .75 }}>This timeline includes individual student activity and order-level production and handover events. Run the included student_id_history_audit.sql migration to enable the full audit trail for future status changes.</p>
            {historyError && <div className="student-alert student-alert-error">{historyError}</div>}
            {historyLoading ? <p>Loading ID history...</p> : historyEvents.length === 0 ? <p>No recorded ID activity was found for this student yet.</p> : <ol style={{ paddingLeft: 22, marginBottom: 0 }}>{historyEvents.map((event, index) => <li key={`${event.type}-${index}`} style={{ padding: '0 0 16px 6px' }}><strong>{event.title}</strong><div style={{ fontSize: 12, opacity: .7 }}>{event.date ? new Date(event.date).toLocaleString('en-PH') : 'Date not recorded'} · {event.type}</div><div style={{ marginTop: 4 }}>{event.detail}</div></li>)}</ol>}
          </section>
        </div>
      )}
    </section>
  );
}
