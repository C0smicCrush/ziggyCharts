// Background Service Worker for API calls
// Handles Data Commons API requests to avoid CORS issues

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_DATA_COMMONS') {
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
