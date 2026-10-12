import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { burialAPI } from '../services/api';
import usePolling from '../hooks/usePolling';

const formatDate = (date) => {
  if (!date) return 'Not provided';
  const parsed = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? 'Not provided' : parsed.toLocaleDateString();
};

const MemorialRecord = () => {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRecord = useCallback(async () => {
    setError('');
    try {
      const { data } = await burialAPI.getAll({
        search: `MR-${String(id).padStart(4, '0')}`,
        cemetery: 'Cogon Cemetery',
      });
      const matchingRecord = (Array.isArray(data) ? data : []).find((entry) => String(entry.id) === String(id));
      if (!matchingRecord) {
        setError('No memorial record was found for this ID.');
        return;
      }
      setRecord(matchingRecord);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not load this memorial record.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setRecord(null);
    loadRecord();
  }, [id, loadRecord]);

  usePolling(loadRecord);

  return (
    <Layout>
      <div className="page-container">
        <p><Link to="/search">← Back to Search</Link></p>
        {loading ? (
          <p className="search-empty">Loading memorial record...</p>
        ) : error ? (
          <p className="error-msg" role="alert">{error}</p>
        ) : (
          <>
            <h1 className="page-title">Memorial Record</h1>
            <article className="memorial-information card">
              <div className="memorial-information-heading">
                <div>
                  <p className="record-id">MR-{String(record.id).padStart(4, '0')}</p>
                  <h2>{record.full_name}</h2>
                </div>
                <span className="badge">{record.is_demo ? 'Sample / Demo Data' : 'Verified Record'}</span>
              </div>
              <dl>
                <div><dt>Cemetery</dt><dd>{record.cemetery_name}</dd></div>
                <div><dt>Location</dt><dd>{record.barangay}, {record.municipality}, {record.province}</dd></div>
                <div><dt>Section</dt><dd>{record.section || 'Unassigned'}</dd></div>
                <div><dt>Plot / grave reference</dt><dd>{record.plot_reference || 'Unassigned'}</dd></div>
                <div><dt>Date of birth</dt><dd>{formatDate(record.birth_date)}</dd></div>
                <div><dt>Date of death</dt><dd>{formatDate(record.death_date)}</dd></div>
              </dl>
              {record.is_demo && (
                <p className="plot-map-note">
                  Sample / Demo Data. This is not a verified or authorized cemetery record; do not rely on this information as an actual burial location.
                </p>
              )}
              {record.location_is_demo && (
                <p className="plot-map-note">
                  Demo plot placement only — replace with an authorized, verified section and grave reference.
                </p>
              )}
              <Link to={`/map?burialId=${record.id}`} className="btn btn-primary">View on Map</Link>
            </article>
          </>
        )}
      </div>
    </Layout>
  );
};

export default MemorialRecord;
