import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { adminAPI } from '../services/api';
import './AdminPortal.css';

const initialRecord = {
  full_name: '',
  grave_reference: '',
  birth_date: '',
  death_date: '',
  is_demo: true,
};

const formatDate = (date) => {
  if (!date) return '—';
  const parsed = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
};

const AdminPortal = () => {
  const { pathname } = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recordForm, setRecordForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const view = pathname.split('/').pop();

  useEffect(() => {
    let active = true;
    const loaders = {
      dashboard: adminAPI.getDashboard,
      records: adminAPI.getRecords,
      reservations: adminAPI.getReservations,
      reports: adminAPI.getReports,
      users: adminAPI.getUsers,
    };
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data: responseData } = await loaders[view]();
        if (active) setData(responseData);
      } catch (loadError) {
        if (active) setError(loadError.response?.data?.message || 'Could not load administrator data.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [view, refreshKey]);

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
        await adminAPI.updateRecord(recordForm.id, payload);
      } else {
        await adminAPI.createRecord(payload);
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

  return (
    <Layout>
      <div className="page-container admin-page">
        {loading && <p className="search-empty">Loading administrator data...</p>}
        {error && <p className="error-msg" role="alert">{error}</p>}
        {!loading && !error && view === 'dashboard' && <Dashboard data={data} />}
        {!loading && !error && view === 'records' && (
          <Records
            records={data}
            recordForm={recordForm}
            setRecordForm={setRecordForm}
            startEditing={startEditing}
            saveRecord={saveRecord}
            saving={saving}
          />
        )}
        {!loading && !error && view === 'reservations' && <Reservations reservations={data} />}
        {!loading && !error && view === 'reports' && <Reports report={data} />}
        {!loading && !error && view === 'users' && <Users users={data} />}
      </div>
    </Layout>
  );
};

const Dashboard = ({ data }) => (
  <>
    <h1 className="page-title">Admin Dashboard</h1>
    <p className="admin-provenance-note">
      Use only cemetery data you are authorized to publish. Placeholder records and unverified locations remain marked Sample / Demo Data.
    </p>
    <div className="admin-stat-grid">
      {[
        ['Memorial Records', data.records, '/admin/records'],
        ['Reservations', data.reservations, '/admin/reservations'],
        ['User Accounts', data.users, '/admin/users'],
        ['Payments to Verify', data.pending_payments, '/payments?tab=review'],
      ].map(([label, value, to]) => (
        <Link className="admin-stat-card card" to={to} key={label}>
          <span>{label}</span><strong>{value}</strong>
        </Link>
      ))}
    </div>
    <div className="admin-panel card">
      <h2>Data provenance</h2>
      <p>{data.demo_records} of {data.records} burial records are currently marked as sample/demo.</p>
      <p>Mark a record as verified only after confirming its source and authorization.</p>
    </div>
  </>
);

const Records = ({ records, recordForm, setRecordForm, startEditing, saveRecord, saving }) => (
  <>
    <div className="admin-heading-row">
      <h1 className="page-title">Memorial Records</h1>
      {!recordForm && <button className="btn btn-primary" type="button" onClick={() => setRecordForm({ ...initialRecord })}>Add Record</button>}
    </div>
    <p className="admin-provenance-note">
      New records are Sample / Demo Data by default. Only remove that label when the record is verified and its publication is authorized.
    </p>
    {recordForm && (
      <form className="admin-form card" onSubmit={saveRecord}>
        <h2>{recordForm.id ? 'Edit record' : 'Add record'}</h2>
        <label>Full name<input maxLength="200" required value={recordForm.full_name} onChange={(event) => setRecordForm({ ...recordForm, full_name: event.target.value })} /></label>
        <label>Grave reference<input maxLength="100" placeholder="Leave blank if unverified" value={recordForm.grave_reference} onChange={(event) => setRecordForm({ ...recordForm, grave_reference: event.target.value })} /></label>
        <label>Date of birth<input type="date" value={recordForm.birth_date} onChange={(event) => setRecordForm({ ...recordForm, birth_date: event.target.value })} /></label>
        <label>Date of death<input type="date" value={recordForm.death_date} onChange={(event) => setRecordForm({ ...recordForm, death_date: event.target.value })} /></label>
        <label className="admin-checkbox-label">
          <input type="checkbox" checked={!recordForm.is_demo} onChange={(event) => setRecordForm({ ...recordForm, is_demo: !event.target.checked })} />
          I confirm this record is verified and authorized for publication
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
          {records.map((record) => (
            <tr key={record.id}>
              <td>MR-{String(record.id).padStart(4, '0')}<br />{record.full_name}</td>
              <td>{record.cemetery_name}</td>
              <td>{record.grave_reference || 'Unassigned'}</td>
              <td>Born: {formatDate(record.birth_date)}<br />Died: {formatDate(record.death_date)}</td>
              <td><span className={`admin-status ${record.is_demo ? 'demo' : 'verified'}`}>{record.is_demo ? 'Sample / Demo Data' : 'Verified'}</span></td>
              <td><button type="button" className="btn btn-outline" onClick={() => startEditing(record)}>Edit</button></td>
            </tr>
          ))}
          {records.length === 0 && <tr><td colSpan="6">No memorial records available.</td></tr>}
        </tbody>
      </table>
    </div>
  </>
);

const Reservations = ({ reservations }) => (
  <>
    <h1 className="page-title">Reservations</h1>
    <div className="admin-table-wrap card">
      <table className="admin-table">
        <thead><tr><th>Visitor</th><th>Memorial</th><th>Visit date</th><th>Payment</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>
          {reservations.map((reservation) => (
            <tr key={reservation.id}>
              <td>{reservation.visitor_name}<br /><small>{reservation.account_email}</small></td>
              <td>{reservation.memorial_name}</td>
              <td>{formatDate(reservation.reservation_date)}</td>
              <td>{reservation.payment_status || 'Not submitted'}</td>
              <td>{reservation.status}</td>
              <td>₱{Number(reservation.total_price).toLocaleString()}</td>
            </tr>
          ))}
          {reservations.length === 0 && <tr><td colSpan="6">No reservations have been submitted.</td></tr>}
        </tbody>
      </table>
    </div>
    <Link className="btn btn-primary" to="/payments?tab=review">Review pending payments</Link>
  </>
);

const Reports = ({ report }) => {
  const maxMonthly = Math.max(1, ...report.monthly_reservations.map((month) => Number(month.total)));
  return (
    <>
      <h1 className="page-title">Reports</h1>
      <p className="admin-provenance-note">Live totals from saved application records; no sample values are added to these reports.</p>
      <div className="admin-stat-grid">
        <div className="admin-stat-card card"><span>Total reservations</span><strong>{report.totals.total_reservations}</strong></div>
        <div className="admin-stat-card card"><span>Confirmed reservations</span><strong>{report.totals.confirmed_reservations}</strong></div>
        <div className="admin-stat-card card"><span>Pending reservations</span><strong>{report.totals.pending_reservations}</strong></div>
        <div className="admin-stat-card card"><span>Confirmed reservation value</span><strong>₱{Number(report.totals.confirmed_value).toLocaleString()}</strong></div>
      </div>
      <section className="admin-panel card">
        <h2>Reservations by month (last 6 months)</h2>
        <div className="admin-bars">
          {report.monthly_reservations.map((month) => (
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
        <ul>{report.reservations_by_status.map((item) => <li key={item.status}>{item.status}: {item.total}</li>)}</ul>
      </section>
    </>
  );
};

const Users = ({ users }) => (
  <>
    <h1 className="page-title">User Management</h1>
    <p className="admin-provenance-note">
      Account details are visible only to administrators. New admin access must be granted through the trusted administrator promotion procedure; this screen does not promote accounts.
    </p>
    <div className="admin-table-wrap card">
      <table className="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Reservations</th><th>Saved memorials</th></tr></thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.name}</td><td>{user.email}</td><td>{user.role}</td>
              <td>{formatDate(user.created_at)}</td><td>{user.reservations}</td><td>{user.saved_memorials}</td>
            </tr>
          ))}
          {users.length === 0 && <tr><td colSpan="6">No user accounts available.</td></tr>}
        </tbody>
      </table>
    </div>
  </>
);

export default AdminPortal;
