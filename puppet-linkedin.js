// puppet-linkedin.js
// Usage:
// 1) Save cookies: node puppet-linkedin.js --save-cookies
// 2) Run bot: node puppet-linkedin.js --bot

require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(__dirname, 'cookies_linkedin.json');
const SEEN_FILE = path.join(__dirname, 'seen_linkedin.json');
const GROUP_URL = 'https://www.linkedin.com/groups/16023047/';

const { extractServiceLocation } = require('./geminiParser');
const { queryListings } = require('./wpSearch');

function sleep(ms) { return new Promise(r=>setTimeout(r, ms)); }

async function saveCookiesFlow() {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
  const page = await browser.newPage();
  console.log('Open LinkedIn login in the browser window and login manually.');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle2' });
  console.log('After you log in and can access the group page, press ENTER here to save cookies.');
  await new Promise(resolve => process.stdin.once('data', resolve));
  const cookies = await page.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log('Saved cookies to', COOKIE_FILE);
  await browser.close();
  process.exit(0);
}

async function runBot() {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117 Safari/537.36');

  if (fs.existsSync(COOKIE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE));
    await page.setCookie(...cookies);
    console.log('Loaded LinkedIn cookies.');
  } else {
    console.error('No cookies found. Run with --save-cookies first.');
    await browser.close();
    process.exit(1);
  }

  let seen = new Set();
  if (fs.existsSync(SEEN_FILE)) {
    try { JSON.parse(fs.readFileSync(SEEN_FILE)).forEach(id => seen.add(id)); } catch {}
  }

  await page.goto(GROUP_URL, { waitUntil: 'networkidle2' });
  await sleep(3000);

  console.log('Watching LinkedIn group:', GROUP_URL);
  while (true) {
    try {
      // Posts in LinkedIn group often are article elements with data-urn or role="article"
      const posts = await page.$$eval('div.occludable-update', nodes => {
  return nodes.map(n => {
    const id = n.getAttribute('data-urn') ||
               n.querySelector('[data-urn]')?.getAttribute('data-urn') ||
               (n.innerText || '').slice(0, 60);

    const textEl = n.querySelector('span.break-words');
    const text = textEl ? textEl.innerText.trim() : (n.innerText || '').trim();

    return { id, text };
  });
});


      for (const p of posts) {
        if (!p.text) continue;
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        fs.writeFileSync(SEEN_FILE, JSON.stringify(Array.from(seen), null, 2));

        console.log('LinkedIn: New post:', p.text.slice(0,200));
        const intent = await extractServiceLocation(p.text);
        if (!intent || !intent.service) {
          console.log('LinkedIn: not a service query, skipping.');
          continue;
        }

        const { service, location, keywords } = intent;
        console.log(`LinkedIn: Detected service="${service}" location="${location || 'N/A'}"`);

        let results = await queryListings(service, location, 3);
        if (results.length === 0 && keywords?.length > 1) {
          for (const w of keywords) {
            const partial = await queryListings(w, location, 2);
            results.push(...partial);
          }
          results = results.filter((v,i,a)=> a.findIndex(t=>t.url===v.url)===i);
        }
        if (results.length === 0 && service.includes(' ')) {
          const simplified = service.split(' ')[0];
          results = await queryListings(simplified, location, 3);
        }

        if (results.length > 0) {
          const replyText = `Hi — found ${results.length} result(s) for "${service}"${location ? ` near ${location}` : ''}:\n` +
                            results.slice(0,3).map((r,i)=> `${i+1}. ${r.title} - ${r.url}`).join('\n');
          // Post comment on the post
          // You must find the comment button for this article. The selector below is heuristic.
          // FIXED COMMENTING SYSTEM - IMPROVED SELECTORS
try {
    console.log("LinkedIn: Attempting to comment...");

    // Scroll post into view
    await page.evaluate((postId, textSample) => {
        const posts = Array.from(document.querySelectorAll('div.occludable-update'));
        const target = posts.find(p => {
            const id = p.getAttribute('data-urn') || '';
            const text = p.innerText || '';
            return id.includes(postId) || text.includes(textSample);
        });

        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, p.id, p.text.slice(0, 30));

    await sleep(1200);

    // Get all post elements and find the matching one
    const allPosts = await page.$$('div.occludable-update');
    let targetPost = null;

    for (const post of allPosts) {
        const postText = await post.evaluate(el => el.innerText || '');
        const postId = await post.evaluate(el => el.getAttribute('data-urn') || '');
        
        if (postId.includes(p.id) || postText.includes(p.text.slice(0, 30))) {
            targetPost = post;
            break;
        }
    }

    if (!targetPost) {
        console.log("❗ Could not isolate post container to comment on it.");
        continue;
    }

    // CLICK THE COMMENT ICON - Multiple fallback selectors
    let commentBtn = await targetPost.$('button[aria-label*="Comment"]');
    
    if (!commentBtn) {
        commentBtn = await targetPost.$('button[aria-label*="comment"]');
    }
    
    if (!commentBtn) {
        // Try finding by data-test-id or other attributes
        commentBtn = await targetPost.$('button[data-test-id*="comment"]');
    }
    
    if (!commentBtn) {
        // Last resort: find all buttons and look for comment-related ones
        const allButtons = await targetPost.$$('button');
        for (const btn of allButtons) {
            const ariaLabel = await btn.evaluate(el => el.getAttribute('aria-label') || '');
            if (ariaLabel.toLowerCase().includes('comment')) {
                commentBtn = btn;
                break;
            }
        }
    }

    if (!commentBtn) {
        console.log("❗ Comment icon not found — skipping.");
        continue;
    }

    await commentBtn.click();
    await sleep(1500);

    // SELECT COMMENT BOX - More specific selectors
    let commentBox = await targetPost.$('div[role="textbox"][contenteditable="true"]');
    
    if (!commentBox) {
        // Try finding within the entire page if not within post context
        commentBox = await page.$('div[role="textbox"][contenteditable="true"]');
    }
    
    if (!commentBox) {
        // Try alternative selector
        commentBox = await page.$('.ql-editor');
    }

    if (!commentBox) {
        console.log("❗ Comment box not found.");
        continue;
    }

    await commentBox.focus();
    await commentBox.type(replyText, { delay: 18 });
    await sleep(600);

    // FIND REAL COMMENT BUTTON - Try multiple selectors in order
    let postCommentBtn = null;

    // Try 1: Post button in comment dialog
    postCommentBtn = await page.$('button.comments-comment-box__submit-button');
    
    if (!postCommentBtn) {
        // Try 2: Primary button with Post label
        const primaryButtons = await page.$$('button.artdeco-button--primary');
        for (const btn of primaryButtons) {
            const text = await btn.evaluate(el => el.innerText || el.textContent || '');
            if (text.toLowerCase().includes('post') || text.toLowerCase().includes('comment')) {
                postCommentBtn = btn;
                break;
            }
        }
    }

    if (!postCommentBtn) {
        // Try 3: Any button with Post in aria-label
        const allPageButtons = await page.$$('button');
        for (const btn of allPageButtons) {
            const ariaLabel = await btn.evaluate(el => el.getAttribute('aria-label') || '');
            const innerText = await btn.evaluate(el => el.innerText || '');
            if (ariaLabel.toLowerCase().includes('post') || innerText.toLowerCase().includes('post')) {
                postCommentBtn = btn;
                break;
            }
        }
    }

    if (postCommentBtn) {
        await postCommentBtn.click();
        console.log("✅ LinkedIn: Comment posted successfully!");
    } else {
        // Last fallback: keyboard shortcut
        console.log("⚠ Comment button not found, trying keyboard Enter...");
        await page.keyboard.press("Enter");
    }

} catch (err) {
    console.error("❗ LinkedIn comment error:", err.message);
}
        } else {
          console.log('LinkedIn: No listings found for', service);
        }
        await sleep(1200);
      }

    } catch (err) {
      console.error('LinkedIn loop error:', err.message);
    }
    await sleep(5000 + Math.floor(Math.random()*3000));
  }
}

const arg = process.argv[2];
if (arg === '--save-cookies') {
  saveCookiesFlow();
} else if (arg === '--bot') {
  runBot();
} else {
  console.log('Usage: node puppet-linkedin.js --save-cookies  OR  node puppet-linkedin.js --bot');
  process.exit(0);
}
