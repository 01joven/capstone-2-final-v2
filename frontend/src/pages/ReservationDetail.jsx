import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { memorialAPI, reservationAPI } from '../services/api';
import './ReservationDetail.css';

const ReservationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [memorial, setMemorial] = useState(null);
  const [visitorName, setVisitorName] = useState('');
  const [contact, setContact] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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
        memorial_id: memorial.id,
        visitor_name: visitorName,
        contact,
        reservation_date: reservationDate,
      });
      setSuccess(true);
      setTimeout(() => navigate(`/payments?reservation=${data.id}`), 1500);
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

        {memorial ? (
          <div className="reservation-layout">
            <div className="reservation-info card">
              <img src={memorial.image_url || 'https://via.placeholder.com/600x320?text=Memorial'} alt={memorial.name} />
              <div className="reservation-info-body">
                <span className="badge">{memorial.category}</span>
                <h2>{memorial.name}</h2>
                <p>{memorial.description}</p>
                <p className="reservation-price">₱{parseFloat(memorial.price).toLocaleString()}</p>
              </div>
            </div>

            <form className="reservation-form card" onSubmit={handleSubmit}>
              <h3>Book Your Visit</h3>
              <div className="form-group">
                <label>Name</label>
                <input type="text" value={visitorName} onChange={(e) => setVisitorName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Contact</label>
                <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Reservation Date</label>
                <input type="date" value={reservationDate} onChange={(e) => setReservationDate(e.target.value)} required />
              </div>
              {error && <p className="error-msg">{error}</p>}
              {success && <p className="success-msg">Reservation created! Redirecting to payment...</p>}
              <button type="submit" className="btn btn-primary full-width-button">Book Now</button>
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

  useEffect(() => {
    reservationAPI.getUserReservations().then(({ data }) => setReservations(data));
  }, []);

  return (
    <div className="reservations-list">
      {reservations.length === 0 ? (
        <p className="empty-state">No reservations yet. Search memorials to book a visit.</p>
      ) : (
        reservations.map((r) => (
          <div key={r.id} className="reservation-item card">
            <img src={r.memorial_image} alt={r.memorial_name} />
            <div className="reservation-item-body">
              <h3>{r.memorial_name}</h3>
              <p>Visitor: {r.visitor_name}</p>
              <p>Date: {new Date(r.reservation_date).toLocaleDateString()}</p>
              <p>Total: ₱{parseFloat(r.total_price).toLocaleString()}</p>
              <span className={`badge badge-${r.status}`}>{r.status}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default ReservationDetail;
