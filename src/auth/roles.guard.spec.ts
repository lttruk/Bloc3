import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function contexte(utilisateur?: { id: number; role: string }): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: utilisateur }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const garde = new RolesGuard(reflector);

  afterEach(() => jest.restoreAllMocks());

  it("laisse passer quand aucun rôle n'est exigé", () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(garde.canActivate(contexte())).toBe(true);
  });

  it('laisse passer un utilisateur qui a le rôle exigé', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(garde.canActivate(contexte({ id: 1, role: 'ADMIN' }))).toBe(true);
  });

  it("refuse un utilisateur qui n'a pas le rôle exigé", () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(garde.canActivate(contexte({ id: 2, role: 'CLIENT' }))).toBe(false);
  });

  it('refuse une requête sans utilisateur authentifié', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(garde.canActivate(contexte())).toBe(false);
  });
});
