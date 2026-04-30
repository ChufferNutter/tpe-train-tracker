# TPE Train Tracker Prototype

A React web application to track TransPennine Express (TPE) trains on a map.

## Features
- Real-time tracking of TPE trains using TransportAPI.
- Search by 4-digit headcode.
- Delay visualization (+/- minutes) directly on the map markers.
- Manual Refresh button to conserve API limits.

## API Limits & Usage
**IMPORTANT:** The current TransportAPI account has a limit of **30 calls per day**.
- The app is configured with a **manual refresh** button only for now.
- Do NOT refresh excessively to avoid exhausting the limit.
- Auto-refresh (15-minute interval) can be enabled in `src/App.jsx` by setting `ENABLE_AUTO_REFRESH = true`.

## Configuration
The app uses the following environment variables (stored in `.env`):
- `VITE_TRANSPORT_API_APP_ID`: 22efca73
- `VITE_TRANSPORT_API_APP_KEY`: 6dd46254a587497d93b2b4f6e27de192

## Development
To run the app locally:
1. `npm install`
2. `npm run dev`

To build for production:
1. `npm run build`
