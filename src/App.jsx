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
      { code: 'NCL', lat: 54.9682, lon: -1.6171 },
      { code: 'EDB', lat: 55.9520, lon: -3.1890 }
    ];
    
    const calculateDelay = (aimed, expected) => {
      if (!aimed || !expected) return null;
      if (expected === 'On Time') return 0;
      try {
        const aMatch = aimed.match(/(\d+):(\d+)/);
        const eMatch = expected.match(/(\d+):(\d+)/);
        if (!aMatch || !eMatch) return null;
        const aimedMins = parseInt(aMatch[1]) * 60 + parseInt(aMatch[2]);
        const expectedMins = parseInt(eMatch[1]) * 60 + parseInt(eMatch[2]);
        let diff = expectedMins - aimedMins;
        // Handle overnight wrap-around (e.g., aimed 23:55, expected 00:05)
        if (diff < -1200) diff += 1440;
        if (diff > 1200) diff -= 1440;
        return diff;
      } catch (e) {
        return null;
      }
    };

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
            // Prioritize service_timetable.id for more accurate journey fetching
            let serviceId = dep.service_id || dep.train_uid;
            if (dep.service_timetable?.id) {
              const match = dep.service_timetable.id.match(/\/service_timetables\/(.*?)\.json/);
              if (match && match[1]) {
                serviceId = match[1];
              }
            }

            if (serviceId && !allTrainsMap.has(serviceId)) {
              // Store train with station coordinates as initial proxy
              allTrainsMap.set(serviceId, {
                ...dep,
                serviceId: serviceId,
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

    console.log(`Found ${uniqueTrains.length} unique TPE trains. Fetching journey details...`);
    
    for (const train of uniqueTrains) {
      try {
        // Use the explicit service_timetable.id URL if available, otherwise fallback to service_id
        const journeyUrl = train.service_timetable?.id || `https://transportapi.com/v3/uk/train/service_timetables/${train.serviceId || train.service_id || train.train_uid}.json`;
        
        console.log(`Fetching journey details from: ${journeyUrl}`);
        
        const axiosConfig = {
          params: {
            app_id: TRANSPORT_API_APP_ID,
            app_key: TRANSPORT_API_APP_KEY,
            live: 'true'
          }
        };

        // Fix: Don't append params if journeyUrl already has them
        if (journeyUrl.includes('app_id=')) {
          axiosConfig.params = {};
        }

        const journeyResponse = await axios.get(journeyUrl, axiosConfig);

        if (journeyResponse.data) {
          const journey = journeyResponse.data;
          console.log(`Journey Data Keys: ${Object.keys(journey).join(', ')}`);
          
          let hc = journey.headcode;
          if (!hc && journey.service?.headcode) hc = journey.service.headcode;
          
          if (!hc && journey.train_id && journey.train_id.length >= 6) {
            hc = journey.train_id.substring(2, 6);
          }
          
          if (!hc && journey.service && typeof journey.service === 'string' && journey.service.length >= 6) {
            hc = journey.service.substring(2, 6);
          }

          // Calculate delay with fallbacks
          let delayMinutes = journey.delay_minutes;
          if (delayMinutes === undefined || delayMinutes === null) {
            delayMinutes = calculateDelay(train.aimed_departure_time, train.expected_departure_time);
            if (delayMinutes === null) {
              delayMinutes = calculateDelay(train.aimed_arrival_time, train.expected_arrival_time);
            }
          }

          mappedTrains.push({
            id: journey.train_uid || journey.rid || train.serviceId || Math.random().toString(36).substr(2, 9),
            headcode: hc || train.headcode || 'N/A',
            latitude: journey.latitude || train.latitude,
            longitude: journey.longitude || train.longitude,
            delay: delayMinutes || 0,
            origin_name: journey.origin_name || train.origin_name,
            destination_name: journey.destination_name || train.destination_name,
            status: journey.status || train.status || 'RUNNING'
          });
        }
      } catch (err) {
        console.warn(`Fallback: Failed to fetch journey details for ${train.train_uid}:`, err.message);
        
        // Fallback to proxy data if full details fail
        let hc = train.headcode;
        if (!hc && train.train_id && train.train_id.length >= 6) {
          hc = train.train_id.substring(2, 6);
        }
        if (!hc && train.train_uid && train.train_uid.length >= 4) {
          // Sometimes headcode is the first 4 of train_uid? No, but let's try some heuristics if possible
          // or just show N/A
        }
        
        let delay = calculateDelay(train.aimed_departure_time, train.expected_departure_time);
        if (delay === null) {
          delay = calculateDelay(train.aimed_arrival_time, train.expected_arrival_time);
        }
        
        mappedTrains.push({
          id: train.train_uid || train.service_id || Math.random().toString(36).substr(2, 9),
          headcode: hc || 'N/A',
          latitude: train.latitude,
          longitude: train.longitude,
          delay: delay || 0,
          origin_name: train.origin_name || 'Unknown',
          destination_name: train.destination_name || 'Unknown',
          status: train.status || 'RUNNING'
        });
      }
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
              headcode: hc || 'N/A',
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
