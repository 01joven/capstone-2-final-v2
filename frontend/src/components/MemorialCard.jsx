import { Link } from 'react-router-dom';
import './MemorialCard.css';

const MemorialCard = ({ memorial, onSave, isSaved, isSaving = false }) => {
  return (
    <div className="memorial-card card">
      <img
        src={memorial.image_url || 'https://via.placeholder.com/400x200?text=Memorial'}
        alt={memorial.name}
        className="memorial-card-img"
      />
      <div className="memorial-card-body">
        <span className="memorial-category">{memorial.category}</span>
        {memorial.is_demo && <span className="demo-data-badge">Sample / Demo Data</span>}
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
            <Link to={`/reservations/${memorial.id}`} className="btn btn-primary">
              Book Now
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemorialCard;
