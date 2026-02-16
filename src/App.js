import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Fuel type color mapping
const FUEL_COLORS = {
  'Coal': '#8b9dc3',           // Light slate blue
  'Natural Gas': '#64b5f6',    // Bright blue
  'Nuclear': '#ff6b6b',        // Bright red
  'Solar': '#ffd93d',          // Bright yellow
  'Wind': '#6bcf7f',           // Bright green
  'Hydro': '#4ecdc4',          // Bright teal
  'Petroleum': '#c77dff',      // Bright purple
  'Other': '#95a5a6'           // Light gray
};

// Sample fallback data
// const SAMPLE_DATA = [
//   {name: "Chalk Point", state: "MD", latitude: 38.5214, longitude: -76.7681, primaryFuel: "Natural Gas", totalCapacity: 2560, operator: "PEPCO"},
//   {name: "Benning Road", state: "DC", latitude: 38.8942, longitude: -76.9528, primaryFuel: "Natural Gas", totalCapacity: 105, operator: "PEPCO"},
//   {name: "Potomac River", state: "DC", latitude: 38.8753, longitude: -77.0353, primaryFuel: "Natural Gas", totalCapacity: 822, operator: "PEPCO"}
// ];

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

function App() {
  const [plants, setPlants] = useState([]);
  const [activeFilters, setActiveFilters] = useState(new Set(Object.keys(FUEL_COLORS)));
  const [loading, setLoading] = useState(true);
  const [activeStates, setActiveStates] = useState(new Set()); // Changed from activeUtilities
  const [stateSearchTerm, setStateSearchTerm] = useState(''); // For search functionality
  const debouncedSearchTerm = useDebounce(stateSearchTerm, 200); // 200ms delay
  const [activeBalancingAuthorities, setActiveBalancingAuthorities] = useState(new Set());
  const [baSearchTerm, setBaSearchTerm] = useState('');
  const [activeFilterType, setActiveFilterType] = useState('both');

  // Load plant data on component mount
  useEffect(() => {
    loadPlantData();
  }, []);

// Process raw API data into our standard format
const processAPIData = (rawData) => {
  const FUEL_MAPPING = {
    'NG': 'Natural Gas', 'GAS': 'Natural Gas',
    'NUC': 'Nuclear',
    'COL': 'Coal', 'BIT': 'Coal', 'SUB': 'Coal',
    'SUN': 'Solar', 'PV': 'Solar',
    'WND': 'Wind', 'WTR': 'Wind',
    'WAT': 'Hydro', 'HYC': 'Hydro',
    'OIL': 'Petroleum', 'DFO': 'Petroleum', 'RFO': 'Petroleum',
    'WDS': 'Other', 'OTH': 'Other'
  };

  return rawData.map(feature => {
    const attrs = feature.attributes;
    const geom = feature.geometry;
    
    // Try multiple possible field names for capacity
    const getFuelCapacity = (fuelType) => {
      const possibleNames = {
        'Coal': ['CoalMW', 'Coal_MW', 'COAL_MW'],
        'Natural Gas': ['NatGasMW', 'Nat_Gas_MW', 'NG_MW', 'GAS_MW'],
        'Nuclear': ['NuclearMW', 'Nuclear_MW', 'NUC_MW'],
        'Solar': ['SolarMW', 'Solar_MW', 'SUN_MW'],
        'Wind': ['WindMW', 'Wind_MW', 'WND_MW'],
        'Hydro': ['HydroMW', 'Hydro_MW', 'WAT_MW'],
        'Petroleum': ['PetroMW', 'Petro_MW', 'OIL_MW', 'Crude_Oil_MW']
      };
      
      for (const name of possibleNames[fuelType] || []) {
        if (attrs[name]) return attrs[name];
      }
      return 0;
    };
    
    // Build fuel breakdown
    let primaryFuel = 'Other';
    let maxCapacity = 0;
    const fuelBreakdown = {};
    
    Object.keys(FUEL_COLORS).filter(f => f !== 'Other').forEach(fuel => {
      const capacity = getFuelCapacity(fuel);
      if (capacity > 0) {
        fuelBreakdown[fuel] = capacity;
        if (capacity > maxCapacity) {
          maxCapacity = capacity;
          primaryFuel = fuel;
        }
      }
    });
    
    const totalCapacity = Object.values(fuelBreakdown).reduce((sum, val) => sum + val, 0);
    
    return {
      name: attrs.PlantName || attrs.Plant_Name || attrs.NAME || 'Unknown',
      state: attrs.State || attrs.StateName || attrs.STATE || 'Unknown',
      latitude: geom.y,
      longitude: geom.x,
      primaryFuel: primaryFuel,
      totalCapacity: totalCapacity || maxCapacity,
      operator: attrs.transmissionOwner, //|| attrs.Utility_Name || 'Various' ,
      fuelBreakdown: fuelBreakdown
    };
  }).filter(plant => plant.totalCapacity > 0); // Only include plants with capacity
};

// Helper to handle API pagination if there are more than 10000 plants
const fetchAllRecords = async (baseUrl) => {
    let allFeatures = [];
    let offset = 0;
    const batchSize = 5000;
    let hasMore = true;
    
    while (hasMore && offset < 20000) { // Safety limit
      const url = `${baseUrl}?where=1=1&outFields=*&f=json&resultOffset=${offset}&resultRecordCount=${batchSize}`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          allFeatures.push(...data.features);
          console.log(`Fetched ${allFeatures.length} plants so far...`);
          
          if (data.features.length < batchSize) {
            hasMore = false; // No more records
          } else {
            offset += batchSize;
          }
        } else {
          hasMore = false;
        }
      } catch (e) {
        console.log('Pagination failed:', e);
        hasMore = false;
      }
    }
    
    return allFeatures;
  };
    
  const loadPlantData = async () => {
    // Helper function to transform N/A to Unlisted
    const transformData = (data) => {
      return data.map(plant => ({
        ...plant,
        balancingAuthorityCode: plant.balancingAuthorityCode === 'N/A' ? 'Unlisted' : plant.balancingAuthorityCode,
        balancingAuthorityName: plant.balancingAuthorityName === 'N/A' ? 'Unlisted' : plant.balancingAuthorityName
      }));
    };

    // // PRIORITY 1: Try live EIA API endpoints
    // console.log('Attempting to load from EIA API...');
    
    // const endpoints = [
    //   'https://services7.arcgis.com/FGr1D95XCGALKXqM/arcgis/rest/services/Power_Plants/FeatureServer/0/query',
    //   'https://atlas.eia.gov/arcgis/rest/services/EIA/PowerPlants/FeatureServer/0/query'
    // ];

    // for (const baseUrl of endpoints) {
    //   try {
    //     const allData = [];
        
    //     // Query for ALL plants instead of specific states
    //     const queries = [
    //       `${baseUrl}?where=1=1&outFields=*&f=json&resultRecordCount=10000`,
    //       `${baseUrl}?where=1=1&outFields=*&f=pjson&resultRecordCount=10000`
    //     ];
        
    //     for (const url of queries) {
    //       try {
    //         console.log(`Trying API: ${url}`);
    //         const response = await fetch(url);
    //         const data = await response.json();
            
    //         if (data.features && data.features.length > 0) {
    //           console.log(`✓ API Success! Found ${data.features.length} plants total`);
    //           allData.push(...data.features);
    //           break;
    //         }
    //       } catch (e) {
    //         console.log(`Query failed, trying next...`);
    //       }
    //     }
        
    //     if (allData.length > 0) {
    //       console.log(`Total plants from API: ${allData.length}`);
    //       const processedData = processAPIData(allData);
    //       const transformedData = transformData(processedData); // TRANSFORM HERE
    //       setPlants(transformedData);
    //       setLoading(false);
    //       return;
    //     }
    //   } catch (error) {
    //     console.log(`Endpoint failed: ${baseUrl}`);
    //   }
    // }
    
    // PRIORITY 2: Try loading from local JSON file
    console.log('API failed, trying local JSON file...');
    try {
      const response = await fetch('/us-plants.json');
      const data = await response.json();
      const transformedData = transformData(data); // TRANSFORM HERE
      console.log(`✓ Loaded ${transformedData.length} plants from local JSON`);
      setPlants(transformedData);
      setLoading(false);
      return;
    } catch (error) {
      console.error('JSON file not found:', error);
    }
    
    // PRIORITY 3: Use sample data as last resort
    // console.log('Using sample data fallback...');
    // const transformedSampleData = transformData(SAMPLE_DATA); // TRANSFORM HERE
    // setPlants(transformedSampleData);
    // setLoading(false);
  };

  // Toggle fuel type filter
  const toggleFilter = (fuel) => {
    setActiveFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(fuel)) {
        newFilters.delete(fuel);
      } else {
        newFilters.add(fuel);
      }
      return newFilters;
    });
  };

  // Toggle all filters on or off
  const toggleAllFilters = () => {
    if (activeFilters.size === Object.keys(FUEL_COLORS).length) {
      // All are active, so turn all off
      setActiveFilters(new Set());
    } else {
      // Some or none are active, so turn all on
      setActiveFilters(new Set(Object.keys(FUEL_COLORS)));
    }
  };
  
  // Toggle state filter
  const toggleState = (state) => {
    setActiveStates(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(state)) {
        newFilters.delete(state);
      } else {
        newFilters.add(state);
      }
      return newFilters;
    });
  };

  // Toggle all states
  const toggleAllStates = () => {
    if (activeStates.size === uniqueStates.length) {
      setActiveStates(new Set());
    } else {
      setActiveStates(new Set(uniqueStates));
    }
  };

  // Clear search
  const clearSearch = () => {
    setStateSearchTerm('');
  };

  // Toggle balancing authority filter
  const toggleBalancingAuthority = (ba) => {
    setActiveBalancingAuthorities(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(ba)) {
        newFilters.delete(ba);
      } else {
        newFilters.add(ba);
      }
      return newFilters;
    });
  };

  // Toggle all balancing authorities
  const toggleAllBalancingAuthorities = () => {
    if (activeBalancingAuthorities.size === uniqueBalancingAuthorities.length) {
      setActiveBalancingAuthorities(new Set());
    } else {
      setActiveBalancingAuthorities(new Set(uniqueBalancingAuthorities));
    }
  };

  // Clear BA search
  const clearBaSearch = () => {
    setBaSearchTerm('');
  };

  const toggleStateWithBA = (state) => {
    // Don't allow deselecting the last state
    if (activeStates.size === 1 && activeStates.has(state)) {
      return; // Do nothing - can't deselect the last one
    }
    
    toggleState(state);
    setActiveFilterType('state');
    if (activeBalancingAuthorities.size !== uniqueBalancingAuthorities.length) {
      setActiveBalancingAuthorities(new Set(uniqueBalancingAuthorities));
    }
  };

  const toggleBalancingAuthorityWithState = (ba) => {
    // Don't allow deselecting the last BA
    if (activeBalancingAuthorities.size === 1 && activeBalancingAuthorities.has(ba)) {
      return; // Do nothing - can't deselect the last one
    }
    
    toggleBalancingAuthority(ba);
    setActiveFilterType('ba');
    if (activeStates.size !== uniqueStates.length) {
      setActiveStates(new Set(uniqueStates));
    }
  };

  // Update toggle all functions
  const toggleAllStatesExclusive = () => {
    // Don't allow clearing all - keep at least one selected
    if (activeStates.size === uniqueStates.length) {
      // Instead of clearing all, just select the first state
      setActiveStates(new Set([uniqueStates[0]]));
      setActiveFilterType('state');
      setActiveBalancingAuthorities(new Set(uniqueBalancingAuthorities));
    } else {
      // Selecting all
      setActiveStates(new Set(uniqueStates));
      setActiveFilterType('both');
      setActiveBalancingAuthorities(new Set(uniqueBalancingAuthorities));
    }
  };

  const toggleAllBalancingAuthoritiesExclusive = () => {
    // Don't allow clearing all - keep at least one selected
    if (activeBalancingAuthorities.size === uniqueBalancingAuthorities.length) {
      // Instead of clearing all, just select the first BA
      setActiveBalancingAuthorities(new Set([uniqueBalancingAuthorities[0]]));
      setActiveFilterType('ba');
      setActiveStates(new Set(uniqueStates));
    } else {
      // Selecting all
      setActiveBalancingAuthorities(new Set(uniqueBalancingAuthorities));
      setActiveFilterType('both');
      setActiveStates(new Set(uniqueStates));
    }
  };

  // Reset all filters to default (all selected)
  const resetAllFilters = () => {
    setActiveFilters(new Set(Object.keys(FUEL_COLORS)));
    setActiveStates(new Set(uniqueStates));
    setActiveBalancingAuthorities(new Set(uniqueBalancingAuthorities));
    setActiveFilterType('both');
    setStateSearchTerm('');
    setBaSearchTerm('');
  };

  // Filter plants based on active fuel types
  const visiblePlants = useMemo(() => 
    plants.filter(plant => 
      activeFilters.has(plant.primaryFuel) && 
      activeStates.has(plant.state) &&
      activeBalancingAuthorities.has(plant.balancingAuthorityCode)
    ),
    [plants, activeFilters, activeStates, activeBalancingAuthorities]
  );

  // Calculate statistics
  const stats = {
    totalPlants: visiblePlants.length,
    totalCapacity: visiblePlants.reduce((sum, p) => sum + p.totalCapacity, 0),
    avgCapacity: visiblePlants.length > 0 
      ? visiblePlants.reduce((sum, p) => sum + p.totalCapacity, 0) / visiblePlants.length 
      : 0,
    mostCommon: getMostCommonFuel(visiblePlants)
  };

  // Get unique states from the data
  const uniqueStates = useMemo(() => 
    [...new Set(plants.map(p => p.state))].filter(s => s && s !== 'Unknown').sort(),
    [plants]
  );

  // Initialize state filters (all selected by default) - only do once
  React.useEffect(() => {
    if (uniqueStates.length > 0 && activeStates.size === 0) {
      setActiveStates(new Set(uniqueStates));
    }
  }, [uniqueStates.length]);

  // Filter states based on search term
  const filteredStates = useMemo(() => 
    uniqueStates.filter(state => 
      state.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    ),
    [uniqueStates, debouncedSearchTerm]
  );

  // Get unique balancing authorities
  const uniqueBalancingAuthorities = useMemo(() => 
    [...new Set(plants.map(p => p.balancingAuthorityCode))]
      .filter(ba => ba && ba !== 'Unknown' && ba !== 'N/A')
      .sort((a, b) => {
      // Put "Unlisted" at the end
      if (a === 'Unlisted') return 1;
      if (b === 'Unlisted') return -1;
      return a.localeCompare(b);
    }),
    [plants]
  );

  // Initialize BA filters (all selected by default)
  React.useEffect(() => {
    if (uniqueBalancingAuthorities.length > 0 && activeBalancingAuthorities.size === 0) {
      setActiveBalancingAuthorities(new Set(uniqueBalancingAuthorities));
    }
  }, [uniqueBalancingAuthorities.length]);

  // Debounced BA search
  const debouncedBaSearchTerm = useDebounce(baSearchTerm, 200);

  // Filter balancing authorities based on search
  const filteredBalancingAuthorities = useMemo(() => 
    uniqueBalancingAuthorities.filter(ba => 
      ba.toLowerCase().includes(debouncedBaSearchTerm.toLowerCase())
    ),
    [uniqueBalancingAuthorities, debouncedBaSearchTerm]
  );

  function getMostCommonFuel(plants) {
    const counts = {};
    plants.forEach(p => {
      counts[p.primaryFuel] = (counts[p.primaryFuel] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? sorted[0][0] : 'N/A';
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading power plant data...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>U.S. Power Plants (2024)</h1>
        <p>Interactive map of power generation facilities across the United States</p>
      </header>

      {/* Main Container */}
      <div className="container">
        {/* Statistics */}
        <div className="stats-wrapper">
          <div className="stats">
            <div className="stat-card">
              <div className="stat-value">{stats.totalPlants.toLocaleString()}</div>
              <div className="stat-label">Total Facilities</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalCapacity.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
              <div className="stat-label">Total Capacity (MW)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.avgCapacity.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
              <div className="stat-label">Avg Capacity (MW)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: FUEL_COLORS[stats.mostCommon] || '#667eea' }}>
                {stats.mostCommon}
              </div>
              <div className="stat-label">Most Common Type</div>
            </div>
          </div>
        </div>
        
        {/* Map */}
        <div className="map-container">
          <MapContainer 
            center={[39.8283, -98.5795]}  // Center of USA
            zoom={4}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {visiblePlants.map((plant, idx) => {
              const radius = Math.max(5, Math.min(20, plant.totalCapacity / 100));
              
              return (
                <CircleMarker
                  key={idx}
                  center={[plant.latitude, plant.longitude]}
                  radius={radius}
                  pathOptions={{
                    fillColor: FUEL_COLORS[plant.primaryFuel],
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.7
                  }}
                >
                  <Popup>
                    <div style={{ minWidth: '200px' }}>
                      <h3 style={{ margin: '0 0 10px 0', color: FUEL_COLORS[plant.primaryFuel] }}>
                        {plant.name}
                      </h3>
                      <p style={{ margin: '5px 0' }}><strong>Location:</strong> {plant.state}</p>
                      <p style={{ margin: '5px 0' }}><strong>Transmission/Distribution Operator:</strong> {plant.transmissionOwner}</p>
                      <p style={{ margin: '5px 0' }}><strong>Primary Fuel:</strong> {plant.primaryFuel}</p>
                      <p style={{ margin: '5px 0' }}><strong>Total Capacity:</strong> {plant.totalCapacity.toFixed(1)} MW</p>
                      {plant.fuelBreakdown && Object.keys(plant.fuelBreakdown).length > 1 && (
                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ddd' }}>
                          <strong>Fuel Mix:</strong>
                          {Object.entries(plant.fuelBreakdown).map(([fuel, capacity]) => (
                            <div key={fuel} style={{ margin: '3px 0', display: 'flex', justifyContent: 'space-between' }}>
                              <span>{fuel}:</span>
                              <span style={{ fontWeight: 'bold' }}>{capacity.toFixed(1)} MW</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
        <div>

        </div>
        {/* Filter Controls */}
        <div className="controls">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Filter by Fuel Type</h3>
            <button 
              className="toggle-all-btn"
              onClick={toggleAllFilters}
            >
              {activeFilters.size === Object.keys(FUEL_COLORS).length ? 'Clear All' : 'Select All'}
            </button>
          </div>
          <div className="filter-buttons">
            {Object.entries(FUEL_COLORS).map(([fuel, color]) => (
              <button
                key={fuel}
                className={`filter-btn ${activeFilters.has(fuel) ? 'active' : ''}`}
                style={{ color: color, borderColor: activeFilters.has(fuel) ? color : '#2a2a4a' }}
                onClick={() => toggleFilter(fuel)}
              >
                <span className="color-dot" style={{ background: color }}></span>
                {fuel}
              </button>
            ))}
          </div>
        </div>

        {/* State and Balancing Authority Filters - Side by Side */}
        <div className="controls-row">
          {/* State Filter */}
          <div className={`filter-column ${activeFilterType === 'ba' ? 'filter-disabled' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Filter by State ({activeStates.size}/{uniqueStates.length})</h3>
              <button 
                className="toggle-all-btn"
                onClick={toggleAllStatesExclusive}
              >
                {activeStates.size === uniqueStates.length ? 'Select One' : 'Select All'}
              </button>
            </div>
            
            {/* Search Box */}
            <div className="search-box">
              <input
                type="text"
                placeholder="Search states..."
                value={stateSearchTerm}
                onChange={(e) => setStateSearchTerm(e.target.value)}
                className="state-search-input"
              />
              {stateSearchTerm && (
                <button className="clear-search-btn" onClick={clearSearch}>✕</button>
              )}
            </div>
            
            {/* State Pills */}
            <div className="state-filters">
              {filteredStates.map(state => (
                <button
                  key={state}
                  className={`state-pill ${activeStates.has(state) ? 'active' : ''} ${activeFilterType === 'ba' ? 'disabled' : ''}`}
                  onClick={() => toggleStateWithBA(state)}
                  disabled={activeFilterType === 'ba'}
                >
                  {state}
                  {activeStates.has(state) && <span className="check-mark">✓</span>}
                </button>
              ))}
              {filteredStates.length === 0 && (
                <p style={{ color: '#aaa', padding: '1rem', textAlign: 'center' }}>
                  No states match "{stateSearchTerm}"
                </p>
              )}
            </div>
          </div>

          {/* Balancing Authority Filter */}
          <div className={`filter-column ${activeFilterType === 'state' ? 'filter-disabled' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Filter by Balancing Authority ({activeBalancingAuthorities.size}/{uniqueBalancingAuthorities.length})</h3>
              <button 
                className="toggle-all-btn"
                onClick={toggleAllBalancingAuthoritiesExclusive}
              >
                {activeBalancingAuthorities.size === uniqueBalancingAuthorities.length ? 'Select One' : 'Select All'}
              </button>
            </div>
            
            {/* Search Box */}
            <div className="search-box">
              <input
                type="text"
                placeholder="Search balancing authorities..."
                value={baSearchTerm}
                onChange={(e) => setBaSearchTerm(e.target.value)}
                className="state-search-input"
              />
              {baSearchTerm && (
                <button className="clear-search-btn" onClick={clearBaSearch}>✕</button>
              )}
            </div>
            
            {/* BA Pills */}
            <div className="state-filters">
              {filteredBalancingAuthorities.map(ba => (
                <button
                  key={ba}
                  className={`state-pill ${activeBalancingAuthorities.has(ba) ? 'active' : ''} ${activeFilterType === 'state' ? 'disabled' : ''}`}
                  onClick={() => toggleBalancingAuthorityWithState(ba)}
                  disabled={activeFilterType === 'state'}
                >
                  {ba}
                  {activeBalancingAuthorities.has(ba) && <span className="check-mark">✓</span>}
                </button>
              ))}
              {filteredBalancingAuthorities.length === 0 && (
                <p style={{ color: '#aaa', padding: '1rem', textAlign: 'center' }}>
                  No balancing authorities match "{baSearchTerm}"
                </p>
              )}
            </div>
          </div>
        </div>
        {/* Reset Button */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <button className="reset-all-btn" onClick={resetAllFilters}>
            🔄 Reset All Filters
          </button>
        </div>
      </div>
       {/* Footer */}
      <footer className="footer">
        <p>
          Data Source: <a href="https://www.eia.gov/electricity/data/eia860/" target="_blank" rel="noopener noreferrer">
            U.S. Energy Information Administration (EIA) Form EIA-860
          </a> | Annual Electric Generator Report (2024)
        </p>        
      </footer>
    {/* End of app */}
    </div>
  );
}

export default App;