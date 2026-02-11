'use strict';

var libQ = require('kew');
var fs = require('fs-extra');
var config = new (require('v-conf'))();
var execFile = require('child_process').execFile;

module.exports = amphandler;

function amphandler(context) {
    this.context = context;
    this.commandRouter = this.context.coreCommand;
    this.logger = this.context.logger;
    this.configManager = this.context.configManager;

    this.irLock = false;
    this.irCooldownMs = 80;

    this.irDevice = '/dev/lirc0';
    this.irCarrier = '36000';
}

amphandler.prototype.onVolumioStart = function () {
    var configFile = this.commandRouter.pluginManager.getConfigurationFile(this.context, 'config.json');
    this.config = new (require('v-conf'))();
    this.config.loadFile(configFile);

    var dev = this.config.get('irDevice');
    var carrier = this.config.get('irCarrier');
    var cooldown = this.config.get('irCooldownMs');

    if (dev) this.irDevice = dev;
    if (carrier) this.irCarrier = String(carrier);
    if (typeof cooldown === 'number') this.irCooldownMs = cooldown;

    return libQ.resolve();
};

amphandler.prototype.onStart = function () {
    return libQ.resolve();
};

amphandler.prototype.onStop = function () {
    return libQ.resolve();
};

amphandler.prototype.onRestart = function () {
    return libQ.resolve();
};

amphandler.prototype.getUIConfig = function () {
    var defer = libQ.defer();
    var self = this;
    var lang_code = this.commandRouter.sharedVars.get('language_code');

    self.commandRouter
        .i18nJson(
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

amphandler.prototype.getConfigurationFiles = function () {
    return ['config.json'];
};

amphandler.prototype._sendIrFile = function (filename) {
    var self = this;

    if (self.irLock) return libQ.resolve();
    self.irLock = true;

    var defer = libQ.defer();
    var fullPath = __dirname + '/signals/' + filename;

    execFile(
        'ir-ctl',
        ['-d', self.irDevice, '--send=' + fullPath, '--carrier=' + self.irCarrier],
        { timeout: 1500 },
        function (err, stdout, stderr) {
            setTimeout(function () {
                self.irLock = false;
            }, self.irCooldownMs);

            if (err) {
                self.logger.error('[amphandler] IR send failed (' + filename + '): ' + (stderr || err.message || err));
                defer.resolve();
                return;
            }

            self.logger.info('[amphandler] IR sent: ' + filename);
            defer.resolve();
        }
    );

    return defer.promise;
};

amphandler.prototype.setUIConfig = function (data) {
    var self = this;

    if (!data) return libQ.resolve();

    var key = Object.keys(data).find(function (k) {
        return data[k] === true;
    });

    if (!key) return libQ.resolve();

    var map = {
        power: 'power.ir',
        volUp: 'vol_up.ir',
        volDown: 'vol_down.ir',
        linePhono: 'line_phono.ir',
        lineCd: 'line_cd.ir',
        lineOne: 'line_one.ir',
        lineTwo: 'line_two.ir'
    };

    var file = map[key];
    if (!file) return libQ.resolve();

    return self._sendIrFile(file);
};

amphandler.prototype.getConf = function (varName) {
    return this.config.get(varName);
};

amphandler.prototype.setConf = function (varName, varValue) {
    this.config.set(varName, varValue);
    return libQ.resolve();
};

amphandler.prototype.sendIr = function (data) {
    var self = this;

    var action = data && data.action ? data.action : null;
    if (!action) return libQ.resolve();

    var map = {
        power: 'power.ir',
        volUp: 'vol_up.ir',
        volDown: 'vol_down.ir',
        linePhono: 'line_phono.ir',
        lineCd: 'line_cd.ir',
        lineOne: 'line_one.ir',
        lineTwo: 'line_two.ir'
    };

    var file = map[action];
    if (!file) return libQ.resolve();

    return self._sendIrFile(file);
};