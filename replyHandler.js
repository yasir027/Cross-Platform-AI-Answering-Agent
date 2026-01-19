async function sendReply(sock, chatId, text) {
    try {
        await sock.sendMessage(chatId, { text });
        console.log(`💬 Replied to ${chatId}: ${text}`);
    } catch (err) {
        console.error('❌ Error sending reply:', err.message);
    }
}

module.exports = { sendReply };
