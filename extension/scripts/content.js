// Content script to replace Google AI Overview with interactive charts
class ZiggyCharts {
  constructor() {
    this.dataCommons = new DataCommonsAPI();
    this.initialized = false;
    this.observer = null;
    this.chartCreated = false;
    this.processedElements = new Set();
    // Comparison state
    this.chartInstance = null;
    this.currentVariableDCID = null;
    this.currentChartData = null;
    this.comparisonColors = [
      '#669df6', '#34a853', '#ea8600', '#d93025',
      '#a142f4', '#24c1e0', '#f538a0', '#5f6368'
    ];
    this.datasetCount = 0;
  }

  async init() {
    if (this.initialized) return;

    const params = new URLSearchParams(window.location.search);
    if (params.has('tbm') || params.has('udm')) {
      return;
    }
    
    console.log('ZiggyCharts: Initializing...');
    this.initialized = true;

    const query = this.getSearchQuery();
    if (!query) {
      console.log('ZiggyCharts: No search query found');
      return;
    }

    console.log('ZiggyCharts: Query detected:', query);
    await this.waitForPageLoad();
    this.findAndReplaceAIOverview(query);
    this.setupObserver(query);
  }

  getSearchQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get('q') || '';
  }

  waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve);
      }
    });
  }

  async findAndReplaceAIOverview(query) {
    if (this.chartCreated) return;

    let aiOverviewContainer = null;
    
    const specificContainers = document.querySelectorAll('.EyBRub.jUja0e, div[jscontroller="EYwa3d"], div[data-mcpr][data-subtree="mfc"]');
    for (const container of specificContainers) {
      if (container.textContent.includes('AI Overview')) {
        aiOverviewContainer = container;
        break;
      }
    }
    
    if (!aiOverviewContainer) {
      const allDivs = document.querySelectorAll('div[data-hveid], div[jsname], c-wiz, div[jscontroller]');
      for (const element of allDivs) {
        const text = element.textContent;
        if ((text.includes('AI Overview') || text.includes('AI-generated')) && 
            element.querySelector('.heWuVc, .nk9vdc')) {
          aiOverviewContainer = element;
          break;
        }
      }
    }

    if (!aiOverviewContainer) {
      const chartData = await this.dataCommons.getChartData(query);
      if (chartData && chartData.datasets.length > 0) {
        this.createChartAtTop(query, chartData);
      }
      return;
    }

    await this.replaceWithChart(aiOverviewContainer, query);
  }

  async replaceWithChart(element, query) {
    try {
      if (this.processedElements.has(element)) return;
      this.processedElements.add(element);
      
      if (this.observer) {
        this.observer.disconnect();
      }

      let chartData = await this.dataCommons.getChartData(query);

      if (!chartData || !chartData.datasets || chartData.datasets.length === 0) {
        chartData = {
          ...this.dataCommons.getFallbackData(),
          title: 'Data Visualization (Demo Mode)',
          metric: 'demo',
          location: 'usa'
        };
      }

      const chartContainer = this.createChartContainer(query, chartData);
      element.parentNode.insertBefore(chartContainer, element);
      element.style.display = 'none';
      element.remove();
      
      this.chartCreated = true;
    } catch (error) {
      console.error('ZiggyCharts: Error creating chart:', error);
    }
  }

  createChartAtTop(query, chartData) {
    const searchContainer = document.querySelector('#search') || 
                           document.querySelector('#center_col') ||
                           document.querySelector('#rso');
    if (!searchContainer) return;

    const chartContainer = this.createChartContainer(query, chartData);
    searchContainer.insertBefore(chartContainer, searchContainer.firstChild);
    this.chartCreated = true;
  }

  createChartContainer(query, chartData) {
    // Store the variable DCID for comparison compatibility checks
    this.currentVariableDCID = chartData._variableDCID || null;
    this.currentChartData = chartData;
    this.datasetCount = 1;

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
      <div class="ziggycharts-compare-bar">
        <input type="text" class="ziggycharts-compare-input" placeholder="Compare: e.g. france gdp, brazil gdp..." />
        <button class="ziggycharts-compare-btn">+ Compare</button>
      </div>
      <div class="ziggycharts-compare-status"></div>
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

    // Wire up comparison bar
    const input = container.querySelector('.ziggycharts-compare-input');
    const btn = container.querySelector('.ziggycharts-compare-btn');
    const status = container.querySelector('.ziggycharts-compare-status');

    const doCompare = () => {
      const val = input.value.trim();
      if (val) {
        this.addComparison(val, status);
        input.value = '';
      }
    };

    btn.addEventListener('click', doCompare);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doCompare();
      }
    });

    // Render chart
    setTimeout(() => {
      this.renderChart(container.querySelector('#ziggycharts-canvas'), chartData);
    }, 100);

    return container;
  }

  // Add a comparison dataset to the existing chart
  async addComparison(query, statusEl) {
    if (!this.chartInstance) {
      statusEl.textContent = 'No chart to compare against.';
      return;
    }

    statusEl.textContent = 'Loading...';
    statusEl.className = 'ziggycharts-compare-status';

    try {
      // Resolve the comparison query through Data Commons
      const newData = await this.dataCommons.getChartData(query);

      if (!newData || !newData.datasets || newData.datasets.length === 0) {
        statusEl.textContent = 'No data found for "' + query + '".';
        statusEl.className = 'ziggycharts-compare-status ziggycharts-compare-error';
        return;
      }

      // Check compatibility: same variable DCID means same unit/metric
      const newVarDCID = newData._variableDCID;
      if (this.currentVariableDCID && newVarDCID && this.currentVariableDCID !== newVarDCID) {
        statusEl.textContent = 'Different metric ("' + (newData.metric || query) + '" vs existing chart). Only same metrics can be compared.';
        statusEl.className = 'ziggycharts-compare-status ziggycharts-compare-error';
        return;
      }

      // Pick the next color
      const colorIdx = this.datasetCount % this.comparisonColors.length;
      const color = this.comparisonColors[colorIdx];
      this.datasetCount++;

      // Build the new dataset
      const newDataset = {
        label: newData.location || query,
        data: newData.datasets[0].data,
        borderColor: color,
        backgroundColor: color.replace(')', ', 0.05)').replace('rgb', 'rgba'),
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: '#292a2d',
        pointHoverBorderWidth: 2,
        tension: 0.35,
        fill: false
      };

      // Align labels: use the union of dates
      const existingLabels = this.chartInstance.data.labels;
      const newLabels = newData.labels;
      const allLabels = [...new Set([...existingLabels, ...newLabels])].sort();

      // Re-index all existing datasets to the merged label set
      for (const ds of this.chartInstance.data.datasets) {
        const oldData = {};
        existingLabels.forEach((lbl, i) => { oldData[lbl] = ds.data[i]; });
        ds.data = allLabels.map(lbl => oldData[lbl] ?? null);
      }

      // Index the new dataset to the merged label set
      const newDataMap = {};
      newLabels.forEach((lbl, i) => { newDataMap[lbl] = newData.datasets[0].data[i]; });
      newDataset.data = allLabels.map(lbl => newDataMap[lbl] ?? null);

      // Update chart
      this.chartInstance.data.labels = allLabels;
      this.chartInstance.data.datasets.push(newDataset);
      this.chartInstance.options.plugins.legend.display = true;
      this.chartInstance.options.spanGaps = true;
      this.chartInstance.update();

      // Update title
      const titleEl = document.querySelector('.ziggycharts-title h2');
      if (titleEl) {
        const places = this.chartInstance.data.datasets.map(ds => ds.label);
        const metricName = newData.metric || this.currentChartData?.metric || '';
        titleEl.textContent = metricName + ' — ' + places.join(' vs ');
      }

      statusEl.textContent = '✓ Added ' + (newData.location || query);
      statusEl.className = 'ziggycharts-compare-status ziggycharts-compare-ok';

    } catch (error) {
      console.error('ZiggyCharts: Comparison error:', error);
      statusEl.textContent = 'Error loading comparison data.';
      statusEl.className = 'ziggycharts-compare-status ziggycharts-compare-error';
    }
  }

  renderChart(canvas, chartData) {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    this.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: chartData.datasets.map((ds, i) => ({
          ...ds,
          label: chartData.location || ds.label
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 3.5,
        spanGaps: true,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
            position: 'top',
            labels: {
              color: '#9aa0a6',
              font: { size: 12, family: 'Google Sans, Roboto, sans-serif' },
              usePointStyle: true,
              pointStyle: 'line',
              padding: 16
            }
          },
          title: { display: false },
          tooltip: {
            backgroundColor: '#202124',
            titleColor: '#fff',
            bodyColor: '#e8eaed',
            borderWidth: 0,
            padding: 10,
            cornerRadius: 8,
            titleFont: { size: 13, weight: '500', family: 'Google Sans, Roboto, sans-serif' },
            bodyFont: { size: 12, family: 'Google Sans, Roboto, sans-serif' },
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                const val = context.parsed.y;
                if (val === null || val === undefined) return null;
                if (Math.abs(val) >= 1e12) label += (val / 1e12).toFixed(2) + ' trillion';
                else if (Math.abs(val) >= 1e9) label += (val / 1e9).toFixed(2) + ' billion';
                else if (Math.abs(val) >= 1e6) label += (val / 1e6).toFixed(2) + ' million';
                else label += val.toLocaleString();
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: '#9aa0a6',
              font: { size: 11, family: 'Roboto, sans-serif' },
              maxTicksLimit: 8,
              padding: 4
            }
          },
          y: {
            beginAtZero: false,
            grid: { color: 'rgba(154, 160, 166, 0.1)', drawBorder: false, lineWidth: 0.5 },
            border: { display: false },
            ticks: {
              color: '#9aa0a6',
              font: { size: 11, family: 'Roboto, sans-serif' },
              padding: 8,
              maxTicksLimit: 6,
              callback: function(value) {
                if (Math.abs(value) >= 1e12) return (value / 1e12).toFixed(1) + 'T';
                if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(1) + 'B';
                if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(1) + 'M';
                if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(0) + 'K';
                return value.toLocaleString();
              }
            }
          }
        }
      }
    });

    // Also store the chart reference globally for the download button
    window.ziggyChart = this.chartInstance;
    window.ziggyChartsDownload = () => {
      this.downloadChartData();
    };
  }

  downloadChartData() {
    if (!this.chartInstance) return;
    const chart = this.chartInstance;
    const labels = chart.data.labels;
    const datasets = chart.data.datasets;

    let csv = 'Date,' + datasets.map(d => d.label).join(',') + '\n';
    labels.forEach((label, i) => {
      const row = [label, ...datasets.map(d => d.data[i] ?? '')];
      csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ziggycharts_data.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  setupObserver(query) {
    if (this.chartCreated) return;

    const targetNode = document.querySelector('#search') || 
                       document.querySelector('#center_col') || 
                       document.body;

    let debounceTimer = null;

    this.observer = new MutationObserver((mutations) => {
      if (this.chartCreated) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            const hasZiggyChart = Array.from(mutation.addedNodes).some(node => 
              node.classList && node.classList.contains('ziggycharts-container')
            );
            if (!hasZiggyChart) this.findAndReplaceAIOverview(query);
            break;
          }
        }
      }, 1000);
    });

    this.observer.observe(targetNode, { childList: true, subtree: true });
  }
}

function isMainSearchPage() {
  const params = new URLSearchParams(window.location.search);
  return !params.has('tbm') && !params.has('udm');
}

function updateChartVisibility() {
  const chart = document.querySelector('.ziggycharts-container');
  if (chart) {
    chart.style.display = isMainSearchPage() ? 'block' : 'none';
  }
}

const ziggyInstance = new ZiggyCharts();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ziggyInstance.init());
} else {
  ziggyInstance.init();
}

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
