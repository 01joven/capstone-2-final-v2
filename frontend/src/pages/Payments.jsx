import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { paymentAPI, reservationAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import './Payments.css';

const formatDate = (date) => {
  if (!date) return '—';
  const parsed = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
};

const Payments = () => {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [unpaidReservations, setUnpaidReservations] = useState([]);
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activePayingId, setActivePayingId] = useState(null);
  const [cashAmount, setCashAmount] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState(null);
  const [receiptError, setReceiptError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [paymentResponse, reservationResponse] = await Promise.all([
        paymentAPI.getAll(),
        reservationAPI.getUserReservations(),
      ]);
      setPayments(paymentResponse.data || []);

      const allReservations = reservationResponse.data || [];
      const pending = allReservations.filter(
        (r) => r.status === 'pending' && (!r.payment_status || r.payment_status !== 'completed')
      );
      setUnpaidReservations(pending);

      const requestedReservationId = Number(searchParams.get('reservation'));
      if (requestedReservationId > 0 && !activePayingId) {
        const found = pending.find((r) => r.id === requestedReservationId);
        if (found) {
          setActivePayingId(found.id);
          setCashAmount(String(found.total_price || ''));
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load payment records.');
    }
  }, [searchParams, activePayingId]);

  usePolling(loadData);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setError('');
      try {
        await loadData();
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [loadData]);

  const handleStartPayment = (reservation) => {
    setActivePayingId(reservation.id);
    setCashAmount(String(reservation.total_price || ''));
    setCashNote(`Walk-in cash payment for ${reservation.deceased_name ? `${reservation.deceased_name} plot` : 'burial plot'}`);
    setError('');
    setMessage('');
  };

  const handleCancelPayment = () => {
    setActivePayingId(null);
    setCashAmount('');
    setCashNote('');
  };

  const handleConfirmCashPayment = async (reservationId) => {
    if (!cashAmount || Number(cashAmount) < 0) {
      setError('Enter a valid payment amount.');
      return;
    }
    setError('');
    setMessage('');
    setIsRecording(true);
    try {
      const { data } = await paymentAPI.recordCash({
        reservation_id: reservationId,
        amount: Number(cashAmount),
        note: cashNote || 'Walk-in cash payment received at office',
      });
      setMessage(`Cash payment recorded successfully! Official Receipt: ${data.receipt_no}.`);
      setActivePayingId(null);
      setCashAmount('');
      setCashNote('');

      if (data.receipt_id || data.payment?.id) {
        await handleViewReceipt(data.payment?.id || data.receipt_id);
      }
      await loadData();
    } catch (submitError) {
      setError(submitError.response?.data?.message || 'Could not record cash payment.');
    } finally {
      setIsRecording(false);
    }
  };

  const handleViewReceipt = async (paymentId) => {
    setReceipt(null);
    setReceiptError('');
    setReceiptLoadingId(paymentId);
    try {
      const { data } = await paymentAPI.getReceipt(paymentId);
      setReceipt({ ...data, payment_id: paymentId });
    } catch (receiptLoadError) {
      setReceiptError(receiptLoadError.response?.data?.message || 'Could not load the receipt.');
    } finally {
      setReceiptLoadingId(null);
    }
  };

  return (
    <Layout>
      <div className="page-container">
        <div className="admin-heading-row">
          <h1 className="page-title">Payments</h1>
          <span className="badge badge-cash">Cash / Walk-in Only</span>
        </div>

        <div className="cash-policy-banner card">
          <div className="cash-policy-icon">💵</div>
          <div>
            <h3>Walk-in &amp; Cash Payment Policy</h3>
            <p>
              All plot reservations for the deceased are paid via <strong>Cash (Walk-in)</strong> at the cemetery office.
              Walk-in visitors can locate deceased loved ones on the cemetery map and visit their burial spots anytime without appointment fees.
            </p>
          </div>
        </div>

        {error && <p className="error-msg" role="alert">{error}</p>}
        {message && <p className="success-msg" role="status">{message}</p>}

        {/* Pending Walk-in Reservations Section */}
        <section className="cash-payments-section card" aria-labelledby="pending-cash-title">
          <h2 id="pending-cash-title" className="section-title">
            Pending Plot Reservations (Awaiting Cash Payment)
          </h2>
          <p className="admin-provenance-note">
            When a family member or representative walks in to pay for a plot reservation, verify the deceased person and plot spot, then record the cash payment to issue an official receipt and confirm the reservation.
          </p>

          {unpaidReservations.length === 0 ? (
            <p className="payment-empty">
              {isLoading ? 'Checking pending reservations...' : 'No pending reservations are currently waiting for payment.'}
            </p>
          ) : (
            <div className="unpaid-reservations-list">
              {unpaidReservations.map((reservation) => {
                const isPlot = reservation.reservation_type === 'plot' || Boolean(reservation.plot_section);
                const isPayingThis = activePayingId === reservation.id;

                return (
                  <article key={reservation.id} className={`unpaid-reservation-card ${isPayingThis ? 'active-paying' : ''}`}>
                    <div className="unpaid-info">
                      <div className="unpaid-header">
                        <span className="record-id">RES-{String(reservation.id).padStart(4, '0')}</span>
                        <span className="badge badge-pending">Awaiting Cash</span>
                      </div>
                      <h3>
                        {isPlot
                          ? `Section ${reservation.plot_section}, Plot ${String(reservation.plot_number).padStart(2, '0')}`
                          : reservation.memorial_name}
                      </h3>
                      {reservation.deceased_name && (
                        <p className="deceased-highlight">
                          Deceased: <strong>{reservation.deceased_name}</strong>
                        </p>
                      )}
                      <p>Family / Contact: <strong>{reservation.visitor_name}</strong> ({reservation.contact})</p>
                      <p>Reservation Date: {formatDate(reservation.reservation_date)}</p>
                      <p className="payment-amount">
                        Amount Due: ₱{Number(reservation.total_price || 0).toLocaleString()}
                      </p>
                    </div>

                    <div className="unpaid-actions">
                      {!isPayingThis ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleStartPayment(reservation)}
                        >
                          Record Cash Payment
                        </button>
                      ) : (
                        <div className="record-cash-form">
                          <h4>Record Cash Payment</h4>
                          <label>
                            Cash Amount Received (₱):
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              required
                              value={cashAmount}
                              onChange={(e) => setCashAmount(e.target.value)}
                              placeholder="0.00"
                            />
                          </label>
                          <label>
                            Receipt Note (Optional):
                            <input
                              type="text"
                              maxLength={250}
                              value={cashNote}
                              onChange={(e) => setCashNote(e.target.value)}
                              placeholder="e.g. Paid in cash at cemetery office counter"
                            />
                          </label>
                          <div className="admin-form-actions">
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={isRecording}
                              onClick={() => handleConfirmCashPayment(reservation.id)}
                            >
                              {isRecording ? 'Issuing Receipt...' : 'Confirm Cash & Issue Receipt'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={handleCancelPayment}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Printable Official Receipt Modal / Card */}
        {receiptError && <p className="error-msg" role="alert">{receiptError}</p>}
        {receipt && (
          <section className="payment-checkout card printable-receipt" aria-labelledby="receipt-title" aria-live="polite">
            <div className="receipt-header">
              <h2>Cogon Cemetery Memorial Records System</h2>
              <p>Barangay Cogon, Municipality of Cordova, Cebu</p>
              <h3 id="receipt-title" className="receipt-number">Official Receipt · {receipt.receipt_no}</h3>
            </div>

            <div className="receipt-details-grid">
              <div>
                <span className="receipt-label">Deceased Person</span>
                <strong className="receipt-value">{receipt.deceased_name || 'Burial Plot Reservation'}</strong>
              </div>
              <div>
                <span className="receipt-label">Cemetery Spot</span>
                <strong className="receipt-value">
                  {receipt.plot_section
                    ? `Section ${receipt.plot_section}, Plot ${String(receipt.plot_number).padStart(2, '0')}`
                    : receipt.memorial_name || 'Assigned Spot'}
                </strong>
              </div>
              <div>
                <span className="receipt-label">Family Representative / Payer</span>
                <strong className="receipt-value">{receipt.visitor_name} {receipt.contact ? `(${receipt.contact})` : ''}</strong>
              </div>
              <div>
                <span className="receipt-label">Reservation Date</span>
                <strong className="receipt-value">{formatDate(receipt.reservation_date)}</strong>
              </div>
              <div>
                <span className="receipt-label">Payment Method</span>
                <strong className="receipt-value">{receipt.payment_method || 'Cash (Walk-in)'}</strong>
              </div>
              <div>
                <span className="receipt-label">Amount Paid</span>
                <strong className="receipt-value receipt-amount">₱{Number(receipt.amount || 0).toLocaleString()}</strong>
              </div>
              <div>
                <span className="receipt-label">Received &amp; Verified By</span>
                <strong className="receipt-value">{receipt.verified_by_name || user?.name || 'Staff'}</strong>
              </div>
              <div>
                <span className="receipt-label">Date Issued</span>
                <strong className="receipt-value">{formatDate(receipt.issued_at || new Date())}</strong>
              </div>
            </div>

            <p className="receipt-footer-note">
              This serves as official confirmation of the burial plot reservation. Families and walk-in visitors may locate and visit this section and spot anytime using the interactive cemetery map.
            </p>

            <div className="admin-form-actions no-print">
              <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                🖨️ Print Official Receipt
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setReceipt(null)}>
                Close
              </button>
            </div>
          </section>
        )}

        {/* Payment History / Receipts List */}
        <h2 className="section-title">Payment History &amp; Official Receipts</h2>
        {isLoading ? (
          <p className="payment-empty">Loading payment history...</p>
        ) : payments.length === 0 ? (
          <p className="payment-empty">No payments recorded yet.</p>
        ) : (
          <div className="payments-list">
            {payments.map((payment) => (
              <article key={payment.id} className="payment-item card">
                <div>
                  <div className="payment-heading-row">
                    <h3>{payment.receipt_no || `REC-${payment.id}`}</h3>
                    <span className="badge badge-completed">Paid in Cash</span>
                  </div>
                  <p>
                    <strong>Spot:</strong> {payment.memorial_name || (payment.plot_section ? `Section ${payment.plot_section}, Plot ${payment.plot_number}` : 'Cemetery Plot')}
                  </p>
                  {payment.deceased_name && (
                    <p>
                      <strong>Deceased:</strong> {payment.deceased_name}
                    </p>
                  )}
                  <p>
                    <strong>Payer:</strong> {payment.visitor_name} {payment.contact ? `(${payment.contact})` : ''}
                  </p>
                  <p>
                    <strong>Payment Mode:</strong> {payment.payment_method || 'Cash (Walk-in)'}
                  </p>
                  <p>
                    <strong>Date:</strong> {formatDate(payment.transaction_date)}
                  </p>
                  {payment.verified_by_name && (
                    <p><small>Received by staff: {payment.verified_by_name}</small></p>
                  )}
                  {payment.admin_note && (
                    <p><small>Note: {payment.admin_note}</small></p>
                  )}
                </div>
                <div className="payment-item-right">
                  <p className="payment-amount">₱{parseFloat(payment.amount).toLocaleString()}</p>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={receiptLoadingId === payment.id}
                    onClick={() => handleViewReceipt(payment.id)}
                  >
                    {receiptLoadingId === payment.id ? 'Loading...' : 'View / Print Receipt'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Payments;
