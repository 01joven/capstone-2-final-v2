import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { burialAPI, favoriteAPI, memorialAPI } from '../services/api';
import './MapView.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const SECTIONS = ['A', 'B', 'C', 'D'];
const BASE_PLOTS_PER_SECTION = 24;
const COGON_CEMETERY_LOCATION = [10.2600416, 123.9510156];

const formatDate = (date) => {
  if (!date) return 'Not provided';
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date))
    ? new Date(`${date}T00:00:00`)
    : new Date(date);
  return Number.isNaN(parsedDate.getTime()) ? 'Not provided' : parsedDate.toLocaleDateString();
};

const MapView = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [memorials, setMemorials] = useState([]);
  const [savedItems, setSavedItems] = useState({});
  const [savingMemorialId, setSavingMemorialId] = useState(null);
  const [burials, setBurials] = useState([]);
  const [selectedBurialId, setSelectedBurialId] = useState(null);
  const [activeView, setActiveView] = useState('plots');
  const [siteMapMode, setSiteMapMode] = useState('cogon');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadMapData = async () => {
      setIsLoading(true);
      setError('');
      try {
        const [burialResponse, memorialResponse, savedResponse] = await Promise.all([
          burialAPI.getAll({ cemetery: 'Cogon Cemetery' }),
          memorialAPI.getAll(),
          favoriteAPI.getAll(),
        ]);
        setBurials(burialResponse.data);
        setMemorials(memorialResponse.data);
        setSavedItems(Object.fromEntries(savedResponse.data.map((item) => [
          item.id,
          { savedId: item.saved_id },
        ])));
      } catch (loadError) {
        setError(loadError.response?.data?.message || 'Could not load map data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadMapData();
  }, []);

  useEffect(() => {
    const burialId = Number(searchParams.get('burialId'));
    if (Number.isSafeInteger(burialId) && burialId > 0) {
      setSelectedBurialId(burialId);
      setActiveView('plots');
    }
  }, [searchParams]);

  const visibleBurials = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return burials;
    return burials.filter((burial) =>
      [
        burial.full_name,
        burial.plot_reference,
        burial.section ? `section ${burial.section}` : '',
        `mr-${String(burial.id).padStart(4, '0')}`,
        burial.death_date,
      ].some((value) => String(value || '').toLocaleLowerCase().includes(query))
    );
  }, [burials, search]);

  const sections = useMemo(
    () => [...new Set([...SECTIONS, ...burials.map((burial) => burial.section).filter(Boolean)])].sort(),
    [burials]
  );
  const selectedBurial = burials.find((burial) => burial.id === selectedBurialId);
  const unmappedBurials = visibleBurials.filter((burial) => !burial.section);

  const selectBurial = (burial) => {
    setSelectedBurialId(burial.id);
    setSearchParams({ burialId: String(burial.id) });
  };

  const toggleSavedMemorial = async (memorialId) => {
    setError('');
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
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Could not update saved memorials. Please try again.');
    } finally {
      setSavingMemorialId(null);
    }
  };

  return (
    <Layout>
      <div className="page-container map-view-page">
        <h1 className="page-title">Memorial Map</h1>
        <div className="map-view-tabs" role="tablist" aria-label="Map type">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'plots'}
            className={`btn ${activeView === 'plots' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveView('plots')}
          >
            Cemetery Plot Map
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'sites'}
            className={`btn ${activeView === 'sites' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveView('sites')}
          >
            Memorial Sites
          </button>
        </div>

        {error && <p className="error-msg" role="alert">{error}</p>}

        {activeView === 'plots' ? (
          <>
            <div className="plot-map-toolbar card">
              <div>
                <h2>Cogon Cemetery, Cordova</h2>
                <p>Choose a plot to view its memorial record.</p>
              </div>
              <input
                type="search"
                aria-label="Search memorial plot"
                placeholder="Search name, record ID, section, or lot..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="plot-map-note">
              Schematic plot layout. Records without a grave reference use clearly marked demo locations;
              replace these with verified cemetery section and lot data for an accurate map.
            </div>

            <div className="plot-map-legend" aria-label="Plot status legend">
              <span><i className="plot-legend-dot occupied" /> Occupied</span>
              <span><i className="plot-legend-dot available" /> Available</span>
              <span><i className="plot-legend-dot reserved" /> Reserved (not linked)</span>
            </div>

            {isLoading ? (
              <p className="search-empty">Loading cemetery plots...</p>
            ) : (
              <div className="plot-map-content">
                <div className="plot-sections">
                  {sections.map((section) => {
                    const sectionBurials = burials.filter((burial) => burial.section === section);
                    const plotCount = Math.max(
                      BASE_PLOTS_PER_SECTION,
                      ...sectionBurials.map((burial) => burial.lot_number || 0)
                    );

                    return (
                      <section className="plot-section card" key={section} aria-label={`Section ${section}`}>
                        <h3>Section {section}</h3>
                        <div className="plot-grid">
                          {Array.from({ length: plotCount }, (_, index) => {
                            const lotNumber = index + 1;
                            const burial = sectionBurials.find((record) => record.lot_number === lotNumber);
                            const plotReference = `${section}-${String(lotNumber).padStart(2, '0')}`;
                            const isSelected = burial?.id === selectedBurialId;
                            const isSearchMatch = burial && visibleBurials.some((record) => record.id === burial.id);

                            return (
                              <button
                                type="button"
                                key={plotReference}
                                className={`plot-cell ${burial ? 'occupied' : 'available'} ${isSelected ? 'selected' : ''} ${search && isSearchMatch ? 'search-match' : ''}`}
                                aria-label={burial ? `${plotReference}, occupied by ${burial.full_name}` : `${plotReference}, available`}
                                title={burial ? `${burial.full_name}${burial.location_is_demo ? ' (demo location)' : ''}` : `${plotReference} · Available`}
                                onClick={() => burial && selectBurial(burial)}
                                disabled={!burial}
                              >
                                <span>{plotReference}</span>
                                {burial?.location_is_demo && <small>Demo</small>}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>

                {selectedBurial && (
                  <article className="memorial-information card" aria-live="polite">
                    <div className="memorial-information-heading">
                      <div>
                        <p className="record-id">MR-{String(selectedBurial.id).padStart(4, '0')}</p>
                        <h2>{selectedBurial.full_name}</h2>
                      </div>
                      <span className="badge">{selectedBurial.is_demo ? 'Sample / Demo Data' : 'Verified Record'}</span>
                    </div>
                    <dl>
                      <div><dt>Lot</dt><dd>{selectedBurial.plot_reference || 'Not assigned'}</dd></div>
                      <div><dt>Section</dt><dd>{selectedBurial.section || 'Unassigned'}</dd></div>
                      <div><dt>Date of birth</dt><dd>{formatDate(selectedBurial.birth_date)}</dd></div>
                      <div><dt>Date of death</dt><dd>{formatDate(selectedBurial.death_date)}</dd></div>
                      <div><dt>Cemetery</dt><dd>{selectedBurial.cemetery_name}</dd></div>
                    </dl>
                    {selectedBurial.location_is_demo && (
                      <p className="demo-location-warning">
                        Demo placement only — verify the real plot before using this location.
                      </p>
                    )}
                    {selectedBurial.is_demo && (
                      <p className="demo-location-warning">
                        Sample / Demo Data — this record has not been marked as verified and authorized.
                      </p>
                    )}
                  </article>
                )}

                {unmappedBurials.length > 0 && (
                  <section className="unmapped-records card">
                    <h3>Records without a mappable section</h3>
                    <p>These records have a grave reference that does not identify a section and lot.</p>
                    <div>
                      {unmappedBurials.map((burial) => (
                        <button type="button" key={burial.id} onClick={() => selectBurial(burial)}>
                          {burial.full_name} · {burial.plot_reference}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {!visibleBurials.length && (
                  <p className="search-empty">No matching burial records found.</p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="site-map-toolbar">
              <div>
                <h2>Memorial Sites</h2>
                <p>Explore the Cogon area map or view memorial site coordinates.</p>
              </div>
              <div className="site-map-tabs" role="tablist" aria-label="Memorial site map">
                <button
                  type="button"
                  role="tab"
                  aria-selected={siteMapMode === 'cogon'}
                  className={`btn ${siteMapMode === 'cogon' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setSiteMapMode('cogon')}
                >
                  Cogon Area Map
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={siteMapMode === 'pins'}
                  className={`btn ${siteMapMode === 'pins' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setSiteMapMode('pins')}
                >
                  Site Pins
                </button>
              </div>
            </div>

            {siteMapMode === 'cogon' && (
              <p className="site-map-note">
                The cemetery pin is placed at the OpenStreetMap-mapped Cordova Catholic Cemetery in Cogon. Memorial site pins use their saved coordinates and are shown separately in Site Pins.
              </p>
            )}

            <div className="map-page memorial-sites-layout">
              <div className="map-sidebar card">
                <h3>Memorial Locations</h3>
                <div className="map-sidebar-list">
                  {memorials.map((memorial) => (
                    <div key={memorial.id} className="map-sidebar-item">
                      <img
                        className="map-sidebar-image"
                        src={memorial.image_url || '/cemetery-images/heritage-memorial.png'}
                        alt={`${memorial.name} cemetery`}
                        loading="lazy"
                      />
                      <h4>{memorial.name}</h4>
                      {memorial.is_demo && <span className="demo-data-badge">Sample / Demo Data</span>}
                      <p>{memorial.category} · ₱{parseFloat(memorial.price).toLocaleString()}</p>
                      <div className="map-sidebar-actions">
                        <button
                          type="button"
                          className={`map-save-button ${savedItems[memorial.id] ? 'saved' : ''}`}
                          aria-label={savedItems[memorial.id] ? `Remove ${memorial.name} from favorites` : `Save ${memorial.name} to favorites`}
                          aria-pressed={Boolean(savedItems[memorial.id])}
                          title={savedItems[memorial.id] ? 'Remove from favorites' : 'Add to favorites'}
                          disabled={savingMemorialId === memorial.id}
                          onClick={() => toggleSavedMemorial(memorial.id)}
                        >
                          {savingMemorialId === memorial.id ? '…' : savedItems[memorial.id] ? '❤️ Saved' : '♡ Save'}
                        </button>
                        <Link to={`/reservations/${memorial.id}`} className="btn btn-primary">
                          Add Reservation
                        </Link>
                      </div>
                    </div>
                  ))}
                  {memorials.length === 0 && !isLoading && (
                    <p className="search-empty">No memorial sites are available.</p>
                  )}
                </div>
              </div>

              {siteMapMode === 'cogon' ? (
                <div className="map-container cogon-reference-map">
                  <MapContainer
                    center={COGON_CEMETERY_LOCATION}
                    zoom={16}
                    scrollWheelZoom
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <Marker position={COGON_CEMETERY_LOCATION}>
                      <Popup>
                        <strong>Cogon Cemetery</strong>
                        <br />
                        Cogon, Cordova, Cebu
                        <br />
                        <span>OpenStreetMap listing: Cordova Catholic Cemetery</span>
                      </Popup>
                    </Marker>
                  </MapContainer>
                  <p>📍 Cogon Cemetery · Cogon, Cordova, Cebu</p>
                  <details className="cogon-map-reference">
                    <summary>View the Cogon area map you provided</summary>
                    <img
                      src="/cogon-area-map.png"
                      alt="Reference map showing Cogon, Gabi, Alegria, and Poblacion in Cordova, Cebu"
                    />
                  </details>
                </div>
              ) : (
                <div className="map-container">
                  <MapContainer center={[14.5995, 120.9842]} zoom={11} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    {memorials.map((memorial) => (
                      <Marker
                        key={memorial.id}
                        position={[parseFloat(memorial.latitude), parseFloat(memorial.longitude)]}
                      >
                        <Popup>
                          <strong>{memorial.name}</strong>
                          <br />
                          {memorial.category} — ₱{parseFloat(memorial.price).toLocaleString()}
                          <br />
                          <Link to={`/reservations/${memorial.id}`}>Add Reservation</Link>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default MapView;
