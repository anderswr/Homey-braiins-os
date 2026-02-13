'use strict';

const Homey = require('homey');

class AntminerDriver extends Homey.Driver {
  async onInit() {
    this.log('Antminer driver initialized (REST)');
  }

  async onPair(session) {
    // Pairing is handled in the HTML view; we just accept device from UI.
    session.setHandler('add_device', async (device) => {
      return device;
    });
  }
}

module.exports = AntminerDriver;