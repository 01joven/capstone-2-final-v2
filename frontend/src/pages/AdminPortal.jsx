import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { adminAPI, reservationAPI, staffAPI, submissionAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import { useAuth } from '../context/AuthContext';
import './AdminPortal.css';

const initialRecord = {
  full_name: '',
  grave_reference: '',
  birth_date: '',
  death_date: '',
  epitaph: '',
};

const formatDate = (date) => {
  if (!date) return '—';
  const parsed = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
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
      if (recordForm.id) {
        await api.updateRecord(recordForm.id, payload);
      } else {
        await api.createRecord(payload);
      }
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

const Dashboard = ({ data, scope = 'admin' }) => {
  const base = scope === 'staff' ? '/staff' : '/admin';
  const cards = [
    ['Memorial Records', data?.records ?? 0, `${base}/records`],
    ['Reservations', data?.reservations ?? 0, `${base}/reservations`],
    ...(scope === 'staff' ? [] : [['User Accounts', data?.users ?? 0, '/admin/users']]),
    ['Payments to Verify', data?.pending_payments ?? 0, '/payments?tab=review'],
  ];
  return (
  <>
    <h1 className="page-title">{scope === 'staff' ? 'Staff Dashboard' : 'Admin Dashboard'}</h1>
    <p className="admin-provenance-note">
      Use only cemetery data you are authorized to publish. Every saved record is live cemetery data.
    </p>
    <div className="admin-stat-grid">
      {cards.map(([label, value, to]) => (
        <Link className="admin-stat-card card" to={to} key={label}>
          <span>{label}</span><strong>{value}</strong>
        </Link>
      ))}
    </div>
    <div className="admin-panel card">
      <h2>Data provenance</h2>
      <p>{data?.records ?? 0} burial records on file. Every record is live cemetery data.</p>
      <p>Save a record only after confirming its source and your authorization to publish it.</p>
    </div>
  </>
  );
};

const Records = ({ records, recordForm, setRecordForm, startEditing, saveRecord, saving, api, onUpdated }) => {
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const deleteEntry = async (record) => {
    if (!window.confirm(`Delete memorial record MR-${String(record.id).padStart(4, '0')} (${record.full_name})? This cannot be undone.`)) return;
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
      {!recordForm && <button className="btn btn-primary" type="button" onClick={() => setRecordForm({ ...initialRecord })}>Add Record</button>}
    </div>
    <p className="admin-provenance-note">
      Every saved record is live cemetery data. Save a record only after confirming its source and your authorization.
    </p>
    {deleteError && <p className="error-msg" role="alert">{deleteError}</p>}
    {recordForm && (
      <form className="admin-form card" onSubmit={saveRecord}>
        <h2>{recordForm.id ? 'Edit record' : 'Add record'}</h2>
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
              <td>MR-{String(record.id).padStart(4, '0')}<br />{record.full_name}</td>
              <td>{record.cemetery_name}</td>
              <td>{record.grave_reference || 'Unassigned'}</td>
              <td>Born: {formatDate(record.birth_date)}<br />Died: {formatDate(record.death_date)}</td>
              <td><span className="admin-status verified">Verified</span></td>
              <td>
                <div className="admin-form-actions">
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
      <p className="admin-provenance-note">Plot requests hold an available plot until staff approve or reject them. Approved plots become occupied when a verified burial record is entered.</p>
      {error && <p className="error-msg" role="alert">{error}</p>}
      {message && <p className="success-msg" role="status">{message}</p>}
      <div className="admin-table-wrap card">
        <table className="admin-table">
          <thead><tr><th>Visitor</th><th>Reservation</th><th>Date</th><th>Payment</th><th>Status</th><th>Total</th><th>Review</th></tr></thead>
          <tbody>
            {(reservations || []).map((reservation) => {
              const isPlot = reservation.reservation_type === 'plot';
              return (
                <tr key={reservation.id}>
                  <td>{reservation.visitor_name}<br /><small>{reservation.account_email}</small></td>
                  <td>{isPlot
                    ? `${reservation.cemetery_name || 'Cemetery'} · ${reservation.plot_section}-${String(reservation.plot_number).padStart(2, '0')}`
                    : reservation.memorial_name}</td>
                  <td>{formatDate(reservation.reservation_date)}</td>
                  <td>{isPlot ? 'Not required' : reservation.payment_status || 'Not submitted'}</td>
                  <td>{reservation.status}</td>
                  <td>{isPlot ? '—' : `₱${Number(reservation.total_price).toLocaleString()}`}</td>
                  <td>{reservation.status === 'pending' ? (
                    <div className="admin-form-actions">
                      {isPlot && (
                        <>
                          <input
                            type="text"
                            maxLength={500}
                            placeholder="Note for customer (optional)"
                            aria-label="Note for customer"
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
                  ) : '—'}</td>
                </tr>
              );
            })}
            {(reservations || []).length === 0 && <tr><td colSpan="7">No reservations have been submitted.</td></tr>}
          </tbody>
        </table>
      </div>
      <Link className="btn btn-primary" to="/payments?tab=review">Review pending payments</Link>
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
        `Settlement transfer recorded. ${data.covered_count ?? 0} verified payment(s) (₱${Number(data.covered_total ?? 0).toLocaleString()}) moved from the GCash wallet into this transfer.`
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
        <h2>GCash collections (verified payments)</h2>
        <p className="admin-provenance-note">Money lands in the cemetery GCash wallet off-system; these totals reflect payments staff verified in the app.</p>
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
              still held in the GCash wallet (not yet remitted).</p>
            {(collections?.daily || []).length > 0 && (
              <ul>{collections.daily.map((day) => <li key={day.day}>{String(day.day).slice(0, 10)}: {day.count} payments · ₱{Number(day.total).toLocaleString()}</li>)}</ul>
            )}
            {(collections?.by_verifier || []).length > 0 && (
              <>
                <h3>By verifier</h3>
                <ul>{collections.by_verifier.map((row) => <li key={row.verifier}>{row.verifier}: {row.count} payments · ₱{Number(row.total).toLocaleString()}</li>)}</ul>
              </>
            )}
          </>
        )}
      </section>
      {isAdmin && (
        <section className="admin-panel card">
          <h2>Settlement transfers (wallet → treasury)</h2>
          <p className="admin-provenance-note">Record each transfer of collected GCash money to the bank or treasury account. Movement happens off-system; this log is the audit trail.</p>
          {settlementMessage && <p className="success-msg" role="status">{settlementMessage}</p>}
          {settlementsError && <p className="error-msg" role="alert">{settlementsError}</p>}
          <form className="admin-form" onSubmit={handleSettlementSubmit}>
            <label>Collection period from<input type="date" required value={settlementForm.period_from} onChange={(event) => setSettlementForm({ ...settlementForm, period_from: event.target.value })} /></label>
            <label>Collection period to<input type="date" required value={settlementForm.period_to} onChange={(event) => setSettlementForm({ ...settlementForm, period_to: event.target.value })} /></label>
            <label>Amount (₱)<input type="number" min="1" step="0.01" required value={settlementForm.amount} onChange={(event) => setSettlementForm({ ...settlementForm, amount: event.target.value })} /></label>
            <label>Destination bank/treasury account<input maxLength="200" required placeholder="e.g. BDO ...1234 — Cemetery Trust" value={settlementForm.to_account} onChange={(event) => setSettlementForm({ ...settlementForm, to_account: event.target.value })} /></label>
            <label>Transfer reference (optional)<input maxLength="64" placeholder="Bank/GCash transfer ref" value={settlementForm.transfer_ref} onChange={(event) => setSettlementForm({ ...settlementForm, transfer_ref: event.target.value })} /></label>
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
        Account details are visible only to administrators. Create staff or administrator accounts here; public user accounts are created through registration.
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
                      <option value="user">Customer</option>
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
