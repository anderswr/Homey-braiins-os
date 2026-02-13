'use strict';

const Homey = require('homey');

class BosMinerApp extends Homey.App {
  async onInit() {
    this.log('Braiins OS+ Miner Controller (REST) is running');
  }
}

module.exports = BosMinerApp;