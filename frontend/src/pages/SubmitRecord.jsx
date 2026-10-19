import { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { submissionAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import './ReservationDetail.css';

const emptyForm = {
  full_name: '',
  grave_reference: '',
  birth_date: '',
  death_date: '',
  burial_date: '',
  epitaph: '',
};

const SubmitRecord = () => {
  const [form, setForm] = useState({ ...emptyForm });
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadMine = useCallback(async () => {
    try {
      const { data } = await submissionAPI.mine();
      setSubmissions(data);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not load your submissions.');
    }
  }, []);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  usePolling(loadMine);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      await submissionAPI.create({
        full_name: form.full_name,
        grave_reference: form.grave_reference || null,
        birth_date: form.birth_date || null,
        death_date: form.death_date || null,
        burial_date: form.burial_date || null,
        epitaph: form.epitaph || null,
      });
      setForm({ ...emptyForm });
      setMessage('Memorial information submitted. Staff will review it before publishing.');
      await loadMine();
    } catch (submitError) {
      setError(submitError.response?.data?.message || 'Could not submit memorial information.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="page-container">
        <h1 className="page-title">Submit Memorial Information</h1>
        <p>Share details of a departed loved one. Staff review every submission before it is published as a memorial record.</p>
        {error && <p className="error-msg" role="alert">{error}</p>}
        {message && <p className="success-msg" role="status">{message}</p>}

        <form className="reservation-form card" onSubmit={handleSubmit}>
          <h3>Departed person details</h3>
          <div className="form-group">
            <label htmlFor="submission-name">Full name</label>
            <input id="submission-name" type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required maxLength={200} />
          </div>
          <div className="form-group">
            <label htmlFor="submission-grave">Grave reference (optional)</label>
            <input id="submission-grave" type="text" maxLength={100} placeholder="Section and lot, e.g. A-03 — leave blank if unknown" value={form.grave_reference} onChange={(e) => setForm({ ...form, grave_reference: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="submission-birth">Date of birth (optional)</label>
            <input id="submission-birth" type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="submission-death">Date of death (optional)</label>
            <input id="submission-death" type="date" value={form.death_date} onChange={(e) => setForm({ ...form, death_date: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="submission-burial">Burial / funeral date (optional)</label>
            <input id="submission-burial" type="date" value={form.burial_date} onChange={(e) => setForm({ ...form, burial_date: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="submission-epitaph">Epitaph (optional)</label>
            <textarea id="submission-epitaph" maxLength={500} rows={3} placeholder="A short memorial inscription, up to 500 characters" value={form.epitaph} onChange={(e) => setForm({ ...form, epitaph: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary full-width-button" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit for Review'}
          </button>
        </form>

        <h2 className="section-title">My submissions</h2>
        {submissions.length === 0 ? (
          <p className="empty-state">No submissions yet.</p>
        ) : (
          <div className="reservations-list">
            {submissions.map((s) => (
              <div key={s.id} className="reservation-item card plot-reservation-item">
                <div className="reservation-item-body">
                  <h3>{s.full_name}</h3>
                  <p>Lot: {s.grave_reference || 'Unassigned'}</p>
                  {s.burial_date && <p>Burial: {new Date(s.burial_date).toLocaleDateString()}</p>}
                  {s.epitaph && <p><em>“{s.epitaph}”</em></p>}
                  <span className={`badge badge-${s.status === 'approved' ? 'confirmed' : s.status === 'rejected' ? 'rejected' : 'pending'}`}>{s.status}</span>
                  {s.review_note && <p><small>Staff note: {s.review_note}</small></p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default SubmitRecord;
