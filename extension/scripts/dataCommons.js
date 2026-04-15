// Data Commons API Integration
// Query goes to Data Commons raw. We only filter the response data.
// Includes in-memory + persistent caching and parallel fetch support.
class DataCommonsAPI {
  constructor() {
    this.apiBase = 'https://api.datacommons.org';
    this.detectAndFulfillURL = 'https://datacommons.org/api/explore/detect-and-fulfill';
    this.observationEndpoint = `${this.apiBase}/v2/observation`;
    this.apiKey = 'AIzaSyCTI4Xz-UW_G2Q2RfknhcfdAnTHq5X5XuI';

    // In-memory caches (keyed by normalized string, values include TTL)
    this._detectionCache = new Map();
    this._observationCache = new Map();

    // Default TTL: 30 minutes for detections, 60 minutes for observations
    this.DETECTION_TTL_MS = 30 * 60 * 1000;
    this.OBSERVATION_TTL_MS = 60 * 60 * 1000;

    // Inflight dedup maps — prevents duplicate concurrent requests for the same key
    this._detectionInflight = new Map();
    this._observationInflight = new Map();

    // Warm the in-memory cache from chrome.storage.local on construction
    this._warmCacheFromStorage();
  }

  // ── Cache helpers ─────────────────────────────────────────────────────

  _normalizeQuery(query) {
    return query.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  _observationKey(placeDCID, variableDCID) {
    return `${placeDCID}::${variableDCID}`;
  }

  _isExpired(entry) {
    return Date.now() > entry.expiresAt;
  }

  // Warm in-memory caches from chrome.storage.local so data survives page navigations
  _warmCacheFromStorage() {
    try {
      chrome.storage.local.get(['ziggy_detectionCache', 'ziggy_observationCache'], (result) => {
        if (chrome.runtime.lastError) return;

        const det = result.ziggy_detectionCache;
        if (det && typeof det === 'object') {
          for (const [key, entry] of Object.entries(det)) {
            if (!this._isExpired(entry)) {
              this._detectionCache.set(key, entry);
            }
          }
        }

        const obs = result.ziggy_observationCache;
        if (obs && typeof obs === 'object') {
          for (const [key, entry] of Object.entries(obs)) {
            if (!this._isExpired(entry)) {
              this._observationCache.set(key, entry);
            }
          }
        }

        console.log('ZiggyCharts: Cache warmed —',
          this._detectionCache.size, 'detections,',
          this._observationCache.size, 'observations');
      });
    } catch (e) {
      // storage may be unavailable in some contexts; ignore
    }
  }

  // Persist a cache map to chrome.storage.local (debounced via caller)
  _persistCache(storageKey, memoryMap) {
    try {
      const obj = {};
      for (const [key, entry] of memoryMap) {
        if (!this._isExpired(entry)) {
          obj[key] = entry;
        }
      }
      chrome.storage.local.set({ [storageKey]: obj });
    } catch (e) {
      // ignore storage errors
    }
  }

  _getCachedDetection(query) {
    const key = this._normalizeQuery(query);
    const entry = this._detectionCache.get(key);
    if (entry && !this._isExpired(entry)) {
      console.log('ZiggyCharts: Detection cache HIT for', key);
      return entry.value;
    }
    if (entry) this._detectionCache.delete(key); // expired
    return null;
  }

  _setCachedDetection(query, value) {
    const key = this._normalizeQuery(query);
    const entry = { value, expiresAt: Date.now() + this.DETECTION_TTL_MS };
    this._detectionCache.set(key, entry);
    this._persistCache('ziggy_detectionCache', this._detectionCache);
  }

  _getCachedObservation(placeDCID, variableDCID) {
    const key = this._observationKey(placeDCID, variableDCID);
    const entry = this._observationCache.get(key);
    if (entry && !this._isExpired(entry)) {
      console.log('ZiggyCharts: Observation cache HIT for', key);
      return entry.value;
    }
    if (entry) this._observationCache.delete(key); // expired
    return null;
  }

  _setCachedObservation(placeDCID, variableDCID, value) {
    const key = this._observationKey(placeDCID, variableDCID);
    const entry = { value, expiresAt: Date.now() + this.OBSERVATION_TTL_MS };
    this._observationCache.set(key, entry);
    this._persistCache('ziggy_observationCache', this._observationCache);
  }

  // ── Inflight deduplication ────────────────────────────────────────────
  // If a request for the same key is already in flight, reuse its promise
  // instead of firing a duplicate network call.

  async _deduplicatedDetection(query) {
    const key = this._normalizeQuery(query);
    if (this._detectionInflight.has(key)) {
      console.log('ZiggyCharts: Deduplicating inflight detection for', key);
      return this._detectionInflight.get(key);
    }
    const promise = this._rawDetectFromQuery(query).finally(() => {
      this._detectionInflight.delete(key);
    });
    this._detectionInflight.set(key, promise);
    return promise;
  }

  async _deduplicatedObservation(placeDCID, variableDCID) {
    const key = this._observationKey(placeDCID, variableDCID);
    if (this._observationInflight.has(key)) {
      console.log('ZiggyCharts: Deduplicating inflight observation for', key);
      return this._observationInflight.get(key);
    }
    const promise = this._rawFetchObservations(placeDCID, variableDCID).finally(() => {
      this._observationInflight.delete(key);
    });
    this._observationInflight.set(key, promise);
    return promise;
  }

  // ── Public API ────────────────────────────────────────────────────────

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

  // Fetch chart data for multiple queries in parallel.
  // Returns an array of results (null entries for failed queries).
  async getMultipleChartData(queries) {
    return Promise.all(queries.map(q => this.getChartData(q)));
  }

  // Send the raw query to Data Commons NL API — with caching layer.
  async detectFromQuery(query) {
    const cached = this._getCachedDetection(query);
    if (cached !== null) return cached;
    return this._deduplicatedDetection(query);
  }

  // Actual network call for detection (called only on cache miss).
  async _rawDetectFromQuery(query) {
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

      const detection = this.parseDetection(result);
      // Cache the result (even null, to avoid re-fetching known misses)
      this._setCachedDetection(query, detection);
      return detection;

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

  // Fetch observations from Data Commons — with caching layer.
  async fetchObservations(placeDCID, variableDCID) {
    const cached = this._getCachedObservation(placeDCID, variableDCID);
    if (cached !== null) return cached;
    return this._deduplicatedObservation(placeDCID, variableDCID);
  }

  // Actual network call for observations (called only on cache miss).
  async _rawFetchObservations(placeDCID, variableDCID) {
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

      const parsed = this.parseObservationData(response.data, variableDCID, placeDCID);
      // Cache the parsed result
      this._setCachedObservation(placeDCID, variableDCID, parsed);
      return parsed;

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
