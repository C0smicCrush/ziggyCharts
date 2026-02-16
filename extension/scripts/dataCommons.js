// Data Commons API Integration
// Query goes to Data Commons raw. We only filter the response data.
class DataCommonsAPI {
  constructor() {
    this.apiBase = 'https://api.datacommons.org';
    this.detectAndFulfillURL = 'https://datacommons.org/api/explore/detect-and-fulfill';
    this.observationEndpoint = `${this.apiBase}/v2/observation`;
    this.apiKey = 'AIzaSyCTI4Xz-UW_G2Q2RfknhcfdAnTHq5X5XuI';
  }

  async getChartData(query) {
    try {
      console.log('ZiggyCharts: Raw query →', query);

      // Pass the raw query to Data Commons detect-and-fulfill.
      // This is the same endpoint datacommons.org uses for its own explore page.
      // DC handles all understanding — place, variable, everything.
      const detection = await this.detectFromQuery(query);

      if (!detection) {
        console.log('ZiggyCharts: DC could not interpret this query');
        return null;
      }

      const { place, variable } = detection;
      console.log('ZiggyCharts: DC detected →', place.name, '+', variable.name,
                   '(', place.dcid, ',', variable.dcid, ')');

      // Fetch time-series observations for what DC resolved
      const data = await this.fetchObservations(place.dcid, variable.dcid);

      if (!data || !data.labels || data.labels.length === 0) {
        console.log('ZiggyCharts: No observation data for resolved place/variable');
        return null;
      }

      return {
        ...data,
        title: `${variable.name} - ${place.name}`,
        metric: variable.name,
        location: place.name,
        _variableDCID: variable.dcid
      };

    } catch (error) {
      console.error('ZiggyCharts: Error:', error);
      return null;
    }
  }

  // Send the raw query to Data Commons NL API — no preprocessing whatsoever.
  // DC website passes the query as a URL param `q` and context in the POST body.
  async detectFromQuery(query) {
    try {
      const url = `${this.detectAndFulfillURL}?q=${encodeURIComponent(query)}`;

      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_DATA_COMMONS',
        url: url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextHistory: [],
          dc: ''
        })
      });

      if (!response.success || !response.data) {
        console.log('ZiggyCharts: DC detect call failed:', response.error);
        return null;
      }

      const result = response.data;
      console.log('ZiggyCharts: DC response — place:', result.place?.name,
                   '| categories:', result.config?.categories?.length || 0);

      return this.parseDetection(result);

    } catch (error) {
      console.error('ZiggyCharts: DC detect error:', error);
      return null;
    }
  }

  // Parse DC's response to extract the place and best LINE chart variable.
  parseDetection(result) {
    const placeInfo = result.place;
    if (!placeInfo || !placeInfo.dcid) {
      console.log('ZiggyCharts: DC did not detect a place');
      return null;
    }

    const categories = result.config?.categories;
    if (!categories || categories.length === 0) {
      console.log('ZiggyCharts: DC did not return any chart categories');
      return null;
    }

    // Collect ALL LINE tile statVarKeys across all categories
    const allLineVarKeys = [];
    for (const category of categories) {
      for (const block of (category.blocks || [])) {
        for (const col of (block.columns || [])) {
          for (const tile of (col.tiles || [])) {
            if (tile.type === 'LINE' && tile.statVarKey?.length > 0) {
              for (const key of tile.statVarKey) {
                allLineVarKeys.push({ key, category });
              }
            }
          }
        }
      }
    }

    if (allLineVarKeys.length === 0) {
      console.log('ZiggyCharts: No LINE chart tiles found in DC response');
      return null;
    }

    // Resolve all keys to their actual stat var specs
    const resolved = [];
    for (const { key, category } of allLineVarKeys) {
      const spec = category.statVarSpec?.[key];
      if (spec && spec.statVar) {
        resolved.push({
          dcid: spec.statVar,
          name: spec.name || null
        });
      }
    }

    if (resolved.length === 0) {
      console.log('ZiggyCharts: Could not resolve any statVarKeys');
      return null;
    }

    console.log('ZiggyCharts: Found', resolved.length, 'LINE variables:',
      resolved.map(v => v.dcid));

    // Pick the best one: prefer direct measurements over derived ratios/indices.
    // "AsAFractionOf" in a DCID means it's a ratio/index, not an absolute value.
    // If a non-ratio version exists, prefer it.
    let best = resolved[0];
    const nonRatio = resolved.filter(v => !v.dcid.includes('AsAFractionOf'));
    if (nonRatio.length > 0) {
      best = nonRatio[0];
    }

    console.log('ZiggyCharts: Selected variable:', best.dcid);

    return {
      place: {
        dcid: placeInfo.dcid,
        name: placeInfo.name || placeInfo.dcid.split('/').pop()
      },
      variable: {
        dcid: best.dcid,
        name: best.name || this.cleanVariableName(best.dcid)
      }
    };
  }

  // Fetch observations from Data Commons
  async fetchObservations(placeDCID, variableDCID) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_DATA_COMMONS',
        url: this.observationEndpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          date: '',
          variable: { dcids: [variableDCID] },
          entity: { dcids: [placeDCID] },
          select: ['date', 'entity', 'variable', 'value']
        })
      });

      if (!response.success || !response.data) return null;
      return this.parseObservationData(response.data, variableDCID, placeDCID);

    } catch (error) {
      console.error('ZiggyCharts: Observation error:', error);
      return null;
    }
  }

  // Filter and format the observation data for charting
  parseObservationData(data, variableDCID, placeDCID) {
    try {
      const facets = data.byVariable?.[variableDCID]?.byEntity?.[placeDCID]?.orderedFacets;
      if (!facets || facets.length === 0) return null;

      const observations = facets[0].observations;
      if (!observations || observations.length === 0) return null;

      // Sort chronologically
      const sorted = observations.sort((a, b) => a.date.localeCompare(b.date));

      console.log('ZiggyCharts: Got', sorted.length, 'observations');

      return {
        labels: sorted.map(o => o.date),
        datasets: [{
          label: this.cleanVariableName(variableDCID),
          data: sorted.map(o => parseFloat(o.value)),
          borderColor: '#669df6',
          backgroundColor: 'rgba(102, 157, 246, 0.1)',
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#669df6',
          pointHoverBorderColor: '#292a2d',
          pointHoverBorderWidth: 2,
          tension: 0.35,
          fill: true
        }]
      };
    } catch (error) {
      console.error('ZiggyCharts: Parse error:', error);
      return null;
    }
  }

  // Format a variable DCID for display
  cleanVariableName(dcid) {
    return dcid
      .replace(/Amount_EconomicActivity_GrossDomesticProduction_Nominal_PerCapita/i, 'GDP Per Capita')
      .replace(/Amount_EconomicActivity_GrossDomesticProduction_Nominal/i, 'GDP')
      .replace(/FertilityRate_Person_Female/i, 'Fertility Rate')
      .replace(/Count_Person/i, 'Population')
      .replace(/UnemploymentRate_Person/i, 'Unemployment Rate')
      .replace(/LifeExpectancy_Person/i, 'Life Expectancy')
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim();
  }

  // Fallback demo data (used by content.js when all else fails)
  getFallbackData() {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 25 }, (_, i) => (currentYear - 24 + i).toString());

    return {
      labels: years,
      datasets: [{
        label: 'Demo Data',
        data: years.map((_, i) => 100 + i * 2 + (Math.random() - 0.5) * 10),
        borderColor: '#669df6',
        backgroundColor: 'rgba(102, 157, 246, 0.1)',
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.35,
        fill: true
      }]
    };
  }
}
