const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static('public')); // Serve the frontend files

const LOG_FILE = path.join(__dirname, 'logs.json');

// Helper to read logs
const getLogs = () => {
    try {
        const data = fs.readFileSync(LOG_FILE);
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

// API Endpoint: Receive Tracking Data
app.post('/api/log', (req, res) => {
    const logEntry = {
        id: uuidv4(),
        ...req.body,
        timestamp: new Date().toISOString()
    };

    const logs = getLogs();
    logs.push(logEntry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

    console.log(`[TRACKED] User ${logEntry.id} at ${logEntry.lat || 'unknown'}, ${logEntry.lon || 'unknown'}`);

    // Optional: SMS alert logic goes here (using Twilio)

    res.json({ status: 'tracked', id: logEntry.id });
});

// API Endpoint: Get all logs for dashboard
app.get('/api/logs', (req, res) => {
    res.json(getLogs());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🕵️ Rat Tracker Backend running on port ${PORT}`);
});