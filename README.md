Social AI Automation Bot

WhatsApp · Instagram · LinkedIn Community Auto-Responder

This project monitors WhatsApp messages, Instagram DMs, and LinkedIn group posts, uses AI to understand service requests, searches listings, and automatically replies with relevant results.

✨ Features

- AI-based intent & location extraction

- Centralized message handling logic

- Puppeteer-based Instagram & LinkedIn automation

- Directory / website listing search integration

- Loop protection (no duplicate replies)

Installation
Clone the repository
```
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
```
2️⃣ Install dependencies
```
npm install
```
3️⃣ Create .env file

Create a .env file in the root directory:
```
GEMINI_API_KEY=your_api_key_here
```

⚠️ Never commit .env to GitHub.

📁 Project Structure & File Purpose
```
├── .env
├── index.js
├── AIParser.js
├── messageHandler.js
├── replyHandler.js
├── wpSearch.js
├── puppet-instagram.js
├── puppet-linkedin.js
├── listmodels.js
```

.env

Stores environment variables such as API keys.
Required for AI parsing to work.

index.js

Main entry point of the project.
Used to initialize or test core logic and handlers.

AIParser.js

Use Gemini (or other AI) to extract intent, service, location, and keywords.
Turns raw user messages into structured data.

messageHandler.js

Central brain of the system (WhatsApp-ready).
Decides if and how to reply based on message content.

replyHandler.js

Formats and controls reply behavior.
Helps avoid loops and repeated responses.

wpSearch.js

Searches websites / directories for relevant service listings.
Returns titles and URLs used in replies.

puppet-instagram.js

Instagram automation using Puppeteer.
Reads DMs or group messages and sends replies automatically.

puppet-linkedin.js

LinkedIn group automation using Puppeteer.
Detects new posts, opens comment dialogs, and posts replies.

listmodels.js

Utility file for listing available AI models.
Used mainly for testing or debugging AI setup.

How to Run
- WhatsApp logic (manual / API-based)
node index.js


(WhatsApp sending logic plugs into messageHandler.js)

- Instagram Bot

Save login cookies:
```
node puppet-instagram.js --save-cookies
```

Run the bot:
```
node puppet-instagram.js --bot
```
-  LinkedIn Bot

Save login cookies:
```
node puppet-linkedin.js --save-cookies
```

Run the bot:
```
node puppet-linkedin.js --bot
```
⚠️ Important Notes

Run Puppeteer bots one at a time

Keep Chrome open while bots run

UI selectors may change — update if LinkedIn/Instagram changes UI

This project is for educational / internal automation use
