import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import TrainMap from './components/TrainMap'
import { Search, Train, RefreshCw } from 'lucide-react'
import './App.css'

const TRANSPORT_API_APP_ID = import.meta.env.VITE_TRANSPORT_API_APP_ID || '';
const TRANSPORT_API_APP_KEY = import.meta.env.VITE_TRANSPORT_API_APP_KEY || '';

// Refresh strategy: 
// 1. Manual "Refresh" button only for now to conserve 30-call daily limit.
// 2. Launch plan: 15-minute interval (900,000 ms).
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; 
const ENABLE_AUTO_REFRESH = false; // Set to true for launch

function App() {
  const [trains, setTrains] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

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
      
      const response = await axios.get('https://transportapi.com/v3/uk/train/actual_journeys.json', {
        params: {
          app_id: TRANSPORT_API_APP_ID,
          app_key: TRANSPORT_API_APP_KEY,
          operator: 'TP'
        }
      });

      if (response.data && response.data.member) {
        const mappedTrains = response.data.member.map(journey => {
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

        setTrains(mappedTrains);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Error fetching train data:', err);
      setError('Failed to fetch live data. ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrains();
    
    let interval;
    if (ENABLE_AUTO_REFRESH) {
      interval = setInterval(fetchTrains, REFRESH_INTERVAL_MS);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
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
