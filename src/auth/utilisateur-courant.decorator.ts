import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export interface UtilisateurJwt {
  id: number;
  role: Role;
}

/** Injecte l'utilisateur authentifié (renseigné par la stratégie JWT). */
export const UtilisateurCourant = createParamDecorator(
  (_donnees: unknown, ctx: ExecutionContext): UtilisateurJwt =>
    ctx.switchToHttp().getRequest().user,
);
