import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { memorialAPI, reservationAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import { todayInManila } from '../utils/date';
import './ReservationDetail.css';

const formatDate = (date) => {
  if (!date) return '—';
  const parsed = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
};

const formatDateTime = (date) => {
  if (!date) return '—';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

// Reservation status machine (customer view):
// pending = awaiting staff review · approved = awaiting cash payment ·
// confirmed = cash recorded (receipt issued) · completed = burial record published.
const reservationStatusBadge = (reservation) => {
  const status = reservation?.status;
  if (status === 'confirmed' || reservation?.payment_status === 'completed') {
    return { text: 'Paid in Cash · Confirmed', tone: 'badge-completed' };
  }
  if (status === 'pending') return { text: 'Awaiting review', tone: 'badge-pending' };
  if (status === 'approved') return { text: 'Awaiting cash payment', tone: 'badge-pending' };
  if (status === 'completed') return { text: 'Completed', tone: 'badge-completed' };
  if (status === 'rejected') return { text: 'Rejected', tone: 'badge-rejected' };
  if (status === 'cancelled') return { text: 'Cancelled', tone: 'badge-rejected' };
  return { text: status ? String(status) : '—', tone: '' };
};

const ReservationDetail = () => {
  const { id, section, lot } = useParams();
  const navigate = useNavigate();
  const [memorial, setMemorial] = useState(null);
  const [deceasedName, setDeceasedName] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [contact, setContact] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [price, setPrice] = useState('5000');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const isPlotReservation = Boolean(section && lot);
  const [loadError, setLoadError] = useState('');
  const today = todayInManila();

  useEffect(() => {
    if (id) {
      memorialAPI.getById(id)
        .then(({ data }) => {
          setMemorial(data);
          if (data.price) setPrice(String(data.price));
        })
        .catch((err) => setLoadError(err.response?.data?.message || 'This memorial site could not be loaded.'));
    }
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!deceasedName.trim()) {
      setError("Please enter the deceased person's full name.");
      return;
    }
    setError('');
    try {
      const { data } = await reservationAPI.create({
        ...(isPlotReservation
          ? { plot_section: section, plot_number: Number(lot) }
          : { memorial_id: memorial.id }),
        deceased_name: deceasedName.trim(),
        visitor_name: visitorName.trim(),
        contact: contact.trim(),
        reservation_date: reservationDate,
        total_price: Number(price) || 0,
      });
      setSuccess(true);
      setTimeout(() => navigate(`/payments?reservation=${data.id}`), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Plot reservation submission failed.');
    }
  };

  if (!memorial && id) {
    return (
      <Layout>
        <div className="page-container">
          {loadError ? <p className="error-msg" role="alert">{loadError}</p> : 'Loading memorial site...'}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-container">
        <h1 className="page-title">Burial Plot Reservations</h1>

        {memorial || isPlotReservation ? (
          <div className="reservation-layout">
            <div className="reservation-info card reservation-plot-info">
              <div className="reservation-info-body">
                <span className="badge badge-cash">Cash / Walk-in Only</span>
                {isPlotReservation ? (
                  <>
                    <h2>Section {section.toUpperCase()}, Plot {String(Number(lot)).padStart(2, '0')}</h2>
                    <p><strong>Cemetery Spot:</strong> Cogon Cemetery · Section {section.toUpperCase()}</p>
                    <p>
                      This reservation assigns this exact burial spot to the deceased.
                      Family members and walk-in visitors will be able to see this spot on the map and visit in person.
                    </p>
                  </>
                ) : (
                  <>
                    <h2>{memorial.name}</h2>
                    <p>{memorial.description}</p>
                    <p className="reservation-price">₱{parseFloat(price).toLocaleString()}</p>
                  </>
                )}
                <div className="reservation-policy-note">
                  <strong>ℹ️ Payment Notice:</strong> No online payments. Pay the reservation fee in <strong>Cash</strong> at the cemetery office upon walk-in. An official receipt will be issued upon payment.
                </div>
              </div>
            </div>

            <form className="reservation-form card" onSubmit={handleSubmit}>
              <h3>Reserve Plot for the Deceased</h3>

              <div className="form-group">
                <label htmlFor="deceased-name">Deceased Person's Full Name *</label>
                <input
                  id="deceased-name"
                  type="text"
                  placeholder="e.g. Juan Dela Cruz"
                  value={deceasedName}
                  onChange={(e) => setDeceasedName(e.target.value)}
                  required
                  maxLength={150}
                />
                <small className="form-help">The name of the deceased who will be laid to rest in this spot.</small>
              </div>

              <div className="form-group">
                <label htmlFor="reservation-name">Family Representative / Payer (Walk-in Customer) *</label>
                <input
                  id="reservation-name"
                  type="text"
                  placeholder="e.g. Maria Dela Cruz"
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="reservation-contact">Family Contact Number *</label>
                <input
                  id="reservation-contact"
                  type="text"
                  placeholder="e.g. 0912 345 6789"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="reservation-date">Reservation / Burial Date *</label>
                <input
                  id="reservation-date"
                  type="date"
                  min={today}
                  value={reservationDate}
                  onChange={(e) => setReservationDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="reservation-price">Plot Reservation Fee (₱ Cash)</label>
                <input
                  id="reservation-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  readOnly
                  aria-readonly="true"
                />
                <small className="form-help">Fee set by the cemetery office. Payable in Cash at the administration office.</small>
              </div>

              {error && <p className="error-msg">{error}</p>}
              {success && (
                <p className="success-msg">
                  Plot reservation recorded! Redirecting to Payments to record cash receipt...
                </p>
              )}

              <button type="submit" className="btn btn-primary full-width-button" disabled={success}>
                Submit Plot Reservation
              </button>
            </form>
          </div>
        ) : (
          <ReservationsList />
        )}
      </div>
    </Layout>
  );
};

const ReservationsList = () => {
  const [reservations, setReservations] = useState([]);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [message, setMessage] = useState('');

  const loadReservations = useCallback(async () => {
    try {
      const { data } = await reservationAPI.getUserReservations();
      setReservations(data || []);
      setError('');
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not load plot reservations.');
    }
  }, []);

  const cancelEntry = async (reservation) => {
    if (!window.confirm(`Cancel plot reservation for ${reservation.deceased_name || reservation.visitor_name}?`)) return;
    setCancellingId(reservation.id);
    setError('');
    setMessage('');
    try {
      await reservationAPI.cancel(reservation.id);
      setMessage('Plot reservation cancelled.');
      await loadReservations();
    } catch (cancelError) {
      setError(cancelError.response?.data?.message || 'Could not cancel this reservation.');
    } finally {
      setCancellingId(null);
    }
  };

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  usePolling(loadReservations);

  return (
    <div className="reservations-container">
      <div className="admin-heading-row">
        <div>
          <h2>All Cemetery Plot Reservations</h2>
          <p className="admin-provenance-note">
            Reservations hold the cemetery plot spot for the deceased. A submitted request awaits staff review first. Once approved, cash is collected at the office, an official receipt is issued, and the reservation is confirmed so family members and visitors can locate and visit the spot.
          </p>
        </div>
        <Link to="/map" className="btn btn-primary">
          🗺️ Choose Plot on Map
        </Link>
      </div>

      {error && <p className="error-msg" role="alert">{error}</p>}
      {message && <p className="success-msg" role="status">{message}</p>}

      {reservations.length === 0 ? (
        <div className="empty-state card">
          <p>No plot reservations recorded yet.</p>
          <p>Open the cemetery map to view plots and submit a reservation for a deceased loved one.</p>
          <Link to="/map" className="btn btn-primary" style={{ marginTop: 12 }}>
            View Cemetery Plot Map
          </Link>
        </div>
      ) : (
        <div className="reservations-list">
          {reservations.map((r) => {
            const isPlot = r.reservation_type === 'plot' || Boolean(r.plot_section);
            const spotName = isPlot
              ? `Section ${r.plot_section}, Plot ${String(r.plot_number).padStart(2, '0')}`
              : r.memorial_name;
            const isPaid = r.payment_status === 'completed' || r.status === 'confirmed';
            const isPendingReview = r.status === 'pending';
            const isAwaitingMoney = r.status === 'pending' || r.status === 'approved';
            const badge = reservationStatusBadge(r);

            return (
              <div key={r.id} className="reservation-item card plot-reservation-item">
                <div className="reservation-item-body">
                  <div className="reservation-item-top">
                    <span className="record-id">RES-{String(r.id).padStart(4, '0')}</span>
                    <span className={`badge ${badge.tone}`}>
                      {badge.text}
                    </span>
                  </div>

                  <h3>{spotName}</h3>

                  {r.deceased_name && (
                    <p className="deceased-name-row">
                      Deceased: <strong>{r.deceased_name}</strong>
                    </p>
                  )}

                  <p>Family Contact: <strong>{r.visitor_name}</strong> ({r.contact})</p>
                  <p>Submitted: {formatDateTime(r.created_at)}</p>
                  <p>Date: {formatDate(r.reservation_date)}</p>
                  <p>
                    <strong>Payment: </strong>
                    {isPaid ? (
                      <span className="paid-text">₱{parseFloat(r.paid_amount || r.total_price).toLocaleString()} Cash {r.receipt_no ? `(Receipt: ${r.receipt_no})` : ''}</span>
                    ) : isAwaitingMoney ? (
                      <span>₱{parseFloat(r.total_price || 0).toLocaleString()} (Walk-in Cash at Office)</span>
                    ) : (
                      <span>Not collected</span>
                    )}
                  </p>

                  {r.review_note && <p><small>Staff note: {r.review_note}</small></p>}

                  <div className="reservation-item-actions">
                    {r.status === 'approved' && (
                      <Link to={`/payments?reservation=${r.id}`} className="btn btn-primary">
                        💵 Record Cash Payment
                      </Link>
                    )}
                    {isPendingReview && (
                      <p className="reservation-review-waiting">
                        <small>Under review at the cemetery office. Cash is collected after approval.</small>
                      </p>
                    )}
                    {(r.status === 'pending' || r.status === 'approved') && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={cancellingId === r.id}
                        onClick={() => cancelEntry(r)}
                      >
                        {cancellingId === r.id ? 'Cancelling...' : 'Cancel Reservation'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReservationDetail;
