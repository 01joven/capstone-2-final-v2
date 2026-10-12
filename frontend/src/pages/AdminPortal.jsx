import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { adminAPI, reservationAPI, staffAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import './AdminPortal.css';

const initialRecord = {
  full_name: '',
  grave_reference: '',
  birth_date: '',
  death_date: '',
  is_demo: false,
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
    try {
      const { data: responseData } = await loaders[view]();
      setData(responseData);
      setLoadedView(view);
      setError('');
    } catch (loadError) {
      setError(loadError.response?.data?.message || loadErrorLabel);
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
      if (!payload.is_demo && !window.confirm('Confirm that this record is verified and you are authorized to publish it as real cemetery data.')) {
        setSaving(false);
        return;
      }
      if (!payload.is_demo) payload.verified_authorized = true;
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
    is_demo: record.is_demo,
  });

  const ready = !loading && !error && data !== null && loadedView === view;

  return (
    <Layout>
      <div className="page-container admin-page">
        {error && <p className="error-msg" role="alert">{error}</p>}
        {!error && !ready && <p className="search-empty">{loadingLabel}</p>}
        {ready && view === 'dashboard' && <Dashboard data={data} scope={scope} />}
        {ready && view === 'records' && (
          <Records
            records={data}
            recordForm={recordForm}
            setRecordForm={setRecordForm}
            startEditing={startEditing}
            saveRecord={saveRecord}
            saving={saving}
          />
        )}
        {ready && view === 'reservations' && <Reservations reservations={data} onUpdated={refresh} />}
        {ready && view === 'reports' && <Reports report={data} />}
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
      Use only cemetery data you are authorized to publish. Records are saved as real data by default; mark an entry as sample only for test data.
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
      <p>{data?.demo_records ?? 0} of {data?.records ?? 0} burial records are currently marked as sample data.</p>
      <p>Mark a record as verified only after confirming its source and authorization.</p>
    </div>
  </>
  );
};

const Records = ({ records, recordForm, setRecordForm, startEditing, saveRecord, saving }) => (
  <>
    <div className="admin-heading-row">
      <h1 className="page-title">Memorial Records</h1>
      {!recordForm && <button className="btn btn-primary" type="button" onClick={() => setRecordForm({ ...initialRecord })}>Add Record</button>}
    </div>
    <p className="admin-provenance-note">
      Records are saved as real cemetery data by default. Tick the sample box only for test entries; never publish unverified sample data as real.
    </p>
    {recordForm && (
      <form className="admin-form card" onSubmit={saveRecord}>
        <h2>{recordForm.id ? 'Edit record' : 'Add record'}</h2>
        <label>Full name<input maxLength="200" required value={recordForm.full_name} onChange={(event) => setRecordForm({ ...recordForm, full_name: event.target.value })} /></label>
        <label>Grave reference<input maxLength="100" placeholder="Leave blank if unverified" value={recordForm.grave_reference} onChange={(event) => setRecordForm({ ...recordForm, grave_reference: event.target.value })} /></label>
        <label>Date of birth<input type="date" value={recordForm.birth_date} onChange={(event) => setRecordForm({ ...recordForm, birth_date: event.target.value })} /></label>
        <label>Date of death<input type="date" value={recordForm.death_date} onChange={(event) => setRecordForm({ ...recordForm, death_date: event.target.value })} /></label>
        <label className="admin-checkbox-label">
          <input type="checkbox" checked={recordForm.is_demo} onChange={(event) => setRecordForm({ ...recordForm, is_demo: event.target.checked })} />
          Save as sample/test data (not a real published record)
        </label>
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
              <td><span className={`admin-status ${record.is_demo ? 'demo' : 'verified'}`}>{record.is_demo ? 'Sample / Demo Data' : 'Verified'}</span></td>
              <td><button type="button" className="btn btn-outline" onClick={() => startEditing(record)}>Edit</button></td>
            </tr>
          ))}
          {(records || []).length === 0 && <tr><td colSpan="6">No memorial records available.</td></tr>}
        </tbody>
      </table>
    </div>
  </>
);

const Reservations = ({ reservations, onUpdated }) => {
  const [reviewingId, setReviewingId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const reviewPlot = async (reservation, action) => {
    setReviewingId(reservation.id);
    setError('');
    setMessage('');
    try {
      const { data } = await reservationAPI.reviewPlot(reservation.id, action);
      setMessage(data.message);
      onUpdated();
    } catch (reviewError) {
      setError(reviewError.response?.data?.message || 'Could not update this plot request.');
    } finally {
      setReviewingId(null);
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
                  <td>{isPlot && reservation.status === 'pending' ? (
                    <div className="admin-form-actions">
                      <button type="button" className="btn btn-primary" disabled={reviewingId === reservation.id} onClick={() => reviewPlot(reservation, 'approve')}>
                        {reviewingId === reservation.id ? 'Saving...' : 'Approve'}
                      </button>
                      <button type="button" className="btn btn-outline" disabled={reviewingId === reservation.id} onClick={() => reviewPlot(reservation, 'reject')}>
                        Reject
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

const Reports = ({ report }) => {
  const monthly = report?.monthly_reservations || [];
  const byStatus = report?.reservations_by_status || [];
  const totals = report?.totals || {};
  const maxMonthly = Math.max(1, ...monthly.map((month) => Number(month.total) || 0));
  return (
    <>
      <h1 className="page-title">Reports</h1>
      <p className="admin-provenance-note">Live totals from saved application records; no sample values are added to these reports.</p>
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
    </>
  );
};

const Users = ({ users, onCreated }) => {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [saving, setSaving] = useState(false);
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

  return (
    <>
      <div className="admin-heading-row">
        <h1 className="page-title">User Management</h1>
        <button className="btn btn-primary" type="button" onClick={() => setShowModal(true)}>Add User</button>
      </div>
      <p className="admin-provenance-note">
        Account details are visible only to administrators. Create staff or administrator accounts here; public user accounts are created through registration.
      </p>
      <div className="admin-table-wrap card">
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Reservations</th><th>Saved memorials</th></tr></thead>
          <tbody>
            {(users || []).map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td><td>{user.email}</td><td>{user.role}</td>
                <td>{formatDate(user.created_at)}</td><td>{user.reservations}</td><td>{user.saved_memorials}</td>
              </tr>
            ))}
            {(users || []).length === 0 && <tr><td colSpan="6">No user accounts available.</td></tr>}
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
                <input id="user-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
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
