// Background Service Worker for API calls
// Handles Data Commons API requests to avoid CORS issues.
// Includes a response cache to prevent duplicate network calls.

const responseCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function cacheKey(url, method, body) {
  return `${method || 'GET'}::${url}::${body || ''}`;
}

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  // Evict expired entries periodically to avoid unbounded growth
  if (responseCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of responseCache) {
      if (now > v.expiresAt) responseCache.delete(k);
    }
  }
  responseCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_DATA_COMMONS') {
    const key = cacheKey(request.url, request.method, request.body);

    // Return cached response if available
    const cached = getCached(key);
    if (cached) {
      console.log('ZiggyCharts BG: Cache HIT for', request.url.substring(0, 80));
      sendResponse({ success: true, data: cached });
      return true;
    }

    // Fetch from Data Commons API
    const fetchOptions = {
      method: request.method || 'GET',
      headers: request.headers || {}
    };
    
    if (request.body) {
      fetchOptions.body = request.body;
    }
    
    fetch(request.url, fetchOptions)
      .then(response => response.json())
      .then(data => {
        setCache(key, data);
        sendResponse({ success: true, data });
      })
      .catch(error => {
        console.error('Background fetch error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll send response asynchronously
    return true;
  }
});
