import { tronquerIp } from './ip-tronquee';

describe('tronquerIp', () => {
  it('met à zéro le dernier octet d’une IPv4, y compris notée en IPv6', () => {
    expect(tronquerIp('203.0.113.57')).toBe('203.0.113.0');
    expect(tronquerIp('::ffff:203.0.113.57')).toBe('203.0.113.0');
  });

  it('ne garde que le préfixe /48 d’une IPv6', () => {
    expect(tronquerIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:85a3::');
    expect(tronquerIp('2001:db8::1')).toBe('2001:db8:0::');
    expect(tronquerIp('fe80::1%eth0')).toBe('fe80:0:0::');
  });

  it('renvoie null pour une valeur absente ou non reconnue', () => {
    expect(tronquerIp(undefined)).toBeNull();
    expect(tronquerIp('pas-une-ip')).toBeNull();
  });
});
