import { ConfigService } from '@nestjs/config';
import { CodeQrService } from './code-qr.service';

describe('CodeQrService', () => {
  const config = (valeurs: Record<string, string>) =>
    ({
      get: (cle: string) => valeurs[cle],
      getOrThrow: (cle: string) => {
        if (!valeurs[cle]) throw new Error(`${cle} manquant`);
        return valeurs[cle];
      },
    }) as unknown as ConfigService;
  const service = new CodeQrService(config({ QR_SECRET: 'cle-de-test-qr' }));

  it('signe puis relit un code authentique', () => {
    const code = service.signer(42, 7);
    expect(code).toMatch(/^LGC1\.42\.7\.[\w-]+$/);
    expect(service.lire(code)).toEqual({ billetId: 42, seanceId: 7 });
  });

  it('produit des codes différents pour des billets différents', () => {
    expect(service.signer(1, 7)).not.toBe(service.signer(2, 7));
  });

  it('rejette un code dont le billet ou la séance a été modifié', () => {
    const [prefixe, , seance, signature] = service.signer(42, 7).split('.');
    expect(service.lire([prefixe, '43', seance, signature].join('.'))).toBeNull();
    expect(service.lire(`LGC1.42.8.${signature}`)).toBeNull();
  });

  it('rejette un code signé avec une autre clé ou mal formé', () => {
    const autre = new CodeQrService(config({ QR_SECRET: 'autre-cle' }));
    expect(service.lire(autre.signer(42, 7))).toBeNull();
    expect(service.lire('n-importe-quoi')).toBeNull();
    expect(service.lire('LGC1.a.b.c')).toBeNull();
    expect(service.lire('XXX1.42.7.abc')).toBeNull();
  });

  it('utilise JWT_SECRET si QR_SECRET est absent', () => {
    const repli = new CodeQrService(config({ JWT_SECRET: 'cle-jwt' }));
    expect(repli.lire(repli.signer(1, 2))).toEqual({ billetId: 1, seanceId: 2 });
  });
});
