import { isIPv4, isIPv6 } from 'node:net';

/** Groupes d'une adresse IPv6, avec la forme abrégée « :: » développée. */
function groupesIpv6(ip: string): string[] {
  const [gauche, droite] = ip.split('::');
  const debut = gauche ? gauche.split(':') : [];
  if (droite === undefined) return debut;
  const fin = droite ? droite.split(':') : [];
  return [
    ...debut,
    ...new Array<string>(Math.max(0, 8 - debut.length - fin.length)).fill('0'),
    ...fin,
  ];
}

/**
 * Adresse IP réduite avant d'être journalisée (minimisation RGPD) : dernier octet mis à zéro
 * en IPv4, seul le préfixe /48 conservé en IPv6. Renvoie null pour une valeur non reconnue.
 */
export function tronquerIp(ip?: string | null): string | null {
  if (!ip) return null;
  const adresse = ip.split('%')[0];
  const ipv4 = adresse.toLowerCase().startsWith('::ffff:') ? adresse.slice(7) : adresse;
  if (isIPv4(ipv4)) return `${ipv4.split('.').slice(0, 3).join('.')}.0`;
  if (isIPv6(adresse)) return `${groupesIpv6(adresse.toLowerCase()).slice(0, 3).join(':')}::`;
  return null;
}
