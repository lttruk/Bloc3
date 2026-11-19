import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { effacerCookieSession, lireCookieSession, poserCookieSession } from './cookie-session';
import { ConnexionDto, InscriptionDto, JetonDto, UtilisateurPublicDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionOuverte, SessionsService } from './sessions.service';
import { UtilisateurCourant, UtilisateurJwt } from './utilisateur-courant.decorator';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Post('inscription')
  @HttpCode(201)
  @ApiOperation({ summary: 'Créer un compte spectateur (US-2.1)' })
  @ApiCreatedResponse({ type: UtilisateurPublicDto })
  @ApiBadRequestResponse({ description: 'Données invalides ou consentement RGPD absent' })
  @ApiConflictResponse({ description: 'Un compte existe déjà avec cet e-mail' })
  inscrire(@Body() dto: InscriptionDto): Promise<UtilisateurPublicDto> {
    return this.auth.inscrire(dto);
  }

  @Post('connexion')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Se connecter (US-2.2)',
    description:
      'Renvoie un jeton d’accès court (JWT) et pose le jeton de rafraîchissement dans un cookie httpOnly. ' +
      'Après 5 échecs consécutifs, le compte est bloqué 15 minutes.',
  })
  @ApiOkResponse({ type: JetonDto })
  @ApiUnauthorizedResponse({ description: 'E-mail ou mot de passe incorrect' })
  @ApiTooManyRequestsResponse({
    description: 'Compte bloqué temporairement, ou plus de 10 tentatives par minute',
  })
  async connecter(
    @Body() dto: ConnexionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<JetonDto> {
    return this.repondre(res, await this.auth.connecter(dto, req.ip));
  }

  @Post('rafraichir')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Renouveler le jeton d’accès avec le cookie de session (US-2.2)',
    description:
      'Le jeton de rafraîchissement est à usage unique : il est remplacé à chaque appel.',
  })
  @ApiOkResponse({ type: JetonDto })
  @ApiUnauthorizedResponse({ description: 'Cookie absent, expiré, révoqué ou déjà utilisé' })
  async rafraichir(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<JetonDto> {
    try {
      return this.repondre(res, await this.sessions.renouveler(lireCookieSession(req)));
    } catch (erreur) {
      effacerCookieSession(res);
      throw erreur;
    }
  }

  @Post('deconnexion')
  @HttpCode(204)
  @ApiOperation({ summary: 'Se déconnecter : le jeton de rafraîchissement est révoqué (US-2.2)' })
  @ApiNoContentResponse({ description: 'Session fermée' })
  async deconnecter(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.fermer(lireCookieSession(req));
    effacerCookieSession(res);
  }

  @Get('moi')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consulter son profil' })
  @ApiOkResponse({ type: UtilisateurPublicDto })
  @ApiUnauthorizedResponse({ description: 'Jeton absent, invalide ou expiré' })
  profil(@UtilisateurCourant() utilisateur: UtilisateurJwt): Promise<UtilisateurPublicDto> {
    return this.auth.profil(utilisateur.id);
  }

  private repondre(res: Response, session: SessionOuverte): JetonDto {
    poserCookieSession(res, session.rafraichissement, session.expireLe);
    return session.jeton;
  }
}
