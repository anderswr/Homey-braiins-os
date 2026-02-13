'use strict';

const Homey = require('homey');
const { BosRestClient } = require('../../lib/bosRestClient');

class AntminerDevice extends Homey.Device {
  async onInit() {
    this.log('Antminer device init (REST)', this.getName());

    this._hasLoggedSample = false;

    // default state
    if (this.hasCapability('onoff')) {
      await this.setCapabilityValue('onoff', true).catch(() => {});
    }

    this.registerCapabilityListener('onoff', async (value) => {
      const client = this._makeClient();

      if (value === false) {
        this.log('Pausing mining (REST)...');
        await client.pauseMining();
      } else {
        this.log('Resuming mining (REST)...');
        await client.resumeMining();
      }

      return true;
    });

    this._pollIntervalMs = 30 * 1000;
    this._pollTimer = this.homey.setInterval(() => {
      this._poll().catch((err) => this.error(err));
    }, this._pollIntervalMs);

    await this._poll().catch((err) => this.error(err));
  }

  onDeleted() {
    if (this._pollTimer) this.homey.clearInterval(this._pollTimer);
  }

  _makeClient() {
    const s = this.getSettings();
    return new BosRestClient({
      host: s.host,
      port: s.port,
      https: s.https,
      username: s.username,
      password: s.password
    });
  }

  _pickPowerWatts(stats) {
    // OpenAPI only shows the shape as objects at a high level  [oai_citation:21‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)
    // Different BOS versions may put the watt number in slightly different places.
    // We try a few common candidates:
    const candidates = [
      stats?.power_stats?.approximated_consumption?.watt,
      stats?.power_stats?.approximatedConsumption?.watt,
      stats?.power_stats?.consumption?.watt,
      stats?.power_stats?.power?.watt
    ];

    for (const v of candidates) {
      if (typeof v === 'number') return v;
    }
    return null;
  }

  async _poll() {
    const s = this.getSettings();
    if (!s.host || !s.username || !s.password) {
      await this.setUnavailable('Missing connection settings (host/username/password).');
      return;
    }

    const client = this._makeClient();

    try {
      const [stats, cooling] = await Promise.all([
        client.getMinerStats(),     // GET /api/v1/miner/stats  [oai_citation:22‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)
        client.getCoolingState()    // GET /api/v1/cooling/state  [oai_citation:23‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)
      ]);

      if (!this._hasLoggedSample) {
        this._hasLoggedSample = true;
        this.log('Sample /api/v1/miner/stats:', JSON.stringify(stats));
        this.log('Sample /api/v1/cooling/state:', JSON.stringify(cooling));
      }

      const watts = this._pickPowerWatts(stats);
      if (typeof watts === 'number' && this.hasCapability('measure_power')) {
        await this.setCapabilityValue('measure_power', watts).catch(() => {});
      }

      // Later: add custom capabilities for hashrate + fans.
      // Cooling state response explicitly includes fans[] with rpm  [oai_citation:24‡developer.braiins-os.com](https://developer.braiins-os.com/latest/openapi.html)

      await this.setAvailable();
    } catch (err) {
      await this.setUnavailable(`Connection error: ${err.message || err}`);
      throw err;
    }
  }
}

module.exports = AntminerDevice;