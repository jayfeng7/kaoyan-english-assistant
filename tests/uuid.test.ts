import { describe, expect, it, vi } from 'vitest';
import { uuid } from '@/lib/utils/uuid';

describe('UUID in secure and local HTTP browser contexts', () => {
  it('uses the native UUID API when available', () => {
    const native = vi.fn(() => '00000000-0000-4000-8000-000000000001');
    vi.stubGlobal('crypto', { randomUUID: native });
    expect(uuid()).toBe('00000000-0000-4000-8000-000000000001'); expect(native).toHaveBeenCalledOnce();
  });
  it.each([0, 255])('sets the UUID v4 and RFC variant bits using secure random bytes %s', (value) => {
    const random = vi.fn((bytes: Uint8Array) => bytes.fill(value));
    vi.stubGlobal('crypto', { getRandomValues: random });
    const id = uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id).toBe(value ? 'ffffffff-ffff-4fff-bfff-ffffffffffff' : '00000000-0000-4000-8000-000000000000');
    expect(random).toHaveBeenCalledOnce(); expect(random.mock.calls[0]?.[0]).toHaveLength(16);
  });
  it('fails safely rather than substituting a weak random source', () => {
    vi.stubGlobal('crypto', undefined);
    expect(uuid).toThrow(expect.objectContaining({ code: 'INTERNAL_ERROR', message: '服务暂时出现问题，请稍后重试' }));
  });
});
