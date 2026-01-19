// puppet-instagram.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const COOKIE_FILE = path.join(__dirname, 'cookies_instagram.json');
const SEEN_FILE = path.join(__dirname, 'seen_instagram.json');

const THREAD_URL = "https://www.instagram.com/direct/t/456498319861498/"; // Your Group URL

const { extractServiceLocation } = require('./AIParser');
const { queryListings } = require('./wpsearch');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function logMessage(msg) {
  fs.appendFileSync("ig_logs.txt", `[${new Date().toISOString()}] ${msg}\n`);
}

// ------------------ SAVE COOKIES ------------------
async function saveCookiesFlow() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null
  });

  const page = await browser.newPage();
  await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2" });

  console.log("Login manually, then go to the DM thread, then press ENTER here.");
  await new Promise((resolve) => process.stdin.once("data", resolve));

  const cookies = await page.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));

  console.log("✅ Cookies saved.");
  await browser.close();
  process.exit(0);
}

// ------------------ BOT START ------------------
async function runBot() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  // Load cookies
  if (fs.existsSync(COOKIE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE));
    await page.setCookie(...cookies);
  } else {
    console.log("Run with --save-cookies first.");
    process.exit(1);
  }

  // Load seen messages
  let seen = new Set();
  if (fs.existsSync(SEEN_FILE)) {
    seen = new Set(JSON.parse(fs.readFileSync(SEEN_FILE)));
  }

  // Open the DM thread
  await page.goto(THREAD_URL, { waitUntil: "networkidle2" });
  await sleep(2500);

  console.log("▶ Watching Instagram thread...");

  while (true) {
    try {
      // -----------------------------
      // FETCH MESSAGES FROM DOM
      // -----------------------------
      const messages = await page.evaluate(() => {
        const bubbles = document.querySelectorAll("div[role='none'] span[dir='auto']");
        return Array.from(bubbles).map(n => n.innerText.trim()).filter(Boolean);
      });

      // -----------------------------
      // PROCESS NEW MESSAGES
      // -----------------------------
      for (const text of messages) {
        const id = text.slice(0, 80); // simple ID

        if (seen.has(id)) continue;
        seen.add(id);
        fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen], null, 2));

        console.log("📩 New IG message:", text);
        logMessage(`NEW: ${text}`);

        // ------------------------
        // GEMINI PARSER
        // ------------------------
        const intent = await extractServiceLocation(text);

        if (!intent || !intent.service) {
          console.log("⏭ Not a service query.");
          continue;
        }

        const { service, location, keywords } = intent;
        console.log(`🔍 Query: service="${service}", location="${location || 'N/A'}"`);

        // ------------------------
        // SEARCH LISTINGS
        // ------------------------
        let results = await queryListings(service, location, 3);

        // Fallback keyword-based matching
        if (results.length === 0 && Array.isArray(keywords)) {
          for (const k of keywords) {
            const partial = await queryListings(k, location, 2);
            results.push(...partial);
          }
          results = [...new Map(results.map(r => [r.url, r])).values()];
        }

        // Fallback: use first word
        if (results.length === 0 && service.includes(" ")) {
          const first = service.split(" ")[0];
          results = await queryListings(first, location, 3);
        }

        if (!results.length) {
          console.log("❌ No matches found.");
          logMessage(`NO RESULTS: ${text}`);
          continue;
        }

        // ------------------------
        // PREPARE REPLY TEXT
        // ------------------------
        let reply = `Found ${results.length} result(s) for "${service}":\n\n`;

        results.slice(0, 3).forEach((r, i) => {
          reply += `${i + 1}. ${r.title}\n${r.url}\n${r.phone ? "📞 " + r.phone : ""}\n\n`;
        });

       // ------------------------
// SEND MESSAGE (FIXED)
// ------------------------
// SEND MESSAGE
const inputSelector = 'div[role="textbox"][contenteditable="true"]';
// ----------------------------------------
// CHECK IF REPLY WAS ALREADY SENT
// ----------------------------------------
const lastReplyFile = path.join(__dirname, "last_reply.txt");
let lastReply = "";

if (fs.existsSync(lastReplyFile)) {
  lastReply = fs.readFileSync(lastReplyFile, "utf8").trim();
}

// If same as last reply → skip sending
if (lastReply === reply.trim()) {
  console.log("⛔ Duplicate reply detected — not sending again.");
  logMessage("SKIPPED DUPLICATE REPLY");
  continue; // stop this loop iteration
}

await page.waitForSelector(inputSelector, { timeout: 15000 });

await page.focus(inputSelector);
await page.type(inputSelector, reply, { delay: 18 });
await page.keyboard.press("Enter");
// Save last reply
fs.writeFileSync(lastReplyFile, reply.trim());



console.log("📤 Reply sent.");
logMessage(`REPLY: ${reply}`);

await sleep(1500);

      }

    } catch (err) {
      console.error("⚠ BOT ERROR:", err.message);
      logMessage(`ERROR: ${err.message}`);
    }

    await sleep(3500);
  }
}


const arg = process.argv[2];

if (arg === "--save-cookies") {
  saveCookiesFlow();
} else if (arg === "--bot") {
  runBot();
} else {
  console.log("Usage:");
  console.log(" node puppet-instagram.js --save-cookies");
  console.log(" node puppet-instagram.js --bot");
}

