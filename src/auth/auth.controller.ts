import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ConnexionDto, InscriptionDto, JetonDto, UtilisateurPublicDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UtilisateurCourant, UtilisateurJwt } from './utilisateur-courant.decorator';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Se connecter et obtenir un jeton JWT (US-2.2)' })
  @ApiOkResponse({ type: JetonDto })
  @ApiUnauthorizedResponse({ description: 'E-mail ou mot de passe incorrect' })
  @ApiTooManyRequestsResponse({ description: 'Plus de 5 tentatives par minute' })
  connecter(@Body() dto: ConnexionDto): Promise<JetonDto> {
    return this.auth.connecter(dto);
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
}
