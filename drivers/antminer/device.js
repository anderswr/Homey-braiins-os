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
    this._startPolling();

    await this._poll().catch((err) => this.error(err));
  }

  _startPolling() {
    if (this._pollTimer) this.homey.clearInterval(this._pollTimer);
    this._pollTimer = this.homey.setInterval(() => {
      this._poll().catch((err) => this.error(err));
    }, this._pollIntervalMs);
  }

  onDeleted() {
    if (this._pollTimer) this.homey.clearInterval(this._pollTimer);
  }

  /**
   * Called when user changes device settings in Homey UI
   */
  async onSettings({ newSettings }) {
    // Basic validation
    if (!newSettings.host || !newSettings.username || !newSettings.password) {
      throw new Error('Host, username and password are required.');
    }
    if (!newSettings.port || Number(newSettings.port) < 1 || Number(newSettings.port) > 65535) {
      throw new Error('Port must be a number between 1 and 65535.');
    }

    // Apply immediately: run a poll right away
    this.log('Settings updated, reconnecting now...');
    this.setUnavailable('Reconnecting with new settings...').catch(() => {});

    // Next poll uses this.getSettings() (Homey updates it automatically)
    await this._poll().catch(() => {});
  }

  _makeClient() {
    const s = this.getSettings();
    return new BosRestClient({
      host: s.host,
      port: Number(s.port),
      https: Boolean(s.https),
      username: s.username,
      password: s.password,
    });
  }

  _pickPowerWatts(stats) {
    const candidates = [
      stats?.power_stats?.approximated_consumption?.watt,
      stats?.power_stats?.approximatedConsumption?.watt,
      stats?.power_stats?.consumption?.watt,
      stats?.power_stats?.power?.watt,
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
        client.getMinerStats(),
        client.getCoolingState(),
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

      await this.setAvailable();
    } catch (err) {
      const msg = err?.message || String(err);
      await this.setUnavailable(`Connection error: ${msg}`);
      throw err;
    }
  }
}

module.exports = AntminerDevice;