// server.js
// Smart Campus backend simulator + decision brain
// Run: npm install && node server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

/* -----------------------
  In-memory stores
------------------------*/
const energyStore = {}; // { buildingId: [ {ts, value} ] }
const occupancyStore = {}; // { roomId: [ {ts, count} ] }
const alerts = []; // recent alerts

/* -----------------------
  Config & helpers
------------------------*/
const ROLLING_WINDOW = 12; // number of recent points to inspect
function now() { return new Date().toISOString(); }

function appendStore(store, key, item, maxLen=500) {
  if (!store[key]) store[key] = [];
  store[key].push(item);
  if (store[key].length > maxLen) store[key].shift();
}

/* -----------------------
  Anomaly detection: energy
  simple z-score based
------------------------*/
function detectEnergyAnomaly(buildingId) {
  const arr = energyStore[buildingId] || [];
  if (arr.length < 4) return null;
  const window = arr.slice(-ROLLING_WINDOW);
  const values = window.map(x => x.value);
  const mean = values.reduce((a,b)=>a+b,0)/values.length;
  const variance = values.reduce((a,b)=>a + (b-mean)*(b-mean),0)/values.length;
  const std = Math.sqrt(variance);
  const last = values[values.length-1];
  if (std === 0) {
    if (last > mean * 1.5) {
      const a = {ts: now(), buildingId, type: 'energy-spike', value: last, note: 'Sudden spike compared to stable baseline'};
      alerts.push(a); io.emit('alert', a); return a;
    }
    return null;
  }
  const z = (last - mean)/std;
  if (Math.abs(z) >= 3) {
    const a = {ts: now(), buildingId, type: 'energy-anomaly', z: Number(z.toFixed(2)), value: last, mean: Number(mean.toFixed(2)), std: Number(std.toFixed(2))};
    alerts.push(a); io.emit('alert', a); return a;
  }
  return null;
}

/* -----------------------
  Occupancy suggestions
------------------------*/
function occupancySuggestion(roomId) {
  const arr = occupancyStore[roomId] || [];
  if (arr.length < 3) return null;
  const recent = arr.slice(-3).map(x=>x.count);
  const avg = recent.reduce((a,b)=>a+b,0)/recent.length;
  const cap = roomCapacities[roomId] || 100; // default
  if (avg < cap * 0.15) {
    const s = {ts: now(), roomId, type: 'low-utilization', avg: Math.round(avg), suggestion: 'Consider consolidating small classes or releasing this room'};
    alerts.push(s); io.emit('alert', s); return s;
  }
  if (avg > cap * 0.9) {
    const s = {ts: now(), roomId, type: 'high-utilization', avg: Math.round(avg), suggestion: 'High demand - open overflow or schedule extra slot'};
    alerts.push(s); io.emit('alert', s); return s;
  }
  return null;
}

/* -----------------------
  Simulators: produces virtual sensor data
------------------------*/
const BUILDINGS = ['EnggBlock','Library','Admin','CSBlock'];
const ROOMS = ['R101','R102','LabA','Hall1'];

const roomCapacities = { R101: 40, R102: 40, LabA: 30, Hall1: 200 };

function simulateOnce() {
  const ts = new Date().toISOString();

  // Energy: base consumption per building + noise
  BUILDINGS.forEach(b => {
    const base = {EnggBlock: 80, Library: 30, Admin: 15, CSBlock: 60}[b] || 20;
    const hour = (new Date()).getHours();
    const dayFactor = (hour >= 8 && hour <= 18) ? 1.0 : 0.4;
    const spike = Math.random() < 0.015 ? (Math.random()*200) : 0;
    const value = Math.max(0, base * dayFactor * (0.8 + Math.random()*0.6) + spike);
    appendStore(energyStore, b, {ts, value: Number(value.toFixed(2))});
    io.emit('energy', {building: b, ts, value: Number(value.toFixed(2))});
    detectEnergyAnomaly(b);
  });

  // Occupancy: random counts with peaks in day
  ROOMS.forEach(r => {
    const hour = (new Date()).getHours();
    const dayFactor = (hour >= 9 && hour <= 17) ? 1.0 : 0.12;
    const capacity = roomCapacities[r] || 40;
    const avg = capacity * (0.2 + Math.random()*0.8) * dayFactor;
    const count = Math.max(0, Math.round(avg));
    appendStore(occupancyStore, r, {ts, count});
    io.emit('occupancy', {room: r, ts, count});
    occupancySuggestion(r);
  });
}

// run simulator every 5 seconds (demo speed)
setInterval(simulateOnce, 5000);
simulateOnce();

/* -----------------------
  REST endpoints: provide recent data & alerts
------------------------*/
app.get('/api/energy/:building/recent', (req, res) => {
  const b = req.params.building;
  res.json(energyStore[b] || []);
});

app.get('/api/occupancy/:room/recent', (req, res) => {
  const r = req.params.room;
  res.json(occupancyStore[r] || []);
});

app.get('/api/alerts/recent', (req, res) => {
  res.json(alerts.slice(-200));
});

app.get('/', (req,res) => {
  res.send('Smart Campus backend running. Connect via Socket.IO.');
});

/* -----------------------
 Socket.IO: emits 'energy', 'occupancy', 'alert' events
------------------------*/
io.on('connection', socket => {
  console.log('client connected', socket.id);
  socket.emit('hello', {msg: 'welcome', ts: now()});
  socket.emit('state', {energyStore, occupancyStore, alerts: alerts.slice(-50)});
});

server.listen(PORT, () => console.log('Server listening on', PORT));
