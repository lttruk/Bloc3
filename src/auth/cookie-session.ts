import { CookieOptions, Request, Response } from 'express';

/** Cookie qui transporte le jeton de rafraîchissement : illisible par le JavaScript de la page. */
export const COOKIE_SESSION = 'lgc_session';

const OPTIONS: CookieOptions = {
  httpOnly: true,
  // Les navigateurs acceptent aussi les cookies « Secure » sur http://localhost.
  secure: true,
  sameSite: 'strict',
  // Envoyé uniquement aux routes d'authentification
  path: '/auth',
};

export function lireCookieSession(req: Request): string | undefined {
  for (const morceau of (req.headers.cookie ?? '').split(';')) {
    const separateur = morceau.indexOf('=');
    if (separateur > 0 && morceau.slice(0, separateur).trim() === COOKIE_SESSION) {
      const valeur = morceau.slice(separateur + 1).trim();
      return valeur || undefined;
    }
  }
  return undefined;
}

export function poserCookieSession(res: Response, valeur: string, expireLe: Date): void {
  res.cookie(COOKIE_SESSION, valeur, { ...OPTIONS, expires: expireLe });
}

export function effacerCookieSession(res: Response): void {
  res.clearCookie(COOKIE_SESSION, OPTIONS);
}
