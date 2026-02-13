'use strict';

// node-fetch v3 is ESM-only; dynamic import keeps CommonJS compatibility.
async function fetchWrap(...args) {
  const mod = await import('node-fetch');
  return mod.default(...args);
}

class BosRestClient {
  /**
   * @param {object} opts
   * @param {string} opts.host e.g. "192.168.1.50"
   * @param {number} [opts.port] e.g. 80 (default)
   * @param {boolean} [opts.https] if true uses https
   * @param {string} opts.username
   * @param {string} opts.password
   */
  constructor(opts) {
    this.host = opts.host;
    this.port = opts.port ?? (opts.https ? 443 : 80);
    this.https = Boolean(opts.https);
    this.username = opts.username;
    this.password = opts.password;

    this.baseUrl = `${this.https ? 'https' : 'http'}://${this.host}:${this.port}`;

    this._token = null;
    this._tokenExpiresAt = 0; // epoch ms (best-effort)
  }

  async _login() {
    // POST /api/v1/auth/login returns token + timeout_s  [oai_citation:8‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)
    const url = `${this.baseUrl}/api/v1/auth/login`;
    const res = await fetchWrap(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Based on OpenAPI request body schema  [oai_citation:9‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)
      body: JSON.stringify({
        username: this.username,
        password: this.password
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Login failed (${res.status}): ${text || res.statusText}`);
    }

    const data = await res.json();
    this._token = data.token;

    // OpenAPI shows timeout_s returned  [oai_citation:10‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)
    // Some systems may return 0 or omit; we handle safely.
    const timeoutS = typeof data.timeout_s === 'number' ? data.timeout_s : 0;

    // If timeout unknown/0, refresh conservatively every ~55 minutes.
    const fallbackMs = 55 * 60 * 1000;
    const ms = timeoutS > 0 ? Math.max(30 * 1000, (timeoutS - 60) * 1000) : fallbackMs;

    this._tokenExpiresAt = Date.now() + ms;
    return data;
  }

  async _ensureToken() {
    if (!this._token || Date.now() >= this._tokenExpiresAt) {
      await this._login();
    }
  }

  async _request(path, { method = 'GET', body = undefined, retryOn401 = true } = {}) {
    await this._ensureToken();

    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      // OpenAPI: token should be included in Authorization header  [oai_citation:11‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)
      'Authorization': this._token
    };

    const res = await fetchWrap(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    // If token expired, re-login once and retry
    if (res.status === 401 && retryOn401) {
      this._token = null;
      this._tokenExpiresAt = 0;
      await this._login();
      return this._request(path, { method, body, retryOn401: false });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${method} ${path} failed (${res.status}): ${text || res.statusText}`);
    }

    // Some endpoints may return 204 No Content
    if (res.status === 204) return null;

    // If content-type is json, parse; else return text.
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }

  // PUT /api/v1/actions/pause  [oai_citation:12‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)
  async pauseMining() {
    return this._request('/api/v1/actions/pause', { method: 'PUT' });
  }

  // PUT /api/v1/actions/resume  [oai_citation:13‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)
  async resumeMining() {
    return this._request('/api/v1/actions/resume', { method: 'PUT' });
  }

  // GET /api/v1/miner/stats  [oai_citation:14‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)
  async getMinerStats() {
    return this._request('/api/v1/miner/stats', { method: 'GET' });
  }

  // GET /api/v1/cooling/state (fans + temps)  [oai_citation:15‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)
  async getCoolingState() {
    return this._request('/api/v1/cooling/state', { method: 'GET' });
  }

  // GET /api/v1/miner/details (optional)  [oai_citation:16‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)
  async getMinerDetails() {
    return this._request('/api/v1/miner/details', { method: 'GET' });
  }
}

module.exports = { BosRestClient };