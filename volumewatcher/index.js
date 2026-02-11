'use strict';

var libQ = require('kew');
var fs = require('fs-extra');
var config = new (require('v-conf'))();
var io = require('socket.io-client');
var cp = require('child_process');

module.exports = volumeWatcher;

function volumeWatcher(context) {
  this.context = context;
  this.commandRouter = this.context.coreCommand;
  this.logger = this.context.logger;
  this.configManager = this.context.configManager;

  this.socket = null;
  this.lastVolume = null;
  this.toastCooldown = false;
  this.irLock = false;
  this.irCooldownMs = 60;
}

volumeWatcher.prototype._sendIr = function (dir) {
    var self = this;

    if (self.irLock) return;
    self.irLock = true;

    var dev = '/dev/lirc0';
    var carrier = '36000';

    var file = dir === 'UP'
        ? __dirname + '/signals/vol_up.ir'
        : __dirname + '/signals/vol_down.ir';

    cp.execFile(
        'ir-ctl',
        ['-d', dev, '--send=' + file, '--carrier=' + carrier],
        { timeout: 1500 },
        function (err, stdout, stderr) {
            if (err) {
                self.logger.error('[volume-watcher] IR send failed: ' + (stderr || err.message || err));
            }
            setTimeout(function () {
                self.irLock = false;
            }, self.irCooldownMs);
        }
    );
};

volumeWatcher.prototype.onVolumioStart = function () {
  var configFile = this.commandRouter.pluginManager.getConfigurationFile(this.context, 'config.json');
  this.config = new (require('v-conf'))();
  this.config.loadFile(configFile);
  return libQ.resolve();
};

volumeWatcher.prototype.onStart = function () {
  this._connectSocket();
  return libQ.resolve();
};

volumeWatcher.prototype.onStop = function () {
  try {
    if (this.socket) this.socket.close();
  } catch (e) {}
  this.socket = null;
  this.lastVolume = null;
  this.toastCooldown = false;
  return libQ.resolve();
};

volumeWatcher.prototype.onRestart = function () {
  return libQ.resolve();
};

volumeWatcher.prototype._connectSocket = function () {
  var self = this;

  try {
    if (self.socket) self.socket.close();
  } catch (e) {}

  self.socket = io('http://localhost:3000', {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 5000
  });

  self.socket.on('connect', function () {
    self.logger.info('[volume-watcher] socket connected');
  });

  self.socket.on('disconnect', function (reason) {
    self.logger.warn('[volume-watcher] socket disconnected: ' + reason);
  });

  self.socket.on('connect_error', function (err) {
    self.logger.error('[volume-watcher] connect_error: ' + (err && err.message ? err.message : err));
  });

  self.socket.on('pushState', function (state) {
    var v = state && typeof state.volume === 'number' ? state.volume : null;
    if (v === null) return;

    if (self.lastVolume === null) {
      self.lastVolume = v;
      self.logger.info('[volume-watcher] initial volume=' + v);
      return;
    }

    if (v === self.lastVolume) return;

    var dir = v > self.lastVolume ? 'UP' : 'DOWN';
    self.logger.info('[volume-watcher] VOLUME ' + dir + ' ' + self.lastVolume + ' -> ' + v);
    self._sendIr(dir);

    if (!self.toastCooldown) {
      self.toastCooldown = true;
      try {
        self.commandRouter.pushToastMessage('success', 'Volume Watcher', 'Volume ' + dir);
      } catch (e) {}
      setTimeout(function () {
        self.toastCooldown = false;
      }, 1500);
    }

    self.lastVolume = v;
  });
};

// Configuration Methods -----------------------------------------------------------------------------

volumeWatcher.prototype.getUIConfig = function () {
  var defer = libQ.defer();
  var self = this;
  var lang_code = this.commandRouter.sharedVars.get('language_code');

  self.commandRouter.i18nJson(
    __dirname + '/i18n/strings_' + lang_code + '.json',
    __dirname + '/i18n/strings_en.json',
    __dirname + '/UIConfig.json'
  )
    .then(function (uiconf) {
      defer.resolve(uiconf);
    })
    .fail(function () {
      defer.reject(new Error());
    });

  return defer.promise;
};

volumeWatcher.prototype.getConfigurationFiles = function () {
  return ['config.json'];
};

volumeWatcher.prototype.setUIConfig = function (data) {
  return libQ.resolve();
};

volumeWatcher.prototype.getConf = function (varName) {
  return this.config.get(varName);
};

volumeWatcher.prototype.setConf = function (varName, varValue) {
  this.config.set(varName, varValue);
  return libQ.resolve();
};
