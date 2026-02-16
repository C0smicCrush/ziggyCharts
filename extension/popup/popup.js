// Popup functionality
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved settings
  const settings = await loadSettings();
  
  // Set checkbox states
  document.getElementById('enabled').checked = settings.enabled !== false;
  document.getElementById('autoReplace').checked = settings.autoReplace !== false;
  document.getElementById('showFallback').checked = settings.showFallback !== false;

  // Load statistics
  const stats = await loadStats();
  document.getElementById('chartsCreated').textContent = stats.chartsCreated || 0;
  document.getElementById('aiOverviewsReplaced').textContent = stats.aiOverviewsReplaced || 0;

  // Add event listeners for settings
  document.getElementById('enabled').addEventListener('change', (e) => {
    saveSetting('enabled', e.target.checked);
  });

  document.getElementById('autoReplace').addEventListener('change', (e) => {
    saveSetting('autoReplace', e.target.checked);
  });

  document.getElementById('showFallback').addEventListener('change', (e) => {
    saveSetting('showFallback', e.target.checked);
  });
});

// Load settings from storage
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['enabled', 'autoReplace', 'showFallback'], (result) => {
      resolve(result);
    });
  });
}

// Save a setting
function saveSetting(key, value) {
  chrome.storage.sync.set({ [key]: value }, () => {
    console.log(`Setting ${key} saved:`, value);
  });
}

// Load statistics
async function loadStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['chartsCreated', 'aiOverviewsReplaced'], (result) => {
      resolve(result);
    });
  });
}
