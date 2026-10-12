import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { memorialAPI, reservationAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import './ReservationDetail.css';

const ReservationDetail = () => {
  const { id, section, lot } = useParams();
  const navigate = useNavigate();
  const [memorial, setMemorial] = useState(null);
  const [visitorName, setVisitorName] = useState('');
  const [contact, setContact] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const isPlotReservation = Boolean(section && lot);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (id) {
      memorialAPI.getById(id).then(({ data }) => setMemorial(data));
    }
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await reservationAPI.create({
        ...(isPlotReservation
          ? { plot_section: section, plot_number: Number(lot) }
          : { memorial_id: memorial.id }),
        visitor_name: visitorName,
        contact,
        reservation_date: reservationDate,
      });
      setSuccess(true);
      if (isPlotReservation) {
        setTimeout(() => navigate('/reservations'), 1500);
      } else {
        setTimeout(() => navigate(`/payments?reservation=${data.id}`), 1500);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Booking failed.');
    }
  };

  if (!memorial && id) {
    return (
      <Layout>
        <div className="page-container">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-container">
        <h1 className="page-title">Reservations</h1>

        {memorial || isPlotReservation ? (
          <div className="reservation-layout">
            {isPlotReservation ? (
              <div className="reservation-info card reservation-plot-info">
                <div className="reservation-info-body">
                  <span className="badge">Plot request</span>
                  <h2>Section {section.toUpperCase()}, Plot {String(Number(lot)).padStart(2, '0')}</h2>
                  <p>This plot request will be reviewed by cemetery staff. No online payment is required.</p>
                </div>
              </div>
            ) : (
              <div className="reservation-info card">
                <img src={memorial.image_url || 'https://via.placeholder.com/600x320?text=Memorial'} alt={memorial.name} />
                <div className="reservation-info-body">
                  <span className="badge">{memorial.category}</span>
                  <h2>{memorial.name}</h2>
                  <p>{memorial.description}</p>
                  <p className="reservation-price">₱{parseFloat(memorial.price).toLocaleString()}</p>
                </div>
              </div>
            )}

            <form className="reservation-form card" onSubmit={handleSubmit}>
              <h3>{isPlotReservation ? 'Request Plot Reservation' : 'Book Your Visit'}</h3>
              <div className="form-group">
                <label htmlFor="reservation-name">Name</label>
                <input id="reservation-name" type="text" value={visitorName} onChange={(e) => setVisitorName(e.target.value)} required maxLength={100} />
              </div>
              <div className="form-group">
                <label htmlFor="reservation-contact">Contact</label>
                <input id="reservation-contact" type="text" value={contact} onChange={(e) => setContact(e.target.value)} required maxLength={100} />
              </div>
              <div className="form-group">
                <label htmlFor="reservation-date">Reservation Date</label>
                <input id="reservation-date" type="date" min={today} value={reservationDate} onChange={(e) => setReservationDate(e.target.value)} required />
              </div>
              {error && <p className="error-msg">{error}</p>}
              {success && (
                <p className="success-msg">
                  {isPlotReservation
                    ? 'Plot request submitted. Staff will review it; returning to your reservations...'
                    : 'Reservation created! Redirecting to payment...'}
                </p>
              )}
              <button type="submit" className="btn btn-primary full-width-button" disabled={success}>
                {isPlotReservation ? 'Submit Plot Request' : 'Book Now'}
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

  const loadReservations = useCallback(async () => {
    try {
      const { data } = await reservationAPI.getUserReservations();
      setReservations(data);
      setError('');
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not load your reservations.');
    }
  }, []);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  usePolling(loadReservations);

  return (
    <div className="reservations-list">
      {error && <p className="error-msg" role="alert">{error}</p>}
      {!error && reservations.length === 0 ? (
        <p className="empty-state">No reservations yet. Search memorials to book a visit.</p>
      ) : (
        reservations.map((r) => (
          <div key={r.id} className={`reservation-item card ${r.reservation_type === 'plot' ? 'plot-reservation-item' : ''}`}>
            {r.reservation_type !== 'plot' && <img src={r.memorial_image} alt={r.memorial_name} />}
            <div className="reservation-item-body">
              <h3>{r.reservation_type === 'plot'
                ? `${r.cemetery_name || 'Cemetery'} · ${r.plot_section}-${String(r.plot_number).padStart(2, '0')}`
                : r.memorial_name}</h3>
              <p>Visitor: {r.visitor_name}</p>
              <p>Date: {new Date(r.reservation_date).toLocaleDateString()}</p>
              <p>{r.reservation_type === 'plot' ? 'No online payment' : `Total: ₱${parseFloat(r.total_price).toLocaleString()}`}</p>
              <span className={`badge badge-${r.status}`}>{r.status}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default ReservationDetail;
