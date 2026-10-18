import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { burialAPI, favoriteAPI, memorialAPI, reservationAPI, publicAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import './MapView.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const SECTIONS = ['A', 'B', 'C', 'D'];
const BASE_PLOTS_PER_SECTION = 24;
const COGON_CEMETERY_LOCATION = [10.2600416, 123.9510156];

const isValidLatLng = (lat, lng) => {
  const latNum = typeof lat === 'string' ? parseFloat(lat) : Number(lat);
  const lngNum = typeof lng === 'string' ? parseFloat(lng) : Number(lng);
  return Number.isFinite(latNum) && Number.isFinite(lngNum)
    && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180;
};

const formatDate = (date) => {
  if (!date) return 'Not provided';
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date))
    ? new Date(`${date}T00:00:00`)
    : new Date(date);
  return Number.isNaN(parsedDate.getTime()) ? 'Not provided' : parsedDate.toLocaleDateString();
};

const MapView = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [memorials, setMemorials] = useState([]);
  const [savedItems, setSavedItems] = useState({});
  const [savingMemorialId, setSavingMemorialId] = useState(null);
  const [burials, setBurials] = useState([]);
  const [plotReservations, setPlotReservations] = useState([]);
  const [selectedBurialId, setSelectedBurialId] = useState(null);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [activeView, setActiveView] = useState('plots');
  const [siteMapMode, setSiteMapMode] = useState('cogon');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [partialWarning, setPartialWarning] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSectionFilter, setSelectedSectionFilter] = useState('ALL');
  const [gridScale, setGridScale] = useState('normal'); // 'normal' | 'large'
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const detailsRef = useRef(null);

  const loadMapData = useCallback(async () => {
    try {
      const burialRequest = user ? burialAPI.getAll({ cemetery: 'Cogon Cemetery' }) : publicAPI.getBurials({ cemetery: 'Cogon Cemetery' });
      const plotRequest = user ? reservationAPI.getPlotReservations() : publicAPI.getPlots();
      const savedRequest = user ? favoriteAPI.getAll() : Promise.resolve({ data: [] });
      const [burialResult, memorialResult, savedResult, plotReservationResult] = await Promise.allSettled([
        burialRequest,
        memorialAPI.getAll(),
        savedRequest,
        plotRequest,
      ]);
      const warnings = [];
      if (burialResult.status === 'fulfilled') setBurials(burialResult.value.data);
      else warnings.push('burial records');
      if (memorialResult.status === 'fulfilled') setMemorials(memorialResult.value.data);
      else warnings.push('memorial sites');
      if (plotReservationResult.status === 'fulfilled') setPlotReservations(plotReservationResult.value.data);
      else warnings.push('plot reservations');
      if (savedResult.status === 'fulfilled') {
        setSavedItems(Object.fromEntries(savedResult.value.data.map((item) => [
          item.id,
          { savedId: item.saved_id },
        ])));
      } else warnings.push('saved memorials');
      if (warnings.length === 4) {
        const firstError = burialResult.reason || memorialResult.reason || savedResult.reason || plotReservationResult.reason;
        setError(firstError?.response?.data?.message || 'Could not load map data. Please try again.');
        setPartialWarning('');
      } else {
        setError('');
        setPartialWarning(warnings.length > 0 ? `Some map data could not be refreshed: ${warnings.join(', ')}.` : '');
      }
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not load map data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadMapData();
  }, [loadMapData]);

  usePolling(loadMapData, 10000, Boolean(user));

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
    () => [...new Set([
      ...SECTIONS,
      ...burials.map((burial) => burial.section).filter(Boolean),
      ...plotReservations.map((reservation) => reservation.plot_section).filter(Boolean),
    ])].sort(),
    [burials, plotReservations]
  );

  const displayedSections = useMemo(() => {
    if (selectedSectionFilter === 'ALL') return sections;
    return sections.filter((s) => s === selectedSectionFilter);
  }, [sections, selectedSectionFilter]);

  const selectedBurial = burials.find((burial) => burial.id === selectedBurialId);
  const unmappedBurials = visibleBurials.filter((burial) => !burial.section);

  const selectBurial = (burial) => {
    setSelectedBurialId(burial.id);
    setSelectedPlot(null);
    setShowMobilePreview(true);
    setSearchParams({ burialId: String(burial.id) });
  };

  useEffect(() => {
    if ((selectedBurialId || selectedPlot) && detailsRef.current) {
      if (typeof window !== 'undefined' && window.innerWidth <= 800) {
        detailsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedBurialId, selectedPlot]);

  const toggleSavedMemorial = async (memorialId) => {
    if (!user) {
      setError('Sign in to save memorial sites.');
      return;
    }
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
        {!error && partialWarning && <p className="search-empty" role="status">{partialWarning}</p>}

        {activeView === 'plots' ? (
          <>
            <div className="plot-map-toolbar card">
              <div>
                <h2>Cogon Cemetery — Deceased Burial Plots</h2>
                <p>Locate where deceased loved ones are laid to rest by section and plot. Families and walk-in visitors can visit burial spots anytime.</p>
              </div>
              <input
                type="search"
                aria-label="Search deceased burial plot"
                placeholder="Search deceased name, record ID, section, or lot..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="plot-map-note">
              Schematic plot layout. Records without a grave reference are listed separately below;
              enter verified cemetery section and lot data for an accurate map.
            </div>

            <div className="plot-map-legend" aria-label="Plot status legend">
              <span><i className="plot-legend-dot occupied" /> Occupied</span>
              <span><i className="plot-legend-dot available" /> Available</span>
              <span><i className="plot-legend-dot reserved" /> Reserved</span>
            </div>

            {/* Mobile & Desktop Responsive Controls: Section Switcher & Grid Zoom */}
            <div className="plot-controls-bar">
              <div className="section-filter-pills" role="tablist" aria-label="Filter by Section">
                <button
                  type="button"
                  className={`section-pill ${selectedSectionFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setSelectedSectionFilter('ALL')}
                >
                  All Sections ({sections.length})
                </button>
                {sections.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    className={`section-pill ${selectedSectionFilter === sec ? 'active' : ''}`}
                    onClick={() => setSelectedSectionFilter(sec)}
                  >
                    Section {sec}
                  </button>
                ))}
              </div>

              <div className="plot-zoom-controls">
                <button
                  type="button"
                  className={`zoom-toggle-btn ${gridScale === 'large' ? 'active' : ''}`}
                  onClick={() => setGridScale((prev) => (prev === 'normal' ? 'large' : 'normal'))}
                  title="Toggle comfortable touch-friendly plot grid size"
                  aria-label="Toggle touch-friendly plot grid size"
                >
                  {gridScale === 'normal' ? '🔍 Touch-Friendly Grid (Enlarge)' : '🔍 Standard Grid'}
                </button>
              </div>
            </div>

            {isLoading ? (
              <p className="search-empty">Loading cemetery plots...</p>
            ) : (
              <div className="plot-map-content">
                <div className="plot-sections">
                  {displayedSections.map((section) => {
                    const sectionBurials = burials.filter((burial) => burial.section === section);
                    const plotCount = Math.max(
                      BASE_PLOTS_PER_SECTION,
                      ...sectionBurials.map((burial) => burial.lot_number || 0),
                      ...plotReservations
                        .filter((reservation) => reservation.plot_section === section)
                        .map((reservation) => Number(reservation.plot_number) || 0)
                    );

                    return (
                      <section className="plot-section card" key={section} aria-label={`Section ${section}`}>
                        <div className="plot-section-header">
                          <h3>Section {section}</h3>
                          <span className="plot-section-count">{sectionBurials.length} Occupied · {plotCount - sectionBurials.length} Available</span>
                        </div>
                        <div className={`plot-grid ${gridScale === 'large' ? 'zoom-large' : ''}`}>
                          {Array.from({ length: plotCount }, (_, index) => {
                            const lotNumber = index + 1;
                            const burial = sectionBurials.find((record) => record.lot_number === lotNumber);
                            const plotReference = `${section}-${String(lotNumber).padStart(2, '0')}`;
                            const plotReservation = plotReservations.find((reservation) =>
                              reservation.plot_section === section && Number(reservation.plot_number) === lotNumber
                            );
                            const isSelected = burial?.id === selectedBurialId;
                            const isSearchMatch = burial && visibleBurials.some((record) => record.id === burial.id);
                            const isSelectedPlot = selectedPlot?.section === section && selectedPlot?.lotNumber === lotNumber;
                            const isReserved = Boolean(plotReservation);
                            const plotStatus = burial ? 'occupied' : isReserved ? 'reserved' : 'available';

                            return (
                              <button
                                type="button"
                                key={plotReference}
                                className={`plot-cell ${plotStatus} ${isSelected || isSelectedPlot ? 'selected' : ''} ${search && isSearchMatch ? 'search-match' : ''}`}
                                aria-label={burial
                                  ? `${plotReference}, occupied by ${burial.full_name}`
                                  : isReserved
                                    ? `${plotReference}, reserved`
                                    : `${plotReference}, available`}
                                title={burial
                                  ? `${burial.full_name}`
                                  : isReserved
                                    ? `${plotReference} · ${plotReservation.status === 'pending' ? 'Request pending review' : 'Reserved'}`
                                    : `${plotReference} · Available`}
                                onClick={() => {
                                  if (burial) {
                                    setSelectedPlot(null);
                                    selectBurial(burial);
                                  } else {
                                    setSelectedBurialId(null);
                                    setShowMobilePreview(true);
                                    setSearchParams({});
                                    setSelectedPlot({ section, lotNumber });
                                  }
                                }}
                                aria-disabled={isReserved && !burial}
                              >
                                <span>{plotReference}</span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>

                {selectedBurial && (
                  <article ref={detailsRef} className="memorial-information card" aria-live="polite">
                    <div className="memorial-information-heading">
                      <div>
                        <p className="record-id">MR-{String(selectedBurial.id).padStart(4, '0')}</p>
                        <h2>{selectedBurial.full_name}</h2>
                      </div>
                      <span className="badge">Deceased Burial Spot</span>
                    </div>
                    <dl>
                      <div><dt>Section</dt><dd><strong>Section {selectedBurial.section || 'Unassigned'}</strong></dd></div>
                      <div><dt>Plot / Lot</dt><dd><strong>{selectedBurial.plot_reference || 'Assigned Spot'}</strong></dd></div>
                      <div><dt>Date of death</dt><dd>{formatDate(selectedBurial.death_date)}</dd></div>
                      <div><dt>Cemetery</dt><dd>{selectedBurial.cemetery_name}</dd></div>
                    </dl>
                    {selectedBurial.epitaph && <p><em>“{selectedBurial.epitaph}”</em></p>}
                    <p className="form-help" style={{ marginTop: 10, color: '#15803d' }}>
                      📍 <strong>Visitor Guidance:</strong> Families and walk-in visitors can visit this burial spot in Section {selectedBurial.section || ''} anytime during cemetery hours.
                    </p>
                  </article>
                )}

                {selectedPlot && (() => {
                  const reservationForSelected = plotReservations.find((reservation) =>
                    reservation.plot_section === selectedPlot.section && Number(reservation.plot_number) === selectedPlot.lotNumber
                  );
                  if (reservationForSelected) {
                    return (
                      <article ref={detailsRef} className="memorial-information card" aria-live="polite">
                        <div className="memorial-information-heading">
                          <div>
                            <p className="record-id">Reserved cemetery plot</p>
                            <h2>Section {selectedPlot.section}, Plot {String(selectedPlot.lotNumber).padStart(2, '0')}</h2>
                          </div>
                          <span className="badge">{reservationForSelected.status === 'pending' ? 'Reserved (Awaiting Cash)' : 'Reserved'}</span>
                        </div>
                        <p>This plot is {reservationForSelected.status === 'pending' ? 'currently held for a deceased reservation awaiting cash payment' : 'already reserved'}. Choose a vacant plot to reserve for a deceased loved one.</p>
                      </article>
                    );
                  }
                  return (
                    <article ref={detailsRef} className="memorial-information card" aria-live="polite">
                      <div className="memorial-information-heading">
                        <div>
                          <p className="record-id">Vacant cemetery plot</p>
                          <h2>Section {selectedPlot.section}, Plot {String(selectedPlot.lotNumber).padStart(2, '0')}</h2>
                        </div>
                        <span className="badge badge-cash">Available for Deceased</span>
                      </div>
                      <p>
                        This spot is available to be reserved for a deceased loved one. Payments are accepted via <strong>Cash (Walk-in)</strong> at the cemetery administration office. No online payments.
                      </p>
                      {user ? (
                        <Link
                          className="btn btn-primary"
                          to={`/reservations/plot/${selectedPlot.section}/${selectedPlot.lotNumber}`}
                        >
                          Reserve this plot for a deceased loved one
                        </Link>
                      ) : (
                        <p className="memorial-reserve-note">Plot reservations are arranged in person at the cemetery office (cash/walk-in).</p>
                      )}
                    </article>
                  );
                })()}

                {/* Mobile Sticky Action/Preview Bar */}
                {selectedBurial && showMobilePreview && (
                  <aside className="mobile-plot-sticky-bar" aria-label="Selected plot preview">
                    <div className="mobile-plot-preview-info">
                      <span className="mobile-plot-pill occupied">
                        {selectedBurial.section ? `${selectedBurial.section}-${String(selectedBurial.lot_number || '').padStart(2, '0')}` : 'Spot'}
                      </span>
                      <div className="mobile-plot-preview-text">
                        <p className="mobile-plot-preview-name">{selectedBurial.full_name}</p>
                        <span className="mobile-plot-preview-meta">Section {selectedBurial.section || 'Unassigned'} · Occupied</span>
                      </div>
                    </div>
                    <div className="mobile-plot-preview-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        className="mobile-plot-close-btn"
                        onClick={() => {
                          setSelectedBurialId(null);
                          setShowMobilePreview(false);
                          setSearchParams({});
                        }}
                        aria-label="Close preview"
                      >
                        ✕
                      </button>
                    </div>
                  </aside>
                )}

                {selectedPlot && showMobilePreview && (() => {
                  const reservationForSelected = plotReservations.find((reservation) =>
                    reservation.plot_section === selectedPlot.section && Number(reservation.plot_number) === selectedPlot.lotNumber
                  );
                  const isPending = reservationForSelected?.status === 'pending';
                  return (
                    <aside className="mobile-plot-sticky-bar" aria-label="Selected plot preview">
                      <div className="mobile-plot-preview-info">
                        <span className={`mobile-plot-pill ${reservationForSelected ? 'reserved' : 'available'}`}>
                          {selectedPlot.section}-{String(selectedPlot.lotNumber).padStart(2, '0')}
                        </span>
                        <div className="mobile-plot-preview-text">
                          <p className="mobile-plot-preview-name">
                            {reservationForSelected ? (isPending ? 'Pending Cash' : 'Reserved') : 'Vacant Plot'}
                          </p>
                          <span className="mobile-plot-preview-meta">
                            Section {selectedPlot.section} · {reservationForSelected ? 'Reserved' : 'Available (Cash)'}
                          </span>
                        </div>
                      </div>
                      <div className="mobile-plot-preview-actions">
                        {!reservationForSelected ? (
                          user ? (
                            <Link
                              className="btn btn-sm btn-primary"
                              to={`/reservations/plot/${selectedPlot.section}/${selectedPlot.lotNumber}`}
                            >
                              Reserve
                            </Link>
                          ) : (
                            <span className="mobile-plot-preview-meta">In-person reservations (cash/walk-in)</span>
                          )
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                          >
                            Details
                          </button>
                        )}
                        <button
                          type="button"
                          className="mobile-plot-close-btn"
                          onClick={() => {
                            setSelectedPlot(null);
                            setShowMobilePreview(false);
                          }}
                          aria-label="Close preview"
                        >
                          ✕
                        </button>
                      </div>
                    </aside>
                  );
                })()}

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

            <div className="memorial-sites-grid-section">
              <div className="memorial-sites-card-grid">
                {memorials.map((memorial) => {
                  const fallbacks = [
                    '/cemetery-images/heritage-memorial.png',
                    '/cemetery-images/peaceful-gardens.png',
                    '/cemetery-images/riverside-memorial.png',
                    '/cemetery-images/sunset-hills.png',
                  ];
                  const imgSrc = memorial.image_url && memorial.image_url.trim() !== ''
                    ? memorial.image_url
                    : fallbacks[memorial.id % fallbacks.length] || fallbacks[0];
                  return (
                    <div key={memorial.id} className="memorial-site-card">
                      <div className="memorial-site-card-img-wrap">
                        <img
                          src={imgSrc}
                          alt={`${memorial.name}`}
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = fallbacks[0];
                          }}
                        />
                        <span className="memorial-site-category-badge">{memorial.category || 'Standard'}</span>
                      </div>
                      <div className="memorial-site-card-body">
                        <h4>{memorial.name}</h4>
                        <p className="memorial-site-price">₱{parseFloat(memorial.price).toLocaleString()} / lot</p>
                        {memorial.description && (
                          <p className="memorial-site-desc">{memorial.description}</p>
                        )}
                        <div className="memorial-site-card-actions">
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
                          {user ? (
                            <Link to={`/reservations/${memorial.id}`} className="btn btn-primary">
                              Reserve Plot
                            </Link>
                          ) : (
                            <span className="memorial-reserve-note">Plot reservations are arranged in person (cash/walk-in).</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {memorials.length === 0 && !isLoading && (
                  <p className="search-empty">No memorial sites are available.</p>
                )}
              </div>

              <div className="memorial-sites-map-row">
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
                    <MapContainer center={COGON_CEMETERY_LOCATION} zoom={11} style={{ height: '100%', width: '100%' }}>
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      />
                      {memorials.filter((memorial) => isValidLatLng(memorial.latitude, memorial.longitude)).map((memorial) => (
                        <Marker
                          key={memorial.id}
                          position={[Number(memorial.latitude), Number(memorial.longitude)]}
                        >
                          <Popup>
                            <strong>{memorial.name}</strong>
                            <br />
                            {memorial.category} — ₱{parseFloat(memorial.price).toLocaleString()}
                            <br />
                            {user && <Link to={`/reservations/${memorial.id}`}>Reserve Plot</Link>}
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default MapView;
