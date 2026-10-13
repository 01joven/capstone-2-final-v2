import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { paymentAPI, reservationAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import './Payments.css';

const formatDate = (date) => new Date(date).toLocaleDateString();

const Payments = () => {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [pendingReservation, setPendingReservation] = useState(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [pendingVerifications, setPendingVerifications] = useState([]);
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [adminError, setAdminError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewingPaymentId, setReviewingPaymentId] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState(null);
  const [receiptError, setReceiptError] = useState('');

  const loadPayments = useCallback(async () => {
    const [paymentResponse, reservationResponse] = await Promise.all([
      paymentAPI.getAll(),
      reservationAPI.getUserReservations(),
    ]);
    setPayments(paymentResponse.data);

    const reservationId = Number(searchParams.get('reservation'));
    const foundReservation = reservationId > 0
      ? reservationResponse.data.find((reservation) => reservation.id === reservationId)
      : null;
    setPendingReservation(foundReservation || null);
  }, [searchParams]);

  const canReviewPayments = user?.is_admin || user?.is_staff;

  const loadPendingVerifications = useCallback(async () => {
    if (!canReviewPayments) return;
    setAdminError('');
    try {
      const { data } = await paymentAPI.getPendingVerifications();
      setPendingVerifications(data);
    } catch (loadError) {
      setAdminError(loadError.response?.data?.message || 'Could not load payments awaiting verification.');
    }
  }, [canReviewPayments]);

  const refreshPaymentData = useCallback(async () => {
    try {
      await Promise.all([loadPayments(), loadPendingVerifications()]);
    } catch (refreshError) {
      setError(refreshError.response?.data?.message || 'Could not refresh payment status.');
    }
  }, [loadPayments, loadPendingVerifications]);

  usePolling(refreshPaymentData);

  useEffect(() => {
    const loadPage = async () => {
      setIsLoading(true);
      setError('');
      try {
        await loadPayments();
        await loadPendingVerifications();
      } catch (loadError) {
        setError(loadError.response?.data?.message || 'Could not load payment history.');
      } finally {
        setIsLoading(false);
      }
    };

    loadPage();
  }, [loadPayments, loadPendingVerifications]);

  const handleSubmitPayment = async (event) => {
    event.preventDefault();
    if (!pendingReservation) return;
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      await paymentAPI.create(pendingReservation.id, paymentReference);
      setPendingReservation({ ...pendingReservation, payment_status: 'pending_verification' });
      setPaymentReference('');
      setMessage('Payment reference submitted. Your reservation will be confirmed after an administrator verifies the GCash payment.');
      await loadPayments();
    } catch (submitError) {
      setError(submitError.response?.data?.message || 'Could not submit the payment reference. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReview = async (paymentId, action) => {
    setAdminError('');
    setMessage('');
    setReviewingPaymentId(paymentId);
    try {
      const { data } = await paymentAPI.verify(paymentId, action, reviewNote || undefined);
      setMessage(data.receipt_no ? `${data.message} Receipt: ${data.receipt_no}.` : data.message);
      setReviewNote('');
      await Promise.all([loadPayments(), loadPendingVerifications()]);
    } catch (reviewError) {
      setAdminError(reviewError.response?.data?.message || 'Could not update this payment.');
    } finally {
      setReviewingPaymentId(null);
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

  const canSubmitReference = pendingReservation &&
    (!pendingReservation.payment_status || pendingReservation.payment_status === 'rejected');

  return (
    <Layout>
      <div className="page-container">
        <h1 className="page-title">Payments</h1>

        {error && <p className="error-msg" role="alert">{error}</p>}
        {message && <p className="success-msg" role="status">{message}</p>}

        {pendingReservation && (
          <section className="payment-checkout card" aria-labelledby="checkout-title">
            <h2 id="checkout-title">GCash Reservation Payment</h2>
            <p>Memorial: <strong>{pendingReservation.memorial_name}</strong></p>
            <p>Reservation ID: <strong>RES-{String(pendingReservation.id).padStart(4, '0')}</strong></p>
            <p>Date: {formatDate(pendingReservation.reservation_date)}</p>
            <p className="payment-amount">
              Amount to pay: ₱{parseFloat(pendingReservation.total_price).toLocaleString()}
            </p>

            {pendingReservation.payment_status === 'pending_verification' ? (
              <div className="payment-waiting" role="status">
                <strong>Waiting for payment verification</strong>
                <p>Your reservation is still pending. An administrator will confirm it after checking the GCash transaction.</p>
              </div>
            ) : pendingReservation.payment_status === 'completed' ? (
              <div className="payment-verified" role="status">
                <strong>Payment verified — reservation confirmed</strong>
              </div>
            ) : (
              <>
                {pendingReservation.payment_status === 'rejected' && (
                  <p className="error-msg">The previous payment reference could not be verified. Check the reference and submit it again.</p>
                )}
                <div className="gcash-instructions">
                  <h3>Pay with GCash</h3>
                  <ol>
                    <li>Open and log in to the GCash app on your phone.</li>
                    <li>Choose Scan QR and scan this InstaPay QR code.</li>
                    <li>Enter the exact amount shown above and complete the payment.</li>
                    <li>Copy the transaction reference from your GCash receipt.</li>
                  </ol>
                  <img
                    className="gcash-qr"
                    src="/gcash-qr.png"
                    alt="GCash and InstaPay payment QR code"
                  />
                  <p className="qr-payment-note">
                    This is a static InstaPay QR, not a live GCash checkout. The app cannot detect a scan or payment automatically.
                  </p>
                </div>
                {canSubmitReference && (
                  <form className="payment-reference-form" onSubmit={handleSubmitPayment}>
                    <label htmlFor="gcash-reference">GCash transaction reference number</label>
                    <input
                      id="gcash-reference"
                      type="text"
                      autoComplete="off"
                      minLength={6}
                      maxLength={30}
                      pattern="[A-Za-z0-9-]{6,30}"
                      title="Use 6 to 30 letters, numbers, or hyphens."
                      placeholder="Enter the reference from your GCash receipt"
                      value={paymentReference}
                      onChange={(event) => setPaymentReference(event.target.value)}
                      required
                    />
                    <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Submitting...' : 'Submit for Verification'}
                    </button>
                    <p>Do not submit until the transfer is complete. The reservation stays pending until a staff member verifies it.</p>
                  </form>
                )}
              </>
            )}
          </section>
        )}

        {canReviewPayments && (
          <section className="admin-payment-review" aria-labelledby="payment-review-title">
            <h2 id="payment-review-title" className="section-title">Payment Verification Queue</h2>
            {adminError && <p className="error-msg" role="alert">{adminError}</p>}
            <div className="payment-reference-form">
              <label htmlFor="review-note">Note for customer (optional, sent on approve/reject)</label>
              <input
                id="review-note"
                type="text"
                maxLength={500}
                placeholder="e.g. Reference confirmed in GCash history"
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
              />
            </div>
            {pendingVerifications.length === 0 ? (
              <p className="payment-empty">{isLoading ? 'Loading verification queue...' : 'No payments are waiting for verification.'}</p>
            ) : (
              <div className="payments-list">
                {pendingVerifications.map((payment) => (
                  <article className="payment-review-item card" key={payment.payment_id}>
                    <div>
                      <h3>{payment.memorial_name}</h3>
                      <p>Visitor: {payment.visitor_name} · Account: {payment.account_email}</p>
                      <p>Reservation: RES-{String(payment.reservation_id).padStart(4, '0')} · {formatDate(payment.reservation_date)}</p>
                      <p>GCash reference: <strong>{payment.payment_reference}</strong></p>
                      <p>Submitted: {formatDate(payment.transaction_date)}</p>
                    </div>
                    <div className="payment-review-actions">
                      <strong>₱{parseFloat(payment.amount).toLocaleString()}</strong>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={reviewingPaymentId === payment.payment_id}
                        onClick={() => handleReview(payment.payment_id, 'approve')}
                      >
                        Approve &amp; Confirm
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={reviewingPaymentId === payment.payment_id}
                        onClick={() => handleReview(payment.payment_id, 'reject')}
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <h2 className="section-title">Payment History</h2>
        {receiptError && <p className="error-msg" role="alert">{receiptError}</p>}
        {receipt && (
          <section className="payment-checkout card" aria-labelledby="receipt-title" aria-live="polite">
            <h2 id="receipt-title">Official Receipt · {receipt.receipt_no}</h2>
            <p>Memorial: <strong>{receipt.memorial_name || '—'}</strong></p>
            <p>Visitor: <strong>{receipt.visitor_name}</strong> · Account: {receipt.account_email}</p>
            <p>Reservation: <strong>RES-{String(receipt.reservation_id).padStart(4, '0')}</strong> · Date: {formatDate(receipt.reservation_date)}</p>
            <p>GCash reference: <strong>{receipt.payment_reference}</strong></p>
            <p className="payment-amount">Amount paid: ₱{Number(receipt.amount || 0).toLocaleString()}</p>
            <p>Verified by {receipt.verified_by_name || 'staff'} · {formatDate(receipt.verified_at)} · Issued {formatDate(receipt.issued_at)}</p>
            <div className="admin-form-actions">
              <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print Receipt</button>
              <button type="button" className="btn btn-outline" onClick={() => setReceipt(null)}>Close</button>
            </div>
          </section>
        )}
        {isLoading ? (
          <p className="payment-empty">Loading payment history...</p>
        ) : payments.length === 0 ? (
          <p className="payment-empty">No payments yet.</p>
        ) : (
          <div className="payments-list">
            {payments.map((payment) => (
              <article key={payment.id} className="payment-item card">
                <div>
                  <h3>{payment.memorial_name}</h3>
                  <p>Visitor: {payment.visitor_name}</p>
                  <p>Method: {payment.payment_method || 'GCash'}</p>
                  {payment.payment_reference && <p>Reference: {payment.payment_reference}</p>}
                  <p>Date: {formatDate(payment.transaction_date)}</p>
                  {payment.admin_note && <p><small>Staff note: {payment.admin_note}</small></p>}
                  {payment.payment_status === 'completed' && (
                    payment.settlement_id
                      ? <p>Money destination: <strong>Remitted → {payment.remitted_to || 'treasury'}</strong>{payment.settlement_ref ? ` (Ref ${payment.settlement_ref})` : ''}</p>
                      : <p>Money destination: <strong>Held in GCash wallet</strong></p>
                  )}
                </div>
                <div className="payment-item-right">
                  <p className="payment-amount">₱{parseFloat(payment.amount).toLocaleString()}</p>
                  <span className={`badge badge-${payment.payment_status}`}>{payment.payment_status.replaceAll('_', ' ')}</span>
                  {payment.payment_status === 'completed' && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={receiptLoadingId === payment.id}
                      onClick={() => handleViewReceipt(payment.id)}
                    >
                      {receiptLoadingId === payment.id ? 'Loading...' : 'View Receipt'}
                    </button>
                  )}
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
