import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { adminAPI, reservationAPI, staffAPI, submissionAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import { useAuth } from '../context/AuthContext';
import './AdminPortal.css';

const formatDate = (date) => {
  if (!date) return '—';
  const parsed = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
};

// Display identifier used across the records view, delete confirmations and dialogs.
const mrLabel = (record) => `MR-${String(record.id).padStart(4, '0')}`;

// Reservation status machine: pending = awaiting staff review, approved = awaiting
// cash payment, confirmed = cash recorded (receipt issued), completed = burial
// record published for the plot, rejected/cancelled = terminal.
const RESERVATION_STATUS_META = {
  pending:    { label: 'Awaiting review',       tone: 'pending' },
  approved:   { label: 'Awaiting cash payment', tone: 'pending' },
  confirmed:  { label: 'Paid and confirmed',    tone: 'verified' },
  completed:  { label: 'Completed',             tone: 'verified' },
  rejected:   { label: 'Rejected',              tone: 'rejected' },
  cancelled:  { label: 'Cancelled',             tone: 'rejected' },
};

const reservationStatusMeta = (status) =>
  RESERVATION_STATUS_META[status] || { label: status ? String(status) : 'Unknown', tone: 'pending' };

// Keep focus cycling inside an open dialog (Tab / Shift+Tab wrap at its edges).
const trapTabKey = (event, dialog) => {
  if (event.key !== 'Tab' || !dialog) return;
  const focusable = dialog.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

const AdminPortal = ({ scope = 'admin' }) => {
  const { pathname } = useLocation();
  const api = scope === 'staff' ? staffAPI : adminAPI;
  const loadingLabel = scope === 'staff' ? 'Loading staff workspace data...' : 'Loading administrator data...';
  const loadErrorLabel = scope === 'staff' ? 'Could not load staff workspace data.' : 'Could not load administrator data.';
  const [data, setData] = useState(null);
  const [loadedView, setLoadedView] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recordForm, setRecordForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const view = pathname.split('/').pop();

  const loaders = {
    dashboard: api.getDashboard,
    records: api.getRecords,
    reservations: api.getReservations,
    submissions: submissionAPI.all,
    reports: api.getReports,
    users: api.getUsers,
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      if (typeof loaders[view] !== 'function') {
        if (active) {
          setError(scope === 'staff' ? 'That section is not available in the staff console.' : 'That section is not available.');
          setLoading(false);
        }
        return;
      }
      try {
        const { data: responseData } = await loaders[view]();
        if (active) {
          setData(responseData);
          setLoadedView(view);
        }
      } catch (loadError) {
        if (active) setError(loadError.response?.data?.message || loadErrorLabel);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [view, refreshKey]);

  const pollCurrentView = async () => {
    if (typeof loaders[view] !== 'function') return;
    // Don't clobber an edit in progress or a save error while the form is open.
    if (recordForm) return;
    try {
      const { data: responseData } = await loaders[view]();
      setData(responseData);
      setLoadedView(view);
      setError('');
    } catch (loadError) {
      // Preserve existing data on background poll failure; only show if nothing loaded yet.
      if (data === null) {
        setError(loadError.response?.data?.message || loadErrorLabel);
      }
    }
  };

  usePolling(pollCurrentView);

  const refresh = () => setRefreshKey((current) => current + 1);

  const saveRecord = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...recordForm,
        grave_reference: recordForm.grave_reference.trim(),
        birth_date: recordForm.birth_date || null,
        death_date: recordForm.death_date || null,
      };
      if (!window.confirm('Confirm that this record is verified and you are authorized to publish it as cemetery data.')) {
        setSaving(false);
        return;
      }
      payload.verified_authorized = true;
      await api.updateRecord(recordForm.id, payload);
      setRecordForm(null);
      refresh();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Could not save this record.');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (record) => setRecordForm({
    id: record.id,
    full_name: record.full_name,
    grave_reference: record.grave_reference || '',
    birth_date: record.birth_date ? String(record.birth_date).slice(0, 10) : '',
    death_date: record.death_date ? String(record.death_date).slice(0, 10) : '',
    epitaph: record.epitaph || '',
  });

  const ready = !loading && !error && data !== null && loadedView === view;

  return (
    <Layout>
      <div className="page-container admin-page">
        {error && <p className="error-msg" role="alert">{error}</p>}
        {!error && !ready && <p className="search-empty">{loadingLabel}</p>}
        {ready && view === 'dashboard' && <Dashboard data={data} scope={scope} />}
        {ready && view === 'records' && (
          <>
            <Records
              records={data}
              recordForm={recordForm}
              setRecordForm={setRecordForm}
              startEditing={startEditing}
              saveRecord={saveRecord}
              saving={saving}
              api={api}
              onUpdated={refresh}
            />
            <SitesManager api={api} />
          </>
        )}
        {ready && view === 'reservations' && <Reservations reservations={data} onUpdated={refresh} />}
        {ready && view === 'submissions' && <Submissions submissions={data} onUpdated={refresh} />}
        {ready && view === 'reports' && <Reports report={data} scope={scope} />}
        {ready && view === 'users' && <Users users={data} onCreated={refresh} />}
      </div>
    </Layout>
  );
};

const STAT_CONFIG = {
  'Memorial Records':      { icon: '🪦', accent: '#5a8a6e', bg: 'rgba(90,138,110,0.1)' },
  'Reservations':          { icon: '📋', accent: '#5a7ab5', bg: 'rgba(90,122,181,0.1)' },
  'Pending Reservations':  { icon: '⏳', accent: '#c47f2a', bg: 'rgba(196,127,42,0.1)' },
  'Pending Submissions':   { icon: '📬', accent: '#9a5ab5', bg: 'rgba(154,90,181,0.1)' },
  'Staff Accounts':        { icon: '👥', accent: '#3d8fa0', bg: 'rgba(61,143,160,0.1)' },
  'Cash Payments & Receipts': { icon: '💵', accent: '#b55a5a', bg: 'rgba(181,90,90,0.1)' },
};

const Dashboard = ({ data, scope = 'admin' }) => {
  const base = scope === 'staff' ? '/staff' : '/admin';
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const firstName = (user.name || (scope === 'staff' ? 'Staff' : 'Admin')).split(' ')[0];

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const cards = [
    ['Memorial Records', data?.records ?? 0, `${base}/records`],
    ['Reservations', data?.reservations ?? 0, `${base}/reservations`],
    ['Pending Reservations', data?.pending_reservations ?? 0, `${base}/reservations`],
    ['Pending Submissions', data?.pending_submissions ?? 0, `${base}/submissions`],
    ...(scope === 'staff' ? [] : [['Staff Accounts', data?.users ?? 0, '/admin/users']]),
    ['Cash Payments & Receipts', data?.pending_payments ?? 0, '/payments'],
  ];

  const quickActions = [
    { label: 'Review Submissions', icon: '📬', to: `${base}/submissions`, desc: 'Approve customer-submitted records' },
    { label: 'Edit Memorial Records', icon: '🪦', to: `${base}/records`, desc: 'Update published burial records' },
    { label: 'View Reservations', icon: '📋', to: `${base}/reservations`, desc: 'Manage plot reservations' },
    { label: 'Record Cash Payment', icon: '💵', to: '/payments', desc: 'Issue official receipts' },
    { label: 'Cemetery Map', icon: '🗺️', to: '/map', desc: 'View burial plots & sections' },
    ...(scope !== 'staff' ? [{ label: 'View Reports', icon: '📊', to: `${base}/reports`, desc: 'Collections & analytics' }] : []),
    ...(scope !== 'staff' ? [{ label: 'Manage Staff', icon: '👥', to: '/admin/users', desc: 'Staff accounts & roles' }] : []),
  ];

  return (
  <>
    {/* Welcome Banner */}
    <div className="dashboard-welcome-banner">
      <div className="dashboard-welcome-text">
        <p className="dashboard-greeting">{greeting}, {firstName} 👋</p>
        <h1 className="dashboard-title">{scope === 'staff' ? 'Staff Dashboard' : 'Admin Dashboard'}</h1>
        <p className="dashboard-date">{dateStr}</p>
      </div>
      <div className="dashboard-welcome-badge">
        <span>{scope === 'staff' ? '🧑‍💼 Staff Console' : '⚙️ Admin Console'}</span>
        <p>Cogon Memorial</p>
      </div>
    </div>

    {/* Stat Cards */}
    <div className="dashboard-stat-grid">
      {cards.map(([label, value, to]) => {
        const cfg = STAT_CONFIG[label] || { icon: '📌', accent: '#7a5230', bg: 'rgba(122,82,48,0.1)' };
        return (
          <Link className="dashboard-stat-card" to={to} key={label}>
            <div className="dashboard-stat-icon" style={{ background: cfg.bg, color: cfg.accent }}>
              {cfg.icon}
            </div>
            <div className="dashboard-stat-info">
              <span className="dashboard-stat-label">{label}</span>
              <strong className="dashboard-stat-value" style={{ color: cfg.accent }}>{value}</strong>
            </div>
            <span className="dashboard-stat-arrow">→</span>
          </Link>
        );
      })}
    </div>

    {/* Quick Actions */}
    <div className="dashboard-section-title">Quick Actions</div>
    <div className="dashboard-quick-actions">
      {quickActions.map((action) => (
        <Link key={action.label} to={action.to} className="dashboard-action-card">
          <div className="dashboard-action-icon">{action.icon}</div>
          <div>
            <div className="dashboard-action-label">{action.label}</div>
            <div className="dashboard-action-desc">{action.desc}</div>
          </div>
        </Link>
      ))}
    </div>

    {/* Info footer */}
    <div className="dashboard-info-note">
      <span>🔒</span>
      <p>Every saved record is <strong>live cemetery data</strong>. Save a record only after confirming its source and your authorization to publish it.</p>
    </div>
  </>
  );
};


// Read-only detail dialog for one memorial record. Reuses the shared
// .modal-overlay / .modal primitives (same as the Add User dialog).
const RecordDetailModal = ({ record, onClose, returnFocusRef }) => {
  const dialogRef = useRef(null);

  // Move focus into the dialog on open and restore it to the triggering
  // button on close. The Escape listener only exists while this dialog is
  // open, so the rest of the page's keyboard behaviour is untouched otherwise.
  useEffect(() => {
    if (dialogRef.current) dialogRef.current.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const trigger = returnFocusRef && returnFocusRef.current;
      if (trigger && typeof trigger.focus === 'function') trigger.focus();
    };
  }, [onClose]);

  const location = [record.barangay, record.municipality, record.province].filter(Boolean).join(', ');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal modal-record"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-detail-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => trapTabKey(event, dialogRef.current)}
      >
        <div className="modal-record-header">
          <div>
            <p className="modal-record-id">{mrLabel(record)}</p>
            <h2 id="record-detail-title">{record.full_name || 'Unnamed record'}</h2>
          </div>
          <span className="admin-status verified">Verified</span>
        </div>

        <section className="modal-record-group">
          <h3 className="modal-record-group-title">Burial place</h3>
          <dl className="modal-record-list">
            <div className="modal-record-field">
              <dt>Cemetery</dt>
              <dd>{record.cemetery_name || 'Not recorded'}</dd>
            </div>
            <div className="modal-record-field">
              <dt>Location</dt>
              <dd>{location || 'Not recorded'}</dd>
            </div>
            <div className="modal-record-field">
              <dt>Grave reference</dt>
              <dd>{record.grave_reference || 'Unassigned'}</dd>
            </div>
          </dl>
        </section>

        <section className="modal-record-group">
          <h3 className="modal-record-group-title">Recorded dates</h3>
          <dl className="modal-record-list">
            <div className="modal-record-field">
              <dt>Date of birth</dt>
              <dd>{formatDate(record.birth_date)}</dd>
            </div>
            <div className="modal-record-field">
              <dt>Date of death</dt>
              <dd>{formatDate(record.death_date)}</dd>
            </div>
          </dl>
        </section>

        <div className="modal-record-group">
          <h3 className="modal-record-group-title">Epitaph</h3>
          {record.epitaph ? (
            <blockquote className="modal-record-quote">
              <p>&ldquo;{record.epitaph}&rdquo;</p>
            </blockquote>
          ) : (
            <p className="modal-record-empty">Not recorded</p>
          )}
        </div>

        <p className="admin-provenance-note">
          Every saved record is live cemetery data. Save a record only after confirming its source and your authorization.
        </p>

        <div className="admin-form-actions">
          <button className="btn btn-outline" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};


const Records = ({ records, recordForm, setRecordForm, startEditing, saveRecord, saving, api, onUpdated }) => {
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [viewingRecord, setViewingRecord] = useState(null);
  const viewTriggerRef = useRef(null);

  const openView = (record, event) => {
    viewTriggerRef.current = event.currentTarget;
    setViewingRecord(record);
  };

  const closeView = useCallback(() => setViewingRecord(null), []);

  // Show the row's live data in the dialog: re-resolve against the latest
  // fetched records, and close automatically if the record no longer exists.
  const viewedRecord = viewingRecord ? (records || []).find((item) => item.id === viewingRecord.id) || null : null;

  const deleteEntry = async (record) => {
    if (!window.confirm(`Delete memorial record ${mrLabel(record)} (${record.full_name})? This cannot be undone.`)) return;
    setDeletingId(record.id);
    setDeleteError('');
    try {
      await api.deleteRecord(record.id);
      onUpdated();
    } catch (deleteErr) {
      setDeleteError(deleteErr.response?.data?.message || 'Could not delete this record.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
  <>
    <div className="admin-heading-row">
      <h1 className="page-title">Memorial Records</h1>
    </div>
    <p className="admin-provenance-note">
      Every saved record is live cemetery data. Save a record only after confirming its source and your authorization. New records are added by approving customer memorial submissions.
    </p>
    {deleteError && <p className="error-msg" role="alert">{deleteError}</p>}
    {recordForm && (
      <form className="admin-form card" onSubmit={saveRecord}>
        <h2>Edit record</h2>
        <label>Full name<input maxLength="200" required value={recordForm.full_name} onChange={(event) => setRecordForm({ ...recordForm, full_name: event.target.value })} /></label>
        <label>Grave reference<input maxLength="100" placeholder="Leave blank if unverified" value={recordForm.grave_reference} onChange={(event) => setRecordForm({ ...recordForm, grave_reference: event.target.value })} /></label>
        <label>Date of birth<input type="date" value={recordForm.birth_date} onChange={(event) => setRecordForm({ ...recordForm, birth_date: event.target.value })} /></label>
        <label>Date of death<input type="date" value={recordForm.death_date} onChange={(event) => setRecordForm({ ...recordForm, death_date: event.target.value })} /></label>
        <label>Epitaph (optional)<textarea maxLength={500} rows={2} placeholder="Short memorial inscription" value={recordForm.epitaph} onChange={(event) => setRecordForm({ ...recordForm, epitaph: event.target.value })} /></label>
        <div className="admin-form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Record'}</button>
          <button className="btn btn-outline" type="button" onClick={() => setRecordForm(null)}>Cancel</button>
        </div>
      </form>
    )}
    <div className="admin-table-wrap card">
      <table className="admin-table">
        <thead><tr><th>Record</th><th>Cemetery</th><th>Grave reference</th><th>Dates</th><th>Data status</th><th /></tr></thead>
        <tbody>
          {(records || []).map((record) => (
            <tr key={record.id}>
              <td>{mrLabel(record)}<br />{record.full_name}</td>
              <td>{record.cemetery_name}</td>
              <td>{record.grave_reference || 'Unassigned'}</td>
              <td>Born: {formatDate(record.birth_date)}<br />Died: {formatDate(record.death_date)}</td>
              <td><span className="admin-status verified">Verified</span></td>
              <td>
                <div className="admin-form-actions admin-row-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    aria-label={`View ${record.full_name || 'record'} (${mrLabel(record)})`}
                    onClick={(event) => openView(record, event)}
                  >
                    View
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => startEditing(record)}>Edit</button>
                  <button type="button" className="btn btn-outline" disabled={deletingId === record.id} onClick={() => deleteEntry(record)}>
                    {deletingId === record.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {(records || []).length === 0 && <tr><td colSpan="6">No memorial records available.</td></tr>}
        </tbody>
      </table>
    </div>
    {viewedRecord && (
      <RecordDetailModal record={viewedRecord} onClose={closeView} returnFocusRef={viewTriggerRef} />
    )}
  </>
  );
};

const emptySiteForm = {
  name: '',
  category: '',
  price: '',
  latitude: '',
  longitude: '',
  description: '',
  image_url: '',
};

const SitesManager = ({ api }) => {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadSites = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.getSites();
      setSites(data);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not load memorial sites.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSites(); }, []);

  const saveSite = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        category: form.category || null,
        price: form.price === '' ? 0 : Number(form.price),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        description: form.description || null,
        image_url: form.image_url || null,
      };
      if (form.id) {
        await api.updateSite(form.id, payload);
      } else {
        await api.createSite(payload);
      }
      setForm(null);
      await loadSites();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Could not save this memorial site.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 32 }}>
      <div className="admin-heading-row">
        <h1 className="page-title">Memorial Sites</h1>
        {!form && <button className="btn btn-primary" type="button" onClick={() => setForm({ ...emptySiteForm })}>Add Site</button>}
      </div>
      <p className="admin-provenance-note">Sites are the bookable catalog shown on the map and search. Prices here are what customers pay at checkout.</p>
      {error && <p className="error-msg" role="alert">{error}</p>}
      {form && (
        <form className="admin-form card" onSubmit={saveSite}>
          <h2>{form.id ? 'Edit site' : 'Add site'}</h2>
          <label>Site name<input maxLength="200" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Category<input maxLength="100" placeholder="Garden, Historic, Cemetery, Riverside" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
          <label>Price (₱)<input type="number" min="0" step="0.01" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
          <label>Latitude<input type="number" step="any" required placeholder="10.2600" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></label>
          <label>Longitude<input type="number" step="any" required placeholder="123.9510" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></label>
          <label>Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label>Image URL<input maxLength="500" placeholder="/cemetery-images/heritage-memorial.png" value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} /></label>
          <div className="admin-form-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Site'}</button>
            <button className="btn btn-outline" type="button" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="admin-table-wrap card">
        <table className="admin-table">
          <thead><tr><th>Site</th><th>Category</th><th>Price</th><th>Coordinates</th><th /></tr></thead>
          <tbody>
            {(sites || []).map((site) => (
              <tr key={site.id}>
                <td>{site.name}</td>
                <td>{site.category || '—'}</td>
                <td>₱{Number(site.price ?? 0).toLocaleString()}</td>
                <td>{site.latitude}, {site.longitude}</td>
                <td><button type="button" className="btn btn-outline" onClick={() => setForm({
                  id: site.id,
                  name: site.name || '',
                  category: site.category || '',
                  price: site.price ?? '',
                  latitude: site.latitude ?? '',
                  longitude: site.longitude ?? '',
                  description: site.description || '',
                  image_url: site.image_url || '',
                })}>Edit</button></td>
              </tr>
            ))}
            {!loading && (sites || []).length === 0 && <tr><td colSpan="5">No memorial sites available.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Reservations = ({ reservations, onUpdated }) => {
  const [reviewingId, setReviewingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const reviewPlot = async (reservation, action) => {
    setReviewingId(reservation.id);
    setError('');
    setMessage('');
    try {
      const { data } = await reservationAPI.reviewPlot(reservation.id, action, notes[reservation.id] || undefined);
      setMessage(data.message);
      onUpdated();
    } catch (reviewError) {
      setError(reviewError.response?.data?.message || 'Could not update this plot request.');
    } finally {
      setReviewingId(null);
    }
  };

  const cancelEntry = async (reservation) => {
    if (!window.confirm(`Cancel reservation for ${reservation.visitor_name}?`)) return;
    setCancellingId(reservation.id);
    setError('');
    setMessage('');
    try {
      const { data } = await reservationAPI.cancel(reservation.id);
      setMessage(data.message);
      onUpdated();
    } catch (cancelError) {
      setError(cancelError.response?.data?.message || 'Could not cancel this reservation.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <>
      <h1 className="page-title">Reservations</h1>
      <p className="admin-provenance-note">
        Plot reservations hold burial spots for the deceased. Requests await staff review here; once approved, payment is collected via Walk-in Cash at the cemetery office, issuing an official receipt and confirming the spot on the map.
      </p>
      {error && <p className="error-msg" role="alert">{error}</p>}
      {message && <p className="success-msg" role="status">{message}</p>}
      <div className="admin-table-wrap card">
        <table className="admin-table">
          <thead><tr><th>Family Representative</th><th>Deceased &amp; Spot</th><th>Date</th><th>Payment</th><th>Status</th><th>Total</th><th>Review</th></tr></thead>
          <tbody>
            {(reservations || []).map((reservation) => {
              const isPlot = reservation.reservation_type === 'plot';
              const isPaid = reservation.payment_status === 'completed' || reservation.status === 'confirmed';
              const statusMeta = reservationStatusMeta(reservation.status);
              return (
                <tr key={reservation.id}>
                  <td>{reservation.visitor_name}<br /><small>{reservation.contact || reservation.account_email}</small></td>
                  <td>
                    {reservation.deceased_name && <strong>Deceased: {reservation.deceased_name}<br /></strong>}
                    {isPlot
                      ? `${reservation.cemetery_name || 'Cemetery'} · Section ${reservation.plot_section}, Plot ${String(reservation.plot_number).padStart(2, '0')}`
                      : reservation.memorial_name}
                  </td>
                  <td>{formatDate(reservation.reservation_date)}</td>
                  <td>
                    {isPaid ? (
                      <span className="admin-status verified">Paid Cash</span>
                    ) : reservation.status === 'approved' ? (
                      <>
                        <span className="admin-status pending">Awaiting cash payment</span>
                        <br /><small>Record the walk-in payment in Payments (Cash Records).</small>
                      </>
                    ) : reservation.status === 'pending' ? (
                      <span className="admin-status pending">Not yet due</span>
                    ) : (
                      <span>Not collected</span>
                    )}
                    {reservation.receipt_no && <><br /><small>OR: {reservation.receipt_no}</small></>}
                  </td>
                  <td><span className={`admin-status ${statusMeta.tone}`}>{statusMeta.label}</span></td>
                  <td>₱{Number(reservation.total_price || 0).toLocaleString()}</td>
                  <td>
                    {reservation.status === 'pending' ? (
                      <div className="admin-form-actions">
                        {isPlot && (
                          <>
                            <input
                              type="text"
                              maxLength={500}
                              placeholder="Note for family (optional)"
                              aria-label="Note for family"
                              value={notes[reservation.id] || ''}
                              onChange={(event) => setNotes({ ...notes, [reservation.id]: event.target.value })}
                            />
                            <button type="button" className="btn btn-primary" disabled={reviewingId === reservation.id} onClick={() => reviewPlot(reservation, 'approve')}>
                              {reviewingId === reservation.id ? 'Saving...' : 'Approve'}
                            </button>
                            <button type="button" className="btn btn-outline" disabled={reviewingId === reservation.id} onClick={() => reviewPlot(reservation, 'reject')}>
                              Reject
                            </button>
                          </>
                        )}
                        <button type="button" className="btn btn-outline" disabled={cancellingId === reservation.id} onClick={() => cancelEntry(reservation)}>
                          {cancellingId === reservation.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </div>
                    ) : reservation.status === 'approved' ? (
                      <small>Cash is recorded in <Link to="/payments">Payments (Cash Records)</Link>.</small>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
            {(reservations || []).length === 0 && <tr><td colSpan="7">No reservations have been submitted.</td></tr>}
          </tbody>
        </table>
      </div>
      <Link className="btn btn-primary" to="/payments">💵 Manage Cash Payments &amp; Receipts</Link>
    </>
  );
};

const Submissions = ({ submissions, onUpdated }) => {
  const [reviewingId, setReviewingId] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const review = async (submission, action) => {
    setReviewingId(submission.id);
    setError('');
    setMessage('');
    try {
      const { data } = await submissionAPI.review(submission.id, action, notes[submission.id] || undefined);
      setMessage(data.message);
      onUpdated();
    } catch (reviewError) {
      setError(reviewError.response?.data?.message || 'Could not review this submission.');
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <>
      <h1 className="page-title">Memorial Submissions</h1>
      <p className="admin-provenance-note">Customer-submitted memorial information. Approving publishes it as a memorial record; rejecting sends it back with a note.</p>
      {error && <p className="error-msg" role="alert">{error}</p>}
      {message && <p className="success-msg" role="status">{message}</p>}
      <div className="admin-table-wrap card">
        <table className="admin-table">
          <thead><tr><th>Submitted by</th><th>Departed person</th><th>Dates</th><th>Epitaph</th><th>Status</th><th>Review</th></tr></thead>
          <tbody>
            {(submissions || []).map((submission) => (
              <tr key={submission.id}>
                <td>{submission.submitter_name}<br /><small>{submission.submitter_email}</small></td>
                <td>{submission.full_name}<br /><small>Lot: {submission.grave_reference || 'Unassigned'}</small></td>
                <td>Born: {formatDate(submission.birth_date)}<br />Died: {formatDate(submission.death_date)}</td>
                <td>{submission.epitaph ? <small><em>“{submission.epitaph}”</em></small> : '—'}</td>
                <td>{submission.status}{submission.review_note ? <><br /><small>Note: {submission.review_note}</small></> : null}</td>
                <td>{submission.status === 'pending' ? (
                  <div className="admin-form-actions">
                    <input
                      type="text"
                      maxLength={500}
                      placeholder="Note for customer (optional)"
                      aria-label="Note for customer"
                      value={notes[submission.id] || ''}
                      onChange={(event) => setNotes({ ...notes, [submission.id]: event.target.value })}
                    />
                    <button type="button" className="btn btn-primary" disabled={reviewingId === submission.id} onClick={() => review(submission, 'approve')}>
                      {reviewingId === submission.id ? 'Saving...' : 'Approve & Publish'}
                    </button>
                    <button type="button" className="btn btn-outline" disabled={reviewingId === submission.id} onClick={() => review(submission, 'reject')}>
                      Reject
                    </button>
                  </div>
                ) : '—'}</td>
              </tr>
            ))}
            {(submissions || []).length === 0 && <tr><td colSpan="6">No submissions have been made.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
};

const Reports = ({ report, scope = 'admin' }) => {
  const monthly = report?.monthly_reservations || [];
  const byStatus = report?.reservations_by_status || [];
  const totals = report?.totals || {};
  const maxMonthly = Math.max(1, ...monthly.map((month) => Number(month.total) || 0));
  const api = scope === 'staff' ? staffAPI : adminAPI;
  const isAdmin = scope !== 'staff';
  const [collections, setCollections] = useState(null);
  const [collectionsError, setCollectionsError] = useState('');
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [settlements, setSettlements] = useState([]);
  const [settlementsError, setSettlementsError] = useState('');
  const [settlementForm, setSettlementForm] = useState({ period_from: '', period_to: '', amount: '', to_account: '', transfer_ref: '' });
  const [settlementSaving, setSettlementSaving] = useState(false);
  const [settlementMessage, setSettlementMessage] = useState('');
  const [voidingId, setVoidingId] = useState(null);
  const [receiptQuery, setReceiptQuery] = useState('');
  const [receiptResults, setReceiptResults] = useState([]);
  const [receiptError, setReceiptError] = useState('');
  const [receiptLoading, setReceiptLoading] = useState(false);

  const loadCollections = async (from, to) => {
    setCollectionsLoading(true);
    setCollectionsError('');
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const { data } = await api.getCollections(params);
      setCollections(data);
    } catch (loadError) {
      setCollectionsError(loadError.response?.data?.message || 'Could not load collections.');
    } finally {
      setCollectionsLoading(false);
    }
  };

  const loadSettlements = async () => {
    if (!isAdmin) return;
    setSettlementsError('');
    try {
      const { data } = await adminAPI.getSettlements();
      setSettlements(data);
    } catch (loadError) {
      setSettlementsError(loadError.response?.data?.message || 'Could not load settlement transfers.');
    }
  };

  useEffect(() => {
    loadCollections();
    loadSettlements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVoidSettlement = async (transfer) => {
    if (!window.confirm(`Void settlement transfer #${transfer.id} (${String(transfer.period_from).slice(0, 10)} to ${String(transfer.period_to).slice(0, 10)})? Its payments return to the cash records.`)) return;
    setVoidingId(transfer.id);
    setSettlementsError('');
    setSettlementMessage('');
    try {
      const { data } = await adminAPI.voidSettlement(transfer.id);
      setSettlements((current) => current.filter((item) => item.id !== transfer.id));
      setSettlementMessage(`${data.message} (${data.released_count ?? 0} payment(s) released.)`);
      loadCollections(dateFrom, dateTo);
    } catch (voidError) {
      setSettlementsError(voidError.response?.data?.message || 'Could not void this transfer.');
    } finally {
      setVoidingId(null);
    }
  };

  const handleReceiptSearch = async (event) => {
    event.preventDefault();
    setReceiptLoading(true);
    setReceiptError('');
    try {
      const { data } = await adminAPI.searchReceipts(receiptQuery);
      setReceiptResults(data);
      if (data.length === 0) setReceiptError('No receipts match that search.');
    } catch (searchError) {
      setReceiptError(searchError.response?.data?.message || 'Could not search receipts.');
      setReceiptResults([]);
    } finally {
      setReceiptLoading(false);
    }
  };

  const handleSettlementSubmit = async (event) => {
    event.preventDefault();
    setSettlementSaving(true);
    setSettlementsError('');
    setSettlementMessage('');
    try {
      const { data } = await adminAPI.createSettlement({
        ...settlementForm,
        amount: Number(settlementForm.amount),
      });
      setSettlements((current) => [{
        ...data,
        transferred_by_name: data.transferred_by_name || 'you',
      }, ...current]);
      setSettlementForm({ period_from: '', period_to: '', amount: '', to_account: '', transfer_ref: '' });
      setSettlementMessage(
        `Settlement transfer recorded. ${data.covered_count ?? 0} verified payment(s) (₱${Number(data.covered_total ?? 0).toLocaleString()}) moved from the cash records into this transfer.`
      );
      loadCollections(dateFrom, dateTo);
    } catch (saveError) {
      setSettlementsError(saveError.response?.data?.message || 'Could not record the settlement transfer.');
    } finally {
      setSettlementSaving(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Reports</h1>
      <p className="admin-provenance-note">Live totals from saved application records.</p>
      <div className="admin-stat-grid">
        <div className="admin-stat-card card"><span>Total reservations</span><strong>{totals.total_reservations ?? 0}</strong></div>
        <div className="admin-stat-card card"><span>Confirmed reservations</span><strong>{totals.confirmed_reservations ?? 0}</strong></div>
        <div className="admin-stat-card card"><span>Pending reservations</span><strong>{totals.pending_reservations ?? 0}</strong></div>
        <div className="admin-stat-card card"><span>Confirmed reservation value</span><strong>₱{Number(totals.confirmed_value ?? 0).toLocaleString()}</strong></div>
      </div>
      <section className="admin-panel card">
        <h2>Reservations by month (last 6 months)</h2>
        <div className="admin-bars">
          {monthly.map((month) => (
            <div className="admin-bar-row" key={month.month}>
              <span>{month.month}</span>
              <div><i style={{ width: `${(Number(month.total) / maxMonthly) * 100}%` }} /></div>
              <strong>{month.total}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="admin-panel card">
        <h2>Reservation status</h2>
        <ul>{byStatus.map((item) => <li key={item.status}>{item.status}: {item.total}</li>)}</ul>
      </section>
      <section className="admin-panel card">
        <h2>Cash Records (verified payments)</h2>
        <p className="admin-provenance-note">These totals reflect cash payments recorded and verified by staff in the app.</p>
        <form
          className="admin-form-actions"
          onSubmit={(event) => { event.preventDefault(); loadCollections(dateFrom, dateTo); }}
        >
          <label>From <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>To <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          <button className="btn btn-outline" type="submit" disabled={collectionsLoading}>
            {collectionsLoading ? 'Loading...' : 'Refresh'}
          </button>
        </form>
        {collectionsError && <p className="error-msg" role="alert">{collectionsError}</p>}
        {!collectionsError && (
          <>
            <p><strong>₱{Number(collections?.summary?.total ?? 0).toLocaleString()}</strong> collected
              from {collections?.summary?.count ?? 0} verified payments
              ({String(collections?.from || '').slice(0, 10)} to {String(collections?.to || '').slice(0, 10)}).</p>
            <p><strong>₱{Number(collections?.unremitted?.total ?? 0).toLocaleString()}</strong> from {collections?.unremitted?.count ?? 0} payments
              still in cash records (not yet remitted).</p>
            {(collections?.daily || []).length > 0 && (
              <ul>{collections.daily.map((day) => <li key={day.day}>{String(day.day).slice(0, 10)}: {day.count} payments · ₱{Number(day.total).toLocaleString()}</li>)}</ul>
            )}
            {(collections?.by_verifier || []).length > 0 && (
              <>
                <h3>By verifier</h3>
                <ul>{collections.by_verifier.map((row) => <li key={row.verifier}>{row.verifier}: {row.count} payments · ₱{Number(row.total).toLocaleString()}</li>)}</ul>
              </>
            )}
            {(collections?.payments || []).length > 0 && (
              <>
                <h3>Verified payments in range</h3>
                <div className="admin-table-wrap card">
                  <table className="admin-table">
                    <thead><tr><th>Receipt</th><th>Visitor</th><th>Memorial</th><th>Amount</th><th>Reference</th><th>Verifier</th></tr></thead>
                    <tbody>
                      {collections.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>{payment.receipt_no || '—'}</td>
                          <td>{payment.visitor_name}</td>
                          <td>{payment.memorial_name || '—'}</td>
                          <td>₱{Number(payment.amount).toLocaleString()}</td>
                          <td>{payment.payment_reference}</td>
                          <td>{payment.verifier}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </section>
      {isAdmin && (
        <section className="admin-panel card">
          <h2>Find a receipt</h2>
          <p className="admin-provenance-note">Search by receipt number, cash reference, visitor, or memorial site — for customers asking for reprints.</p>
          <form className="admin-form-actions" onSubmit={handleReceiptSearch}>
            <input
              type="search"
              aria-label="Search receipts"
              placeholder="OR-2026-000001, cash ref, or name..."
              value={receiptQuery}
              onChange={(event) => setReceiptQuery(event.target.value)}
            />
            <button className="btn btn-outline" type="submit" disabled={receiptLoading}>
              {receiptLoading ? 'Searching...' : 'Search'}
            </button>
          </form>
          {receiptError && <p className="error-msg" role="alert">{receiptError}</p>}
          {receiptResults.length > 0 && (
            <ul>{receiptResults.map((receipt) => (
              <li key={receipt.receipt_no}>
                <strong>{receipt.receipt_no}</strong> · {receipt.memorial_name || 'Plot'} · {receipt.visitor_name} ({receipt.account_email}) · ₱{Number(receipt.amount).toLocaleString()} · {receipt.payment_status}
              </li>
            ))}</ul>
          )}
        </section>
      )}
      {isAdmin && (
        <section className="admin-panel card">
          <h2>Settlement transfers (cash → treasury)</h2>
          <p className="admin-provenance-note">Record each transfer of collected cash to the bank or treasury account. Movement happens off-system; this log is the audit trail.</p>
          {settlementMessage && <p className="success-msg" role="status">{settlementMessage}</p>}
          {settlementsError && <p className="error-msg" role="alert">{settlementsError}</p>}
          <form className="admin-form" onSubmit={handleSettlementSubmit}>
            <label>Collection period from<input type="date" required value={settlementForm.period_from} onChange={(event) => setSettlementForm({ ...settlementForm, period_from: event.target.value })} /></label>
            <label>Collection period to<input type="date" required value={settlementForm.period_to} onChange={(event) => setSettlementForm({ ...settlementForm, period_to: event.target.value })} /></label>
            <label>Amount (₱)<input type="number" min="1" step="0.01" required value={settlementForm.amount} onChange={(event) => setSettlementForm({ ...settlementForm, amount: event.target.value })} /></label>
            <label>Destination bank/treasury account<input maxLength="200" required placeholder="e.g. BDO ...1234 — Cemetery Trust" value={settlementForm.to_account} onChange={(event) => setSettlementForm({ ...settlementForm, to_account: event.target.value })} /></label>
            <label>Transfer reference (optional)<input maxLength="64" placeholder="Bank transfer ref" value={settlementForm.transfer_ref} onChange={(event) => setSettlementForm({ ...settlementForm, transfer_ref: event.target.value })} /></label>
            <div className="admin-form-actions">
              <button className="btn btn-primary" type="submit" disabled={settlementSaving}>{settlementSaving ? 'Recording...' : 'Record Transfer'}</button>
            </div>
          </form>
          {(settlements || []).length === 0
            ? <p>No settlement transfers recorded yet.</p>
            : (
              <ul>{settlements.map((transfer) => (
                <li key={transfer.id}>
                  {String(transfer.period_from).slice(0, 10)} to {String(transfer.period_to).slice(0, 10)} · ₱{Number(transfer.amount).toLocaleString()} → {transfer.to_account}
                  {transfer.transfer_ref ? ` · Ref ${transfer.transfer_ref}` : ''} · by {transfer.transferred_by_name || 'staff'}
                  <br /><small>Covers {transfer.covered_count ?? 0} verified payment(s) · ₱{Number(transfer.covered_total ?? 0).toLocaleString()}</small>
                  {' '}<button type="button" className="btn btn-outline" disabled={voidingId === transfer.id} onClick={() => handleVoidSettlement(transfer)}>
                    {voidingId === transfer.id ? 'Voiding...' : 'Void'}
                  </button>
                </li>
              ))}</ul>
            )}
        </section>
      )}
    </>
  );
};

const Users = ({ users, onCreated }) => {
  const { user: currentUser } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await adminAPI.createUser(form);
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'staff' });
      setError('');
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (account, role) => {
    if (role === account.role) return;
    if (!window.confirm(`Change ${account.email} from ${account.role} to ${role}? Their sessions will be signed out.`)) return;
    setUpdatingId(`role-${account.id}`);
    setError('');
    try {
      await adminAPI.updateUserRole(account.id, role);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update role.');
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleActive = async (account) => {
    const action = account.is_active === false ? 'reactivate' : 'deactivate';
    if (!window.confirm(`${action === 'reactivate' ? 'Reactivate' : 'Deactivate'} ${account.email}?${action === 'reactivate' ? '' : ' They will be signed out immediately.'}`)) return;
    setUpdatingId(`status-${account.id}`);
    setError('');
    try {
      await adminAPI.setUserActive(account.id, action === 'reactivate');
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update account status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const removeUser = async (account) => {
    if (!window.confirm(`Permanently delete ${account.email}? Their reservations, payments, and saved memorials will be removed.`)) return;
    setUpdatingId(`delete-${account.id}`);
    setError('');
    try {
      await adminAPI.deleteUser(account.id);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete user.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <>
      <div className="admin-heading-row">
        <h1 className="page-title">User Management</h1>
        <button className="btn btn-primary" type="button" onClick={() => setShowModal(true)}>Add User</button>
      </div>
      <p className="admin-provenance-note">
        Account details are visible only to administrators. Create staff or administrator accounts here.
      </p>
      {error && <p className="error-msg" role="alert">{error}</p>}
      <div className="admin-table-wrap card">
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Reservations</th><th>Saved memorials</th><th /></tr></thead>
          <tbody>
            {(users || []).map((account) => {
              const isSelf = currentUser && Number(account.id) === Number(currentUser.id);
              const busy = updatingId && updatingId.endsWith(`-${account.id}`);
              return (
                <tr key={account.id}>
                  <td>{account.name}</td><td>{account.email}</td>
                  <td>
                    <select
                      aria-label={`Role for ${account.email}`}
                      value={account.role}
                      disabled={isSelf || busy}
                      onChange={(e) => changeRole(account, e.target.value)}
                    >
                      <option value="staff">Staff</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </td>
                  <td><span className={`admin-status ${account.is_active === false ? 'demo' : 'verified'}`}>{account.is_active === false ? 'Inactive' : 'Active'}</span></td>
                  <td>{formatDate(account.created_at)}</td><td>{account.reservations}</td><td>{account.saved_memorials}</td>
                  <td>
                    <div className="admin-form-actions">
                      {!isSelf && (
                        <>
                          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => toggleActive(account)}>
                            {account.is_active === false ? 'Reactivate' : 'Deactivate'}
                          </button>
                          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => removeUser(account)}>Delete</button>
                        </>
                      )}
                      {isSelf && <small>This is you</small>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {(users || []).length === 0 && <tr><td colSpan="8">No user accounts available.</td></tr>}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create New User</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="user-name">Name</label>
                <input id="user-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} />
              </div>
              <div className="form-group">
                <label htmlFor="user-email">Email</label>
                <input id="user-email" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="form-group">
                <label htmlFor="user-password">Password</label>
                <input id="user-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={form.role === 'admin' ? 12 : 8} />
              </div>
              <div className="form-group">
                <label htmlFor="user-role">Role</label>
                <select id="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="staff">Staff</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              {error && <p className="error-msg" role="alert">{error}</p>}
              <div className="admin-form-actions">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
                <button className="btn btn-outline" type="button" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminPortal;
