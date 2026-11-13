/**
 * INSTAA - MULTI-DEVICE REAL-TIME LIVE LOCATION TRACKING SERVER
 * 
 * Powered by pure Node.js (Zero external npm dependencies required).
 * Provides:
 * 1. Static Web Server with HTTP & CORS support on 0.0.0.0:3000
 * 2. Real-Time Server-Sent Events (SSE) for sub-50ms Multi-Device Live Streaming
 * 3. Customer Live Location Sharing API (One-shot & Continuous watchPosition streaming)
 * 4. Multi-Device Real-Time Rider & Product Tracking Stream
 * 5. Persistent Order & Tracking State Storage (data/db.json)
 * 6. LAN Network Auto-Discovery (IP detection for Mobile Phone scanning)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-Memory Database & Tracking Sessions
let db = {
  state: {},
  orders: [],
  trackingSessions: {},
  systemConfig: {}
};

// Load existing DB if available
if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    db = JSON.parse(raw);
    db.orders = db.orders || [];
    db.trackingSessions = db.trackingSessions || {};
    db.state = db.state || {};
    console.log(`[INSTAA-SERVER] Loaded existing database with ${db.orders.length} orders.`);
  } catch (err) {
    console.warn('[INSTAA-SERVER] Warning reading db.json, initializing fresh store:', err.message);
  }
}

// Save database helper
let saveTimer = null;
function saveDatabase() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
      console.error('[INSTAA-SERVER] Failed to persist db.json:', e.message);
    }
  }, 400);
}

// Haversine distance in KM
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

// Bearing in degrees
function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return Math.round(bearing);
}

// Waypoints generator with rural roads curvature
function generateWaypoints(start, end, steps = 28) {
  const waypoints = [];
  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    const jitterLat = Math.sin(fraction * Math.PI) * 0.0018;
    const jitterLng = Math.cos(fraction * Math.PI) * 0.0012;
    const lat = start[0] + (end[0] - start[0]) * fraction + jitterLat;
    const lng = start[1] + (end[1] - start[1]) * fraction + jitterLng;
    waypoints.push([Number(lat.toFixed(6)), Number(lng.toFixed(6))]);
  }
  return waypoints;
}

// Get or initialize tracking session
function getOrCreateSession(orderId) {
  if (db.trackingSessions[orderId]) {
    return db.trackingSessions[orderId];
  }

  const order = db.orders.find(o => o.id === orderId) || {};
  const isInterTown = order.isInterTown || false;
  const storeCoords = [13.1986, 77.7066];
  const defaultCustCoords = isInterTown ? [13.2450, 77.7600] : [13.2080, 77.7190];
  const initialRiderCoords = [13.1920, 77.7010];

  const custLat = order.customerLat || defaultCustCoords[0];
  const custLng = order.customerLng || defaultCustCoords[1];

  const waypoints = generateWaypoints(storeCoords, [custLat, custLng], 28);
  const initialDistance = calculateDistanceKm(initialRiderCoords[0], initialRiderCoords[1], custLat, custLng);

  const session = {
    orderId: orderId,
    status: order.status || 'NEW',
    storeLocation: {
      lat: storeCoords[0],
      lng: storeCoords[1],
      name: order.storeName || 'FreshMart Superstore (Town A)',
      address: order.storeAddress || '108 Market Square, Rampur (Town A)'
    },
    customerLocation: {
      lat: custLat,
      lng: custLng,
      address: order.deliveryAddress || 'Rural Delivery Address, Town A',
      landmark: order.customerLandmark || '',
      accuracyMeters: order.customerAccuracy || 8,
      isLiveShared: Boolean(order.customerLocationShared),
      sharedAt: order.customerLocationSharedAt || null,
      source: order.customerLocationShared ? 'DEVICE_GPS' : 'DEFAULT',
      isContinuous: false
    },
    riderLocation: {
      lat: initialRiderCoords[0],
      lng: initialRiderCoords[1],
      speedKmh: 30,
      headingDeg: 45,
      accuracyMeters: 5,
      batteryPct: 92,
      lastUpdated: new Date().toISOString()
    },
    waypoints: waypoints,
    currentWaypointIndex: 0,
    distanceRemainingKm: initialDistance,
    etaMinutes: order.estimatedMinutes || Math.max(3, Math.round(initialDistance * 3.5 + 4)),
    createdAt: new Date().toISOString()
  };

  db.trackingSessions[orderId] = session;
  saveDatabase();
  return session;
}

// Connected SSE clients set
const sseClients = new Set();

// Broadcast event to all connected devices
function broadcastSSE(type, payload) {
  const data = JSON.stringify({
    type: type,
    payload: payload,
    timestamp: Date.now()
  });
  const message = `data: ${data}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Heartbeat keep-alive every 15s to keep mobile connections awake
setInterval(() => {
  const ping = `: ping ${Date.now()}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(ping);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}, 15000);

// Active server simulations
const activeSimulations = {};

function hasRecentRealGps(session) {
  const r = session && session.riderLocation;
  return !!(r && r.isRealGps && r.lastRealGpsAt && Date.now() - r.lastRealGpsAt < 30000);
}

function startServerRiderSimulation(orderId) {
  if (activeSimulations[orderId]) return;
  if (hasRecentRealGps(db.trackingSessions[orderId])) return;   // real rider GPS wins over the demo simulation

  const session = getOrCreateSession(orderId);
  if (!session.waypoints || session.waypoints.length === 0) return;

  activeSimulations[orderId] = setInterval(() => {
    let idx = session.currentWaypointIndex || 0;

    if (idx < session.waypoints.length - 1) {
      idx++;
      session.currentWaypointIndex = idx;
      const currentCoord = session.waypoints[idx];
      const nextCoord = session.waypoints[Math.min(idx + 1, session.waypoints.length - 1)];

      const bearing = calculateBearing(currentCoord[0], currentCoord[1], nextCoord[0], nextCoord[1]);
      const speed = Math.floor(26 + Math.random() * 10); // 26-36 km/h

      session.riderLocation.lat = currentCoord[0];
      session.riderLocation.lng = currentCoord[1];
      session.riderLocation.speedKmh = speed;
      session.riderLocation.headingDeg = bearing;
      session.riderLocation.lastUpdated = new Date().toISOString();

      const cust = session.customerLocation;
      session.distanceRemainingKm = calculateDistanceKm(currentCoord[0], currentCoord[1], cust.lat, cust.lng);
      session.etaMinutes = Math.max(1, Math.round(session.distanceRemainingKm * 3.2));

      db.trackingSessions[orderId] = session;
      saveDatabase();

      // Real-time broadcast to all devices
      broadcastSSE('RIDER_LOCATION_UPDATED', {
        orderId: orderId,
        riderLocation: session.riderLocation,
        distanceRemainingKm: session.distanceRemainingKm,
        etaMinutes: session.etaMinutes
      });
    } else {
      // Reached customer destination
      clearInterval(activeSimulations[orderId]);
      delete activeSimulations[orderId];
      session.distanceRemainingKm = 0.04;
      session.etaMinutes = 1;
      session.riderLocation.speedKmh = 0;
      db.trackingSessions[orderId] = session;
      saveDatabase();

      broadcastSSE('RIDER_ARRIVED_AT_CUSTOMER', {
        orderId: orderId,
        message: 'Rider has arrived at the shared customer delivery location!'
      });
    }
  }, 2200);
}

function stopServerRiderSimulation(orderId) {
  if (activeSimulations[orderId]) {
    clearInterval(activeSimulations[orderId]);
    delete activeSimulations[orderId];
  }
}

// Get non-internal LAN IPv4 address
function getLanIpAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        // Prefer Wi-Fi or standard LAN
        if (!name.toLowerCase().includes('vmware') && !name.toLowerCase().includes('virtual')) {
          return net.address;
        }
      }
    }
  }
  // Fallback to first non-internal
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// Helper to parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS Headers for all devices
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // =========================================================================
  // 1. REAL-TIME SERVER-SENT EVENTS (SSE) STREAM
  // =========================================================================
  if (pathname === '/api/tracking/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientsCount: sseClients.size + 1, timestamp: Date.now() })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // =========================================================================
  // 2. NETWORK & MULTI-DEVICE DISCOVERY API
  // =========================================================================
  if (pathname === '/api/network-info') {
    const lanIp = getLanIpAddress();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      lanIp: lanIp,
      port: PORT,
      localUrl: `http://localhost:${PORT}`,
      lanUrl: `http://${lanIp}:${PORT}`,
      connectedClients: sseClients.size,
      activeDeliveries: Object.keys(activeSimulations).length
    }));
    return;
  }

  // =========================================================================
  // 3. REAL-TIME TRACKING API (Customer Live Location Sharing & Receiving)
  // =========================================================================
  
  // GET /api/tracking/:orderId - Retrieve session
  const trackingGetMatch = pathname.match(/^\/api\/tracking\/([^/]+)$/);
  if (req.method === 'GET' && trackingGetMatch) {
    const orderId = trackingGetMatch[1];
    const session = getOrCreateSession(orderId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, session: session }));
    return;
  }

  // POST /api/tracking/:orderId/customer-location - Customer device shares live GPS
  const custLocMatch = pathname.match(/^\/api\/tracking\/([^/]+)\/customer-location$/);
  if (req.method === 'POST' && custLocMatch) {
    const orderId = custLocMatch[1];
    try {
      const data = await parseJsonBody(req);
      const session = getOrCreateSession(orderId);
      const now = new Date().toISOString();

      const newLat = Number(Number(data.lat).toFixed(6));
      const newLng = Number(Number(data.lng).toFixed(6));

      session.customerLocation = {
        lat: newLat,
        lng: newLng,
        address: data.address || session.customerLocation.address,
        landmark: data.landmark !== undefined ? data.landmark : session.customerLocation.landmark,
        accuracyMeters: Math.round(data.accuracy || 6),
        isLiveShared: true,
        sharedAt: now,
        source: data.source || 'DEVICE_GPS',
        isContinuous: Boolean(data.isContinuous)
      };

      // Recalculate route waypoints from current rider position to the new customer coordinates
      const riderPos = [session.riderLocation.lat, session.riderLocation.lng];
      session.waypoints = generateWaypoints(riderPos, [newLat, newLng], 28);
      session.currentWaypointIndex = 0;
      session.distanceRemainingKm = calculateDistanceKm(riderPos[0], riderPos[1], newLat, newLng);
      session.etaMinutes = Math.max(2, Math.round(session.distanceRemainingKm * 3.5 + 4));

      db.trackingSessions[orderId] = session;

      // Update matching master order if found
      const ordIdx = db.orders.findIndex(o => o.id === orderId);
      if (ordIdx !== -1) {
        db.orders[ordIdx].customerLat = newLat;
        db.orders[ordIdx].customerLng = newLng;
        db.orders[ordIdx].customerLocationShared = true;
        db.orders[ordIdx].customerLocationSharedAt = now;
        if (data.landmark) db.orders[ordIdx].customerLandmark = data.landmark;
      }
      saveDatabase();

      // Broadcast customer location instantly to Rider, Admin Radar, and Store!
      broadcastSSE('CUSTOMER_LOCATION_UPDATED', {
        orderId: orderId,
        customerLocation: session.customerLocation,
        distanceRemainingKm: session.distanceRemainingKm,
        etaMinutes: session.etaMinutes,
        waypoints: session.waypoints
      });

      console.log(`[INSTAA-TRACKING] Order #${orderId}: Live customer GPS shared (${newLat}, ${newLng}) ±${session.customerLocation.accuracyMeters}m`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Customer live location updated and broadcasted across all devices.',
        customerLocation: session.customerLocation,
        distanceRemainingKm: session.distanceRemainingKm,
        etaMinutes: session.etaMinutes
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/tracking/:orderId/rider-location - Rider device shares live coordinates
  const riderLocMatch = pathname.match(/^\/api\/tracking\/([^/]+)\/rider-location$/);
  if (req.method === 'POST' && riderLocMatch) {
    const orderId = riderLocMatch[1];
    try {
      const data = await parseJsonBody(req);
      const session = getOrCreateSession(orderId);

      const rLat = Number(Number(data.lat).toFixed(6));
      const rLng = Number(Number(data.lng).toFixed(6));

      session.riderLocation.lat = rLat;
      session.riderLocation.lng = rLng;
      session.riderLocation.speedKmh = data.speedKmh || 30;
      session.riderLocation.headingDeg = data.headingDeg !== undefined ? data.headingDeg : session.riderLocation.headingDeg;
      session.riderLocation.accuracyMeters = data.accuracyMeters || 5;
      if (data.real) {
        session.riderLocation.isRealGps = true;
        session.riderLocation.lastRealGpsAt = Date.now();
        session.riderLocation.source = 'REAL_GPS';
        stopServerRiderSimulation(orderId);
      }
      session.riderLocation.batteryPct = data.batteryPct || session.riderLocation.batteryPct;
      session.riderLocation.lastUpdated = new Date().toISOString();

      // Recalculate distance and ETA to customer
      const cust = session.customerLocation;
      session.distanceRemainingKm = calculateDistanceKm(rLat, rLng, cust.lat, cust.lng);
      session.etaMinutes = Math.max(1, Math.round(session.distanceRemainingKm * 3.2));

      db.trackingSessions[orderId] = session;
      saveDatabase();

      // Broadcast to customer and admin devices
      broadcastSSE('RIDER_LOCATION_UPDATED', {
        orderId: orderId,
        riderLocation: session.riderLocation,
        distanceRemainingKm: session.distanceRemainingKm,
        etaMinutes: session.etaMinutes
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, session: session }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/tracking/:orderId/simulation (start/stop)
  const simMatch = pathname.match(/^\/api\/tracking\/([^/]+)\/simulation$/);
  if (req.method === 'POST' && simMatch) {
    const orderId = simMatch[1];
    const data = await parseJsonBody(req);
    if (data.action === 'start') {
      startServerRiderSimulation(orderId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Server rider simulation running' }));
    } else {
      stopServerRiderSimulation(orderId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Server rider simulation stopped' }));
    }
    return;
  }

  // =========================================================================
  // 4. ORDERS & MULTI-DEVICE MASTER STATE SYNC API
  // =========================================================================

  // GET /api/orders
  if (pathname === '/api/orders' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, orders: db.orders }));
    return;
  }

  // POST /api/orders (Create order)
  if (pathname === '/api/orders' && req.method === 'POST') {
    try {
      const order = await parseJsonBody(req);
      db.orders.unshift(order);
      getOrCreateSession(order.id);
      saveDatabase();

      broadcastSSE('ORDER_CREATED', { order: order });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, order: order }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // PUT /api/orders/:orderId (Update order)
  const orderUpdateMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (req.method === 'PUT' && orderUpdateMatch) {
    const orderId = orderUpdateMatch[1];
    try {
      const updates = await parseJsonBody(req);
      const idx = db.orders.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        db.orders[idx] = { ...db.orders[idx], ...updates };
        saveDatabase();

        // If tracking session exists, update its status
        if (db.trackingSessions[orderId]) {
          db.trackingSessions[orderId].status = db.orders[idx].status;
        }

        // Auto-start server simulation when order is dispatched
        if (updates.status === 'DISPATCHED') {
          startServerRiderSimulation(orderId);
        }

        broadcastSSE('ORDER_STATUS_CHANGED', { orderId: orderId, order: db.orders[idx] });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, order: db.orders[idx] }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Order not found' }));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // =========================================================================
  // SHARED APP STATE (users, products, orders, wallets, notifications...)
  // Every device loads this at start and receives STATE_UPDATED events live.
  // =========================================================================
  if (pathname === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ success: true, state: db.state, trackingSessions: db.trackingSessions }));
    return;
  }

  if (pathname === '/api/state' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const key = String(body.key || '');
      if (!/^ssd_[a-z_]+$/.test(key) || ['ssd_current_user', 'ssd_cart', 'ssd_selected_town'].includes(key)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Key not syncable' }));
        return;
      }
      // ignore out-of-order writes from the same device
      db.stateSeq = db.stateSeq || {};
      const seqKey = `${body.clientId}:${key}`;
      if (body.seq !== undefined && db.stateSeq[seqKey] !== undefined && body.seq <= db.stateSeq[seqKey]) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ignored: true }));
        return;
      }
      db.stateSeq[seqKey] = body.seq;
      db.state[key] = body.value;
      if (key === 'ssd_orders' && Array.isArray(body.value)) db.orders = body.value;   // keep tracking logic in step
      saveDatabase();
      broadcastSSE('STATE_UPDATED', { key: key, value: body.value, clientId: body.clientId });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // GET /api/sync - Multi-device bootstrap sync
  if (pathname === '/api/sync' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      orders: db.orders,
      trackingSessions: db.trackingSessions,
      lanIp: getLanIpAddress(),
      port: PORT
    }));
    return;
  }

  // POST /api/sync - Client pushes initial storage seeds to server
  if (pathname === '/api/sync' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      if (Array.isArray(data.orders) && data.orders.length > 0) {
        // Merge without losing existing server orders
        const existingIds = new Set(db.orders.map(o => o.id));
        data.orders.forEach(ord => {
          if (!existingIds.has(ord.id)) {
            db.orders.push(ord);
          }
        });
      }
      if (data.trackingSessions && typeof data.trackingSessions === 'object') {
        db.trackingSessions = { ...data.trackingSessions, ...db.trackingSessions };
      }
      saveDatabase();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: db.orders.length }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // =========================================================================
  // 5. STATIC FILES SERVER
  // =========================================================================
  let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(__dirname, safePath);

  // Security check: must reside inside root
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>404 Not Found</h1><p>The requested file <code>${safePath}</code> was not found on this server.</p>`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// Start listening
server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIpAddress();
  console.log('================================================================');
  console.log('🚀 INSTAA MULTI-DEVICE REAL-TIME TRACKING SERVER IS RUNNING');
  console.log('================================================================');
  console.log(`📡 Local Access (This PC):    http://localhost:${PORT}`);
  console.log(`📱 Mobile / Multi-Device:     http://${lanIp}:${PORT}`);
  console.log('');
  console.log(`📍 Customer Live Tracking:    http://${lanIp}:${PORT}/customer/order-tracking.html?orderId=ORD-1000`);
  console.log(`🛵 Rider Active Delivery:     http://${lanIp}:${PORT}/rider/active-delivery.html`);
  console.log(`🏪 Store Order Management:    http://${lanIp}:${PORT}/store/order-management.html`);
  console.log(`🛰️ Admin Fleet Radar:        http://${lanIp}:${PORT}/admin/riders.html`);
  console.log('================================================================');
  console.log('⚡ Ready for Real-Time Multi-Device Live Location Sharing!');
  console.log('================================================================');
});

