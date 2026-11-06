import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { installWindowsRealpathFallback: install } = require('../scripts/windows-fs-compat.cjs') as { installWindowsRealpathFallback: (api: { realpathSync: ReturnType<typeof vi.fn> & { native: ReturnType<typeof vi.fn> } }, platform: string) => boolean };
const failure = (code: string) => Object.assign(new Error(code), { code });
type Resolve = (path: string, options?: { encoding: string }) => string;
function api(native: Resolve, standard: Resolve = () => 'canonical') {
  return { realpathSync: Object.assign(vi.fn(standard), { native: vi.fn(native) }) };
}
describe('Windows native realpath compatibility', () => {
  it('preserves normal native results without extra filesystem reads', () => {
    const fs = api(() => 'native'); install(fs, 'win32');
    expect(fs.realpathSync.native('junction')).toBe('native'); expect(fs.realpathSync.mock.calls).toHaveLength(0);
  });
  it.each(['EPERM', 'EACCES'])('uses standard resolution for a readable junction when native returns %s', code => {
    const fs = api(() => { throw failure(code); }); install(fs, 'win32');
    expect(fs.realpathSync.native('junction', { encoding: 'utf8' })).toBe('canonical');
    expect(fs.realpathSync).toHaveBeenCalledWith('junction', { encoding: 'utf8' });
  });
  it('preserves missing-path errors without falling back', () => {
    const error = failure('ENOENT'); const fs = api(() => { throw error; }); install(fs, 'win32');
    expect(() => fs.realpathSync.native('missing')).toThrow(error); expect(fs.realpathSync.mock.calls).toHaveLength(0);
  });
  it('still throws when standard filesystem access is also denied', () => {
    const denied = failure('EACCES'); const fs = api(() => { throw failure('EPERM'); }, () => { throw denied; }); install(fs, 'win32');
    expect(() => fs.realpathSync.native('restricted')).toThrow(denied);
  });
  it('does not modify POSIX resolution and installs only once on Windows', () => {
    const fs = api(() => 'native'); const before = fs.realpathSync.native;
    expect(install(fs, 'linux')).toBe(false); expect(fs.realpathSync.native).toBe(before);
    expect(install(fs, 'win32')).toBe(true); const wrapped = fs.realpathSync.native;
    expect(install(fs, 'win32')).toBe(false); expect(fs.realpathSync.native).toBe(wrapped);
  });
});
