// Content script to replace Google AI Overview with interactive charts
class ZiggyCharts {
  constructor() {
    this.dataCommons = new DataCommonsAPI();
    this.initialized = false;
    this.observer = null;
    this.chartCreated = false; // Prevent infinite loops
    this.processedElements = new Set(); // Track already processed elements
  }

  // Initialize the extension
  async init() {
    if (this.initialized) return;

    // Only run on the main "All" search results page.
    // Bail out on Images, Videos, News, Shopping, Books, etc.
    const params = new URLSearchParams(window.location.search);
    if (params.has('tbm') || params.has('udm')) {
      return;
    }
    
    console.log('ZiggyCharts: Initializing...');
    this.initialized = true;

    // Get search query
    const query = this.getSearchQuery();
    if (!query) {
      console.log('ZiggyCharts: No search query found');
      return;
    }

    console.log('ZiggyCharts: Query detected:', query);

    // Wait for page to load
    await this.waitForPageLoad();

    // Find and replace AI Overview
    this.findAndReplaceAIOverview(query);

    // Set up mutation observer to catch dynamically loaded AI overviews
    this.setupObserver(query);
  }

  // Get the search query from URL
  getSearchQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get('q') || '';
  }

  // Wait for page to be ready
  waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve);
      }
    });
  }

  // Find AI Overview elements and replace them
  async findAndReplaceAIOverview(query) {
    // Skip if we already created a chart
    if (this.chartCreated) {
      return;
    }

    let aiOverviewContainer = null;
    
    // Strategy 1: Look for the specific AI Overview container structure
    // Based on the HTML: <div class="EyBRub jUja0e" jscontroller="EYwa3d">
    const specificContainers = document.querySelectorAll('.EyBRub.jUja0e, div[jscontroller="EYwa3d"], div[data-mcpr][data-subtree="mfc"]');
    for (const container of specificContainers) {
      if (container.textContent.includes('AI Overview')) {
        aiOverviewContainer = container;
        console.log('ZiggyCharts: Found AI Overview via specific selector');
        break;
      }
    }
    
    // Strategy 2: If not found, look for divs containing "AI Overview" text
    if (!aiOverviewContainer) {
      const allDivs = document.querySelectorAll('div[data-hveid], div[jsname], c-wiz, div[jscontroller]');
      for (const element of allDivs) {
        const text = element.textContent;
        if ((text.includes('AI Overview') || text.includes('AI-generated')) && 
            element.querySelector('.heWuVc, .nk9vdc')) {
          aiOverviewContainer = element;
          console.log('ZiggyCharts: Found AI Overview via text search');
          break;
        }
      }
    }

    // If no AI Overview found, create chart at top anyway for relevant queries
    if (!aiOverviewContainer) {
      console.log('ZiggyCharts: No AI Overview found, checking if query is chart-worthy');
      const chartData = await this.dataCommons.getChartData(query);
      
      if (chartData && chartData.datasets.length > 0) {
        console.log('ZiggyCharts: Creating chart for relevant query');
        this.createChartAtTop(query, chartData);
      } else {
        console.log('ZiggyCharts: Query not relevant for charts');
      }
      return;
    }

    // Replace AI Overview with chart
    console.log('ZiggyCharts: Replacing AI Overview with chart');
    await this.replaceWithChart(aiOverviewContainer, query);
  }

  // Check if element looks like an AI Overview
  looksLikeAIOverview(element, text) {
    // Check for AI Overview indicators
    const indicators = [
      'ai overview',
      'generative ai',
      'ai-generated',
      'experimental',
      'learn more about',
      'sources across the web'
    ];

    const hasIndicator = indicators.some(indicator => text.includes(indicator));
    
    // Also check if element is large and prominent (typical for AI Overview)
    const rect = element.getBoundingClientRect();
    const isProminent = rect.height > 100 && rect.width > 300;

    return hasIndicator && isProminent;
  }

  // Replace element with chart
  async replaceWithChart(element, query) {
    try {
      // Check if already processed
      if (this.processedElements.has(element)) {
        console.log('ZiggyCharts: Element already processed, skipping');
        return;
      }
      
      // Mark as processed
      this.processedElements.add(element);
      
      // Disconnect observer to prevent infinite loop
      if (this.observer) {
        this.observer.disconnect();
        console.log('ZiggyCharts: Disconnected observer to prevent loops');
      }

      // Fetch chart data
      let chartData = await this.dataCommons.getChartData(query);

      // If no data, force fallback with title
      if (!chartData || !chartData.datasets || chartData.datasets.length === 0) {
        console.log('ZiggyCharts: No chart data, using fallback');
        chartData = {
          ...this.dataCommons.getFallbackData(),
          title: 'Data Visualization (Demo Mode)',
          metric: 'demo',
          location: 'usa'
        };
      }

      // Create chart container
      const chartContainer = this.createChartContainer(query, chartData);

      // Insert chart BEFORE the AI Overview, then remove AI Overview
      // This ensures proper positioning and pushes other content down
      element.parentNode.insertBefore(chartContainer, element);
      
      // Remove the AI Overview element
      element.style.display = 'none';
      element.remove();
      
      this.chartCreated = true;
      console.log('ZiggyCharts: Successfully replaced AI Overview with chart');
    } catch (error) {
      console.error('ZiggyCharts: Error creating chart:', error);
    }
  }

  // Create chart at top of results
  createChartAtTop(query, chartData) {
    const searchContainer = document.querySelector('#search') || 
                           document.querySelector('#center_col') ||
                           document.querySelector('#rso');

    if (!searchContainer) {
      console.log('ZiggyCharts: Could not find search container');
      return;
    }

    const chartContainer = this.createChartContainer(query, chartData);
    searchContainer.insertBefore(chartContainer, searchContainer.firstChild);
  }

  // Create the chart container HTML
  createChartContainer(query, chartData) {
    const container = document.createElement('div');
    container.className = 'ziggycharts-container';
    container.innerHTML = `
      <div class="ziggycharts-header">
        <div class="ziggycharts-title">
          <svg class="ziggycharts-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 3v18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M18 9l-5 5-4-4-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <h2>${chartData.title || 'Data Visualization'}</h2>
        </div>
        <div class="ziggycharts-badge">Data Commons</div>
      </div>
      <div class="ziggycharts-chart-wrapper">
        <canvas id="ziggycharts-canvas"></canvas>
      </div>
      <div class="ziggycharts-footer">
        <div class="ziggycharts-info">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span>${chartData.metric === 'demo' ? '⚠️ Demo mode - ' : ''}Data from <a href="https://datacommons.org" target="_blank">Data Commons</a> • 
          Replaced Google AI Overview with ZiggyCharts</span>
        </div>
        <button class="ziggycharts-download" onclick="window.ziggyChartsDownload()">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Download Data
        </button>
      </div>
    `;

    // Render chart after a brief delay to ensure DOM is ready
    setTimeout(() => {
      this.renderChart(container.querySelector('#ziggycharts-canvas'), chartData);
    }, 100);

    return container;
  }

  // Render the chart using Chart.js
  renderChart(canvas, chartData) {
    if (!canvas) {
      console.error('ZiggyCharts: Canvas element not found');
      return;
    }

    const ctx = canvas.getContext('2d');
    
    window.ziggyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: chartData.datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
          },
          title: {
            display: false
          },
          tooltip: {
            backgroundColor: '#202124',
            titleColor: '#fff',
            bodyColor: '#e8eaed',
            borderColor: '#5f6368',
            borderWidth: 0,
            padding: 10,
            cornerRadius: 8,
            titleFont: {
              size: 13,
              weight: '500',
              family: 'Google Sans, Roboto, sans-serif'
            },
            bodyFont: {
              size: 12,
              family: 'Google Sans, Roboto, sans-serif'
            },
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                const val = context.parsed.y;
                if (Math.abs(val) >= 1e12) {
                  label += (val / 1e12).toFixed(2) + ' trillion';
                } else if (Math.abs(val) >= 1e9) {
                  label += (val / 1e9).toFixed(2) + ' billion';
                } else if (Math.abs(val) >= 1e6) {
                  label += (val / 1e6).toFixed(2) + ' million';
                } else {
                  label += val.toLocaleString();
                }
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: '#70757a',
              font: { size: 11, family: 'Roboto, sans-serif' },
              maxTicksLimit: 10
            }
          },
          y: {
            beginAtZero: false,
            grid: {
              color: '#f1f3f4',
              drawBorder: false
            },
            ticks: {
              color: '#70757a',
              font: { size: 11, family: 'Roboto, sans-serif' },
              callback: function(value) {
                if (Math.abs(value) >= 1e12) return (value / 1e12).toFixed(0) + 'T';
                if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(0) + 'B';
                if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(0) + 'M';
                if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(0) + 'K';
                return value.toLocaleString();
              }
            }
          }
        }
      }
    });

    // Setup download functionality
    window.ziggyChartsDownload = () => {
      this.downloadChartData(chartData);
    };
  }

  // Download chart data as CSV
  downloadChartData(chartData) {
    let csv = 'Date,' + chartData.datasets.map(d => d.label).join(',') + '\n';
    
    chartData.labels.forEach((label, i) => {
      const row = [label];
      chartData.datasets.forEach(dataset => {
        row.push(dataset.data[i] || '');
      });
      csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chartData.title || 'data'}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Set up mutation observer to catch dynamic content
  setupObserver(query) {
    // Don't set up observer if we already created a chart
    if (this.chartCreated) {
      console.log('ZiggyCharts: Chart already created, skipping observer setup');
      return;
    }

    const targetNode = document.querySelector('#search') || 
                       document.querySelector('#center_col') || 
                       document.body;

    const config = {
      childList: true,
      subtree: true
    };

    let debounceTimer = null;

    this.observer = new MutationObserver((mutations) => {
      // Skip if chart already created
      if (this.chartCreated) {
        return;
      }

      // Debounce - only check once every 1 second
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            // Check if any added node is our chart (skip if so)
            const hasZiggyChart = Array.from(mutation.addedNodes).some(node => 
              node.classList && node.classList.contains('ziggycharts-container')
            );
            
            if (!hasZiggyChart) {
              this.findAndReplaceAIOverview(query);
            }
            break;
          }
        }
      }, 1000);
    });

    this.observer.observe(targetNode, config);
  }
}

// Check if we're on the main "All" results tab
function isMainSearchPage() {
  const params = new URLSearchParams(window.location.search);
  return !params.has('tbm') && !params.has('udm');
}

// Show/hide chart based on current tab
function updateChartVisibility() {
  const chart = document.querySelector('.ziggycharts-container');
  if (chart) {
    chart.style.display = isMainSearchPage() ? 'block' : 'none';
  }
}

// Initialize when DOM is ready
const ziggyInstance = new ZiggyCharts();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ziggyInstance.init());
} else {
  ziggyInstance.init();
}

// Listen for SPA navigation (Google uses History API for tab switches)
const origPushState = history.pushState;
history.pushState = function() {
  origPushState.apply(this, arguments);
  updateChartVisibility();
};

const origReplaceState = history.replaceState;
history.replaceState = function() {
  origReplaceState.apply(this, arguments);
  updateChartVisibility();
};

window.addEventListener('popstate', updateChartVisibility);
