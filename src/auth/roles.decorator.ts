import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restreint une route aux rôles indiqués (contrôle d'accès RBAC). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
