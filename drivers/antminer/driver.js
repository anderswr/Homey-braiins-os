'use strict';

const Homey = require('homey');
const { BosRestClient } = require('../../lib/bosRestClient');

class AntminerDriver extends Homey.Driver {
  async onInit() {
    this.log('Antminer driver initialized (REST)');
  }

  async onPair(session) {
    // Called from the pairing UI (add_device.html)
    session.setHandler('test_connection', async (data) => {
      const { host, port, https, username, password } = data || {};

      if (!host || !port || !username || !password) {
        return { ok: false, error: 'Missing required fields (host/port/username/password).' };
      }

      try {
        const client = new BosRestClient({ host, port, https, username, password });

        // Login (verifies credentials + reachability)
        await client._login();

        // Try to fetch details so we can make a stable device id + nicer name
        let details = null;
        try {
          details = await client.getMinerDetails();
        } catch (e) {
          // details endpoint may be missing/blocked on some versions – not fatal
        }

        // Try stats quickly (optional; confirms API really works)
        let stats = null;
        try {
          stats = await client.getMinerStats();
        } catch (e) {}

        return {
          ok: true,
          details,
          stats
        };
      } catch (err) {
        return { ok: false, error: err?.message || String(err) };
      }
    });
  }
}

module.exports = AntminerDriver;