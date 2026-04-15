// Background Service Worker for API calls
// Handles Data Commons API requests to avoid CORS issues

// Only allow requests to known Data Commons domains
const ALLOWED_ORIGINS = [
  'https://api.datacommons.org',
  'https://datacommons.org'
];

function isAllowedURL(url) {
  try {
    const parsed = new URL(url);
    return ALLOWED_ORIGINS.some(
      (origin) => parsed.origin === origin
    );
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_DATA_COMMONS') {
    // Validate the target URL against the allowlist
    if (!isAllowedURL(request.url)) {
      sendResponse({ success: false, error: 'URL not in allowed origins' });
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
