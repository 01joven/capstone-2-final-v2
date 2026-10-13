import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import MemorialCard from '../components/MemorialCard';
import { favoriteAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import './Saved.css';

const Saved = () => {
  const [saved, setSaved] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [removingMemorialId, setRemovingMemorialId] = useState(null);

  const loadSaved = useCallback(async () => {
    setError('');
    try {
      const { data } = await favoriteAPI.getAll();
      setSaved(data);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not load your saved memorials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  usePolling(loadSaved);

  const handleRemove = async (memorialId) => {
    const item = saved.find((s) => s.id === memorialId);
    if (item) {
      setError('');
      setRemovingMemorialId(memorialId);
      try {
        await favoriteAPI.remove(item.saved_id);
        setSaved((currentSaved) => currentSaved.filter((savedItem) => savedItem.id !== memorialId));
      } catch (removeError) {
        setError(removeError.response?.data?.message || 'Could not remove this memorial from favorites. Please try again.');
      } finally {
        setRemovingMemorialId(null);
      }
    }
  };

  return (
    <Layout>
      <div className="page-container">
        <h1 className="page-title">Saved Memorials</h1>
        {error && <p className="error-msg" role="alert">{error}</p>}

        {isLoading ? (
          <p className="saved-empty" role="status">Loading saved memorials...</p>
        ) : saved.length === 0 ? (
          <p className="saved-empty">
            No saved memorials yet. Browse memorial sites and tap the heart to add your favorites.
            <Link to="/search" className="btn btn-primary">Browse Memorials</Link>
          </p>
        ) : (
          <div className="grid-3">
            {saved.map((m) => (
              <MemorialCard
                key={m.id}
                memorial={m}
                onSave={handleRemove}
                isSaved={true}
                isSaving={removingMemorialId === m.id}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Saved;
