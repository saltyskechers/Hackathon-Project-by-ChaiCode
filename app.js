// app.js — Frontend client that connects to backend Socket.IO
const socketUrl = 'http://localhost:3000'; // change if server hosted elsewhere
const socket = io(socketUrl);

const energyCtx = document.getElementById('energyChart').getContext('2d');
const occCtx = document.getElementById('occChart').getContext('2d');

const energyChart = new Chart(energyCtx, {
  type: 'line',
  data: { labels: [], datasets: [{ label: 'kW', data: [], tension:0.3 }]},
  options: { animation:false, responsive:true }
});
const occChart = new Chart(occCtx, {
  type: 'line',
  data: { labels: [], datasets: [{ label: 'people', data: [], tension:0.3 }]},
  options: { animation:false, responsive:true }
});

function pushPoint(chart, ts, val) {
  chart.data.labels.push(new Date(ts).toLocaleTimeString());
  chart.data.datasets[0].data.push(val);
  if (chart.data.labels.length > 40) { chart.data.labels.shift(); chart.data.datasets[0].data.shift(); }
  chart.update();
}

function addAlert(a) {
  const el = document.createElement('div');
  el.innerHTML = `<b>[${new Date(a.ts).toLocaleTimeString()}]</b> ${a.type} ${a.buildingId?`- ${a.buildingId}`:''} ${a.roomId?`- ${a.roomId}`:''}<div style="color:#444">${a.suggestion||a.note||''}</div>`;
  document.getElementById('alerts').prepend(el);
}

socket.on('connect', ()=>{ document.getElementById('status').innerText = 'connected'; console.log('connected'); });
socket.on('disconnect', ()=>{ document.getElementById('status').innerText = 'disconnected'; });

socket.on('energy', data => {
  if (data.building === 'EnggBlock') pushPoint(energyChart, data.ts, data.value);
});
socket.on('occupancy', data => {
  if (data.room === 'R101') pushPoint(occChart, data.ts, data.count);
});
socket.on('alert', a => addAlert(a));

socket.on('state', s => {
  try {
    const eng = s.energyStore && s.energyStore.EnggBlock || [];
    eng.slice(-40).forEach(pt => pushPoint(energyChart, pt.ts, pt.value));
    const r = s.occupancyStore && s.occupancyStore.R101 || [];
    r.slice(-40).forEach(pt => pushPoint(occChart, pt.ts, pt.count));
    s.alerts && s.alerts.forEach(addAlert);
  } catch(e) { console.warn(e); }
});

// UI controls
document.getElementById('clearAlerts').addEventListener('click', ()=>{ document.getElementById('alerts').innerHTML = ''; });
