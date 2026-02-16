# ZiggyCharts

A Chrome extension that replaces Google's AI Overview with interactive, data-driven charts powered by [Data Commons](https://datacommons.org).

## What it does

When you search Google for statistical queries (e.g. "fertility rate USA", "japan gdp per capita"), ZiggyCharts automatically replaces the AI Overview with an interactive Chart.js visualization using real data from Data Commons.

- **Real data** from Data Commons, not AI-generated summaries
- **Interactive charts** with hover, zoom, and CSV export
- **Dynamic metric resolution** — works with 5000+ metrics across 200+ countries, no hardcoding
- **Dark mode** support

## Install

1. Clone this repo
2. Open `chrome://extensions/` and enable Developer mode
3. Click "Load unpacked" and select the `extension/` folder
4. Search Google for something like "fertility rate USA"

## Project structure

```
extension/
├── manifest.json          # Extension config (Manifest V3)
├── scripts/
│   ├── content.js         # Main content script
│   ├── dataCommons.js     # Data Commons API integration
│   ├── background.js      # Service worker
│   └── chart.min.js       # Chart.js library
├── styles/
│   └── content.css        # Chart styling
├── popup/
│   ├── popup.html         # Settings UI
│   ├── popup.js
│   └── popup.css
└── icons/
    ├── icon.svg
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Tech stack

- **Chart.js 4.4.1** — visualization
- **Data Commons API** — data source
- **Chrome Extension Manifest V3**
- **Vanilla JS** — no framework dependencies

## Development

1. Edit files in `extension/`
2. Go to `chrome://extensions/` and click the refresh icon on ZiggyCharts
3. Reload the Google search page

## License

MIT
