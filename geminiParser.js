// openrouterParser.js
require('dotenv').config();
const fetch = require('node-fetch');

async function extractServiceLocation(message) {
  const ignorePhrases = ["hi", "hello", "hey", "thanks", "good morning", "good evening"];
  if (ignorePhrases.some(p => message.toLowerCase().includes(p))) return null;

  const prompt = `
You are an intent extractor for a business directory chatbot.

Your task:
1. From the user message, identify:
   - "service": the business, brand, or type of service they are looking for
   - "location": city or region if mentioned
2. If vague like "Supreme International" still classify it as service.
3. If it is casual talk and not a search query, return:
   { "ignore": true }

Strictly return JSON only. No extra text.

Message: "${message}"
`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",   // free compatible model, change if needed
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON found in response");

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    if (parsed.ignore) return null;

    const service = parsed.service?.trim() || null;
    const location = parsed.location?.trim() || null;
    if (!service) return null;

    const keywords = service
      .split(/\s+/)
      .map(k => k.toLowerCase())
      .filter(k => k.length > 2);

    return { service, location, keywords };

  } catch (err) {
    console.error("❌ OpenRouter parse error:", err.message);
    return null;
  }
}

module.exports = { extractServiceLocation };
