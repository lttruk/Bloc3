import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIXE = 'LGC1';

export interface ContenuCodeQr {
  billetId: number;
  seanceId: number;
}

/**
 * Code QR d'un billet (US-5.1) : identifiants du billet et de la séance, signés HMAC-SHA256.
 * Le code est unique, non devinable sans la clé et toute modification invalide la signature.
 */
@Injectable()
export class CodeQrService {
  private readonly cle: string;

  constructor(config: ConfigService) {
    // QR_SECRET est la clé dédiée ; JWT_SECRET sert de repli pour le développement et les tests.
    this.cle = config.get<string>('QR_SECRET') || config.getOrThrow<string>('JWT_SECRET');
  }

  signer(billetId: number, seanceId: number): string {
    const charge = `${billetId}.${seanceId}`;
    return `${PREFIXE}.${charge}.${this.signature(charge)}`;
  }

  /** Renvoie le contenu d'un code authentique, ou null s'il est mal formé ou falsifié. */
  lire(code: string): ContenuCodeQr | null {
    const parties = code.trim().split('.');
    if (parties.length !== 4 || parties[0] !== PREFIXE) return null;
    const [, billet, seance, signature] = parties;
    if (!/^\d+$/.test(billet) || !/^\d+$/.test(seance)) return null;
    const attendue = Buffer.from(this.signature(`${billet}.${seance}`));
    const recue = Buffer.from(signature);
    if (recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) return null;
    return { billetId: Number(billet), seanceId: Number(seance) };
  }

  private signature(charge: string): string {
    return createHmac('sha256', this.cle).update(charge).digest('base64url');
  }
}
