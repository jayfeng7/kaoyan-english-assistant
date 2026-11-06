'use strict';
const fs = require('node:fs');
const installed = Symbol.for('kaoyan.windows.realpath-fallback');

// Native realpath can reject readable junctions in restricted Windows hosts.
// The standard implementation performs ordinary filesystem reads, with the same access checks.
// Do not alter file contents, permissions, missing-path errors or the POSIX runtime.
function installWindowsRealpathFallback(api = fs, platform = process.platform) {
  if (platform !== 'win32' || !api.realpathSync.native || api.realpathSync.native[installed]) return false;
  const native = api.realpathSync.native;
  const standard = api.realpathSync;
  function realpathNativeWithFallback(...args) {
    try { return native.apply(this, args); }
    catch (error) {
      if (error?.code !== 'EPERM' && error?.code !== 'EACCES') throw error;
      return standard.apply(this, args);
    }
  }
  realpathNativeWithFallback[installed] = true;
  api.realpathSync.native = realpathNativeWithFallback;
  return true;
}
installWindowsRealpathFallback();
module.exports = { installWindowsRealpathFallback };
