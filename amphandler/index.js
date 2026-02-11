'use strict';

var libQ = require('kew');
var execFile = require('child_process').execFile;

module.exports = amphandler;

function amphandler(context) {
    this.context = context;
    this.commandRouter = this.context.coreCommand;
    this.logger = this.context.logger;

    this.irLock = false;
    this.irCooldownMs = 120;

    this.irDevice = '/dev/lirc0';
    this.irCarrier = '36000';

    this.irMap = {
        power: 'power.ir',
        volUp: 'vol_up.ir',
        volDown: 'vol_down.ir',
        linePhono: 'line_phono.ir',
        lineCd: 'line_cd.ir',
        lineOne: 'line_one.ir',
        lineTwo: 'line_two.ir'
    };
}

amphandler.prototype.onVolumioStart = function () {
    return libQ.resolve();
};

amphandler.prototype.getUIConfig = function () {
    var defer = libQ.defer();
    var self = this;
    var lang_code = this.commandRouter.sharedVars.get('language_code');

    self.commandRouter.i18nJson(
        __dirname + '/i18n/strings_' + lang_code + '.json',
        __dirname + '/i18n/strings_en.json',
        __dirname + '/UIConfig.json'
    ).then(function (uiconf) {
        defer.resolve(uiconf);
    }).fail(function () {
        defer.reject(new Error());
    });

    return defer.promise;
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
                return defer.resolve();
            }

            defer.resolve();
        }
    );

    return defer.promise;
};

amphandler.prototype.sendIr = function (data) {
    var self = this;

    var action = data && data.action ? data.action : null;
    if (!action) return libQ.resolve();

    var file = self.irMap[action];
    if (!file) return libQ.resolve();

    return self._sendIrFile(file);
};
