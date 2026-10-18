import { Link } from 'react-router-dom';
import './MemorialCard.css';

const MemorialCard = ({ memorial, onSave, isSaved, isSaving = false, showReserve = true }) => {
  return (
    <div className="memorial-card card">
      <img
        src={memorial.image_url || '/cemetery-images/heritage-memorial.png'}
        alt={memorial.name}
        className="memorial-card-img"
      />
      <div className="memorial-card-body">
        <span className="memorial-category">{memorial.category}</span>
        <h3>{memorial.name}</h3>
        <p>{memorial.description?.substring(0, 80)}...</p>
        <div className="memorial-card-footer">
          <span className="memorial-price">₱{parseFloat(memorial.price).toLocaleString()}</span>
          <div className="memorial-card-actions">
            {onSave && (
              <button
                type="button"
                className={`save-btn ${isSaved ? 'saved' : ''}`}
                aria-label={isSaved ? `Remove ${memorial.name} from saved memorials` : `Save ${memorial.name} to favorites`}
                aria-pressed={Boolean(isSaved)}
                title={isSaved ? 'Remove from favorites' : 'Add to favorites'}
                disabled={isSaving}
                onClick={() => onSave(memorial.id)}
              >
                {isSaving ? '…' : isSaved ? '❤️' : '🤍'}
              </button>
            )}
            {showReserve ? (
              <Link to={`/reservations/${memorial.id}`} className="btn btn-primary">
                Book Now
              </Link>
            ) : (
              <span className="memorial-reserve-note">Plot reservations are arranged in person (cash/walk-in).</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemorialCard;
