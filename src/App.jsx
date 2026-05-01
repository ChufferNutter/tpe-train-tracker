import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import TrainMap from './components/TrainMap'
import { Search, Train, RefreshCw } from 'lucide-react'
import './App.css'

const TRANSPORT_API_APP_ID = import.meta.env.VITE_TRANSPORT_API_APP_ID || '';
const TRANSPORT_API_APP_KEY = import.meta.env.VITE_TRANSPORT_API_APP_KEY || '';

// Refresh strategy: 
// Manual "Refresh" button only to conserve 30-call daily limit.

// App component for TPE Train Tracker
// Optimized for station hub polling when actual_journeys is restricted.
function App() {
  const [trains, setTrains] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchFromStationHubs = useCallback(async () => {
    const STATION_HUBS = [
      { code: 'MAN', lat: 53.4767, lon: -2.2303 },
      { code: 'LDS', lat: 53.7951, lon: -1.5476 },
      { code: 'YRK', lat: 53.9580, lon: -1.0927 },
      { code: 'SHF', lat: 53.3783, lon: -1.4629 },
      { code: 'PRE', lat: 53.7553, lon: -2.7071 },
      { code: 'LIV', lat: 53.4077, lon: -2.9775 },
      { code: 'NCL', lat: 54.9682, lon: -1.6171 }
    ];
    const allTrainsMap = new Map();
    
    console.log('Fetching from station hubs...');
    for (const station of STATION_HUBS) {
      try {
        const response = await axios.get(`https://transportapi.com/v3/uk/train/station/${station.code}/live.json`, {
          params: {
            app_id: TRANSPORT_API_APP_ID,
            app_key: TRANSPORT_API_APP_KEY,
            operator: 'TP',
            type: 'departure'
          }
        });

        if (response.data?.departures?.all) {
          response.data.departures.all.forEach(dep => {
            const id = dep.service_id || dep.train_uid;
            if (id && !allTrainsMap.has(id)) {
              // Store train with station coordinates as initial proxy
              allTrainsMap.set(id, {
                ...dep,
                latitude: station.lat,
                longitude: station.lon
              });
            }
          });
        }
      } catch (err) {
        console.warn(`Fallback: Failed to fetch from station ${station.code}:`, err.message);
      }
    }

    const uniqueTrains = Array.from(allTrainsMap.values());
    const mappedTrains = [];

    // To conserve API hits, we could potentially skip fetching journey details 
    // for EVERY train and just use station coordinates, but let's try to get 
    // real positions for a few if possible, or just rely on station proxy for now.
    // Given the 403 on actual_journeys, station proxy is more reliable and efficient.
    
    console.log(`Found ${uniqueTrains.length} unique TPE trains. Using station coordinates as proxy.`);
    
    for (const train of uniqueTrains) {
      let hc = train.headcode;
      if (!hc && train.train_id && train.train_id.length >= 6) {
        hc = train.train_id.substring(2, 6);
      }

      mappedTrains.push({
        id: train.train_uid || train.service_id || Math.random().toString(36).substr(2, 9),
        headcode: hc || '????',
        latitude: train.latitude,
        longitude: train.longitude,
        delay: train.delay_minutes || 0,
        origin_name: train.origin_name || 'Unknown',
        destination_name: train.destination_name || 'Unknown',
        status: train.status || 'RUNNING'
      });
    }

    return mappedTrains;
  }, []);

  const fetchTrains = useCallback(async () => {
    if (!TRANSPORT_API_APP_ID || !TRANSPORT_API_APP_KEY) {
      console.log('Using mock data - API keys missing');
      setTrains([
        {
          id: '1',
          headcode: '1M65',
          latitude: 53.4808,
          longitude: -2.2426,
          delay: 5,
          origin_name: 'Manchester Piccadilly',
          destination_name: 'York',
          status: 'LATE'
        },
        {
          id: '2',
          headcode: '1P22',
          latitude: 53.7948,
          longitude: -1.5491,
          delay: 0,
          origin_name: 'Leeds',
          destination_name: 'Manchester Airport',
          status: 'ON TIME'
        },
        {
          id: '3',
          headcode: '1S44',
          latitude: 54.5762,
          longitude: -1.2348,
          delay: -2,
          origin_name: 'Middlesbrough',
          destination_name: 'Manchester Victoria',
          status: 'EARLY'
        }
      ]);
      setLastUpdated(new Date());
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      let mappedTrains = [];
      try {
        const response = await axios.get('https://transportapi.com/v3/uk/train/actual_journeys.json', {
          params: {
            app_id: TRANSPORT_API_APP_ID,
            app_key: TRANSPORT_API_APP_KEY,
            operator: 'TP'
          }
        });

        if (response.data && response.data.member) {
          mappedTrains = response.data.member.map(journey => {
            // Robust headcode extraction based on research (characters 3-6 of train_id)
            let hc = journey.headcode || journey.service?.headcode;
            if (!hc && journey.train_id && journey.train_id.length >= 6) {
              hc = journey.train_id.substring(2, 6);
            }

            return {
              id: journey.train_uid || journey.rid || Math.random().toString(36).substr(2, 9),
              headcode: hc || '????',
              latitude: journey.latitude,
              longitude: journey.longitude,
              delay: journey.delay_minutes || 0,
              origin_name: journey.origin_name || 'Unknown',
              destination_name: journey.destination_name || 'Unknown',
              status: journey.status || 'UNKNOWN'
            };
          }).filter(t => t.latitude && t.longitude);
        }
      } catch (err) {
        // Fallback if actual_journeys is denied (403/401)
        if (err.response && (err.response.status === 403 || err.response.status === 401)) {
          console.log('actual_journeys denied. Switching to Station Hub Fallback...');
          mappedTrains = await fetchFromStationHubs();
        } else {
          throw err;
        }
      }

      setTrains(mappedTrains);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching train data:', err);
      setError('Failed to fetch live data. ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [fetchFromStationHubs]);

  useEffect(() => {
    fetchTrains();
  }, [fetchTrains]);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <Train className="logo-icon" />
          <h1>TPE Train Tracker</h1>
        </div>
        
        <div className="header-actions">
          <div className="search-container">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search headcode (e.g. 1M65)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <button 
            className={`refresh-button ${loading ? 'loading' : ''}`} 
            onClick={fetchTrains}
            disabled={loading}
            title="Refresh train data"
          >
            <RefreshCw className="refresh-icon" />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      <main className="map-container">
        {loading && <div className="overlay">Updating positions...</div>}
        {error && <div className="overlay error">{error}</div>}
        {lastUpdated && !error && !loading && (
          <div className="overlay info">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
        {!TRANSPORT_API_APP_ID && (
          <div className="api-notice">
            Running with mock data. Set API keys in .env to see live data.
          </div>
        )}
        <TrainMap trains={trains} searchQuery={searchQuery} />
      </main>
    </div>
  )
}

export default App
