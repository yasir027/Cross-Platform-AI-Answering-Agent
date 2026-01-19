require('dotenv').config();
const axios = require('axios');

const WP_BASE_URL = process.env.WP_BASE_URL?.replace(/\/$/, '') || "https://theunitypro.com";

// --- Parse queries like "plumber in delhi" ---
function parseServiceLocation(text) {
  if (!text) return {};
  const t = text.toLowerCase();
  let service = null, location = null;

  const m = t.match(/(?:need|looking for|i need|please find)?\s*([a-z\s]+?)\s+(?:in|near|at|around)\s+([a-z\s]+)/i);
  if (m) {
    return { service: m[1].trim(), location: m[2].trim() };
  }

  const fallback = t.match(/^([a-z\s]+?)\s+([A-Za-z0-9\-\s]+)$/i);
  if (fallback) {
    return { service: fallback[1].trim(), location: fallback[2].trim() };
  }

  return { service: text.trim(), location: null };
}

// --- Helper to fetch from WP REST ---
async function fetchFromWP(endpoint, params = {}) {
  try {
    const url = new URL(`${WP_BASE_URL}/wp-json/wp/v2/${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    const { data } = await axios.get(url.toString());
    return data;
  } catch (err) {
    console.error(`❌ Error fetching ${endpoint}:`, err.message);
    return [];
  }
}

// --- Core function to query listings ---
async function queryListings(service, location, limit = 3) {
  if (!service) return [];

  const mainResults = await fetchFromWP("listing", { search: service, per_page: 10 });
  const catResults = await fetchFromWP("listing-category", { search: service, per_page: 10 });

  const categoryIds = catResults.map(c => c.id);
  let taxonomyListings = [];

  if (categoryIds.length) {
    const catListings = await fetchFromWP("listing", {
      'listing-category': categoryIds.join(','),
      per_page: 10
    });
    taxonomyListings = taxonomyListings.concat(catListings);
  }

  const combined = [...mainResults, ...taxonomyListings];
  const uniqueListings = Array.from(new Map(combined.map(l => [l.id, l])).values());

  let filtered = uniqueListings;
  if (location) {
    const lc = location.toLowerCase();
    filtered = filtered.filter(l => {
      const searchable = ((l.title?.rendered || '') + JSON.stringify(l)).toLowerCase();
      return searchable.includes(lc);
    });
  }

  return filtered.slice(0, limit).map(l => ({
    id: l.id,
    title: l.title?.rendered || 'Unknown',
    url: l.link || `${WP_BASE_URL}/?p=${l.id}`,
    excerpt: (l.excerpt?.rendered || '').replace(/<\/?[^>]+(>|$)/g, '').slice(0, 100)
  }));
}

module.exports = { parseServiceLocation, queryListings };
