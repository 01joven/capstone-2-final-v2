import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import MemorialCard from '../components/MemorialCard';
import { burialAPI, memorialAPI, favoriteAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import './Search.css';

const Search = () => {
  const [memorials, setMemorials] = useState([]);
  const [burials, setBurials] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [submittedCategory, setSubmittedCategory] = useState('');
  const [searchRequestKey, setSearchRequestKey] = useState(0);
  const [savedItems, setSavedItems] = useState({});
  const [savingMemorialId, setSavingMemorialId] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(true);

  const fetchResults = useCallback(async (searchTerm, selectedCategory, { showLoading = true } = {}) => {
    if (showLoading) {
      setSearchError('');
      setIsSearching(true);
    }
    try {
      const [memorialResponse, burialResponse, savedResponse] = await Promise.all([
        memorialAPI.getAll({ search: searchTerm, category: selectedCategory }),
        burialAPI.getAll({ search: searchTerm, cemetery: 'Cogon Cemetery' }),
        favoriteAPI.getAll(),
      ]);
      setMemorials(memorialResponse.data);
      setBurials(burialResponse.data);
      setSavedItems(Object.fromEntries(savedResponse.data.map((item) => [
        item.id,
        { savedId: item.saved_id },
      ])));
      if (showLoading) setSearchError('');
    } catch (error) {
      if (showLoading) {
        setSearchError(error.response?.data?.message || 'Could not load search results. Please try again.');
      }
    } finally {
      if (showLoading) setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    fetchResults(submittedSearch, submittedCategory);
  }, [fetchResults, submittedSearch, submittedCategory, searchRequestKey]);

  const refreshResults = useCallback(
    () => fetchResults(submittedSearch, submittedCategory, { showLoading: false }),
    [fetchResults, submittedSearch, submittedCategory]
  );
  usePolling(refreshResults);

  const handleSearch = (e) => {
    e.preventDefault();
    setSubmittedSearch(search);
    setSubmittedCategory(category);
    setSearchRequestKey((currentKey) => currentKey + 1);
  };

  const handleSave = async (memorialId) => {
    setSearchError('');
    setSavingMemorialId(memorialId);
    try {
      const savedItem = savedItems[memorialId];
      if (savedItem) {
        await favoriteAPI.remove(savedItem.savedId);
        setSavedItems((currentItems) => {
          const nextItems = { ...currentItems };
          delete nextItems[memorialId];
          return nextItems;
        });
      } else {
        const { data } = await favoriteAPI.add(memorialId);
        setSavedItems((currentItems) => ({
          ...currentItems,
          [memorialId]: { savedId: data.id },
        }));
      }
    } catch (error) {
      setSearchError(error.response?.data?.message || 'Could not update saved memorials. Please try again.');
    } finally {
      setSavingMemorialId(null);
    }
  };

  return (
    <Layout>
      <div className="page-container">
        <h1 className="page-title">Search Memorials and People</h1>

        <form className="search-bar card" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Search places or people buried at Cogon Cemetery..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            <option value="Garden">Garden</option>
            <option value="Historic">Historic</option>
            <option value="Cemetery">Cemetery</option>
            <option value="Riverside">Riverside</option>
          </select>
          <button type="submit" className="btn btn-primary">Search</button>
        </form>

        {searchError && <p className="error-msg" role="alert">{searchError}</p>}

        <h2 className="section-title">Memorial Records · Cogon Cemetery, Cordova</h2>
        {burials.length > 0 ? (
          <div className="burial-results">
            {burials.map((burial) => (
              <article className="burial-result card" key={burial.id}>
                <h3>{burial.full_name}</h3>
                <p>{burial.cemetery_name} · {burial.barangay}, {burial.municipality}, {burial.province}</p>
                <p>Record: MR-{String(burial.id).padStart(4, '0')} · Lot: {burial.plot_reference || 'Unassigned'}</p>
                <div className="burial-result-actions">
                  <Link to={`/records/${burial.id}`} className="btn btn-outline">View Record</Link>
                  <Link
                    to={`/map?burialId=${burial.id}`}
                    className="btn btn-primary"
                  >
                    View on Map
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          !searchError && <p className="search-empty">{isSearching ? 'Searching...' : 'No burial records found for this search.'}</p>
        )}

        <h2 className="section-title">Memorial Sites</h2>
        <div className="grid-3">
          {memorials.map((m) => (
            <MemorialCard
              key={m.id}
              memorial={m}
              onSave={handleSave}
              isSaved={Boolean(savedItems[m.id])}
              isSaving={savingMemorialId === m.id}
            />
          ))}
        </div>

        {memorials.length === 0 && !searchError && (
          <p className="search-empty">{isSearching ? 'Searching...' : 'No memorial sites found for this search.'}</p>
        )}
      </div>
    </Layout>
  );
};

export default Search;
