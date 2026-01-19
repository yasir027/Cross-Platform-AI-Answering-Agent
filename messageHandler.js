const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const { sendReply } = require('./replyHandler');
const { saveMessage } = require('./utils');
const { parseServiceLocation, queryListings } = require('./wpSearch'); 
const { extractServiceLocation } = require('./AIParser'); 

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({ auth: state });
    sock.ev.on('creds.update', saveCreds);

    // --- Connection handling ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n📱 Scan this QR code with WhatsApp:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== 401;
            console.log('❌ Connection closed:', lastDisconnect?.error?.message);
            if (shouldReconnect) {
                console.log('🔄 Reconnecting...');
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
        }
    });

    // --- Message handling ---
    sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (!message.key.fromMe && m.type === 'notify') {
            if (message.key.remoteJid.endsWith('@g.us')) {
                try {
                    const groupMetadata = await sock.groupMetadata(message.key.remoteJid);
                    const groupName = groupMetadata.subject;

                    // Only process (group name) group
                    if (groupName.toLowerCase().includes('Group Name Enter') || groupName.toLowerCase().includes('Group Name')) {
                        const senderId = message.key.participant || message.key.remoteJid;
                        const senderNumber = senderId.split('@')[0];
                        let senderName = message.pushName || senderNumber;
                        const participant = groupMetadata.participants.find(p => p.id === senderId);
                        if (participant && participant.notify) senderName = participant.notify;

                        const text =
                            message.message?.conversation ||
                            message.message?.extendedTextMessage?.text ||
                            message.message?.imageMessage?.caption ||
                            message.message?.videoMessage?.caption ||
                            '[Media message]';
                        const timestamp = message.messageTimestamp;

                        console.log(`
=========================
📢 GROUP: ${groupName}
👤 FROM: ${senderName} (${senderNumber})
💬 MESSAGE: ${text}
🕒 TIME: ${new Date(timestamp * 1000).toLocaleString()}
=========================
`);

                        saveMessage(groupName, senderName, text, timestamp);

                       
// ------------------------------------------------------------
//(AI-based service/location detection)
// ------------------------------------------------------------
const intent = await extractServiceLocation(text);

if (intent && intent.service) {
    const { service, location, keywords } = intent;
    console.log(`🧠 AI model detected service="${service}" location="${location || 'N/A'}"`);

    // Try full phrase first
console.log(`🔍 [WP SEARCH] Searching WordPress for: service="${service}", location="${location}"`);

let results = await queryListings(service, location, 3);

console.log(`📥 [WP SEARCH RESULT] Received ${results.length} results for "${service}"`);

    // If no results, try partial keyword matches
    if (results.length === 0 && keywords?.length > 1) {
        console.log(`⚙️ No direct results. Trying partial matches for: [${keywords.join(', ')}]`);
        for (const word of keywords) {
            const partialResults = await queryListings(word, location, 2);
            results.push(...partialResults);
        }

        // Remove duplicate URLs (if any)
        results = results.filter(
            (v, i, a) => a.findIndex(t => t.url === v.url) === i
        );
    }

    // If still no matches, try the first word (broader search)
    if (results.length === 0 && service.includes(' ')) {
        const simplified = service.split(' ')[0];
        console.log(`🔍 Trying broader search for "${simplified}"`);
        results = await queryListings(simplified, location, 3);
    }

    if (results.length > 0) {
        let replyMsg = `✅ *Found ${results.length} result(s) for "${service}"${location ? ` near ${location}` : ''}:*\n\n`;
        for (const r of results) {
            replyMsg += `🔹 *${r.title}*\n🔗 ${r.url}\n`;
            if (r.phone) replyMsg += `📞 ${r.phone}\n`;
            if (r.excerpt) replyMsg += `📝 ${r.excerpt}\n`;
            replyMsg += `\n`;
        }
        await sendReply(sock, message.key.remoteJid, replyMsg.trim());
    } else {
        await sendReply(
            sock,
            message.key.remoteJid,
            `⚠️ No listings found for "${service}"${location ? ` near ${location}` : ''}.`
        );
    }
} else if (text.toLowerCase().includes('hello bot')) {
    await sendReply(sock, message.key.remoteJid, `Hi ${senderName}! I received: "${text}"`);
}


                        // ------------------------------------------------------------
                    }
                } catch (error) {
                    console.error('❌ Error processing group message:', error.message);
                }
            }
        }
    });
}

module.exports = { connectToWhatsApp };



