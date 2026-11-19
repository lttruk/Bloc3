import { Request } from 'express';
import { COOKIE_SESSION, lireCookieSession } from './cookie-session';

describe('lireCookieSession', () => {
  const requete = (cookie?: string) =>
    ({ headers: cookie === undefined ? {} : { cookie } }) as unknown as Request;

  it('lit le cookie de session parmi les autres cookies', () => {
    expect(lireCookieSession(requete(`a=1; ${COOKIE_SESSION}=abc-_123; b=2`))).toBe('abc-_123');
  });

  it('renvoie undefined sans cookie ou avec une valeur vide', () => {
    expect(lireCookieSession(requete())).toBeUndefined();
    expect(lireCookieSession(requete('autre=1'))).toBeUndefined();
    expect(lireCookieSession(requete(`${COOKIE_SESSION}=`))).toBeUndefined();
  });
});
