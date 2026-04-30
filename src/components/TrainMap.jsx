import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default icon issues in Leaflet with Webpack/Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const TrainMap = ({ trains, searchQuery }) => {
  const position = [53.4808, -2.2426]; // Manchester center
  
  const filteredTrains = trains.filter(train => 
    train.headcode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <MapContainer center={position} zoom={7} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {filteredTrains.map((train) => (
        <Marker 
          key={train.id} 
          position={[train.latitude, train.longitude]}
        >
          <Tooltip permanent direction="top" offset={[0, -20]} className="delay-tooltip">
            <span style={{ 
              color: train.delay >= 0 ? (train.delay > 0 ? 'red' : 'green') : 'blue',
              fontWeight: 'bold',
              backgroundColor: 'white',
              padding: '2px 4px',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}>
              {train.delay > 0 ? `+${train.delay}` : (train.delay < 0 ? train.delay : 'On time')}
            </span>
          </Tooltip>
          <Popup>
            <div>
              <h3>{train.headcode}</h3>
              <p>Origin: {train.origin_name}</p>
              <p>Destination: {train.destination_name}</p>
              <p>Status: {train.status}</p>
              <p>Delay: {train.delay} mins</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default TrainMap;
