import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Exige un jeton JWT valide (en-tête Authorization: Bearer ...). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
