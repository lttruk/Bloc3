import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UtilisateurCourant, UtilisateurJwt } from '../auth/utilisateur-courant.decorator';
import { PagePaiementDto, ResultatPaiementDto, VerificationPaiementDto } from './dto/paiements.dto';
import { PaiementsService } from './paiements.service';

@ApiTags('Paiement (US-4.1)')
@Controller()
export class PaiementsController {
  constructor(
    private readonly paiements: PaiementsService,
    private readonly config: ConfigService,
  ) {}

  @Post('reservations/:reference/paiement')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ouvrir la page de paiement Stripe d’une réservation en attente' })
  @ApiCreatedResponse({ type: PagePaiementDto })
  @ApiConflictResponse({ description: 'Délai écoulé ou réservation déjà réglée' })
  initier(
    @UtilisateurCourant() utilisateur: UtilisateurJwt,
    @Param('reference') reference: string,
    @Req() requete: Request,
  ): Promise<PagePaiementDto> {
    return this.paiements.initier(utilisateur.id, reference, this.urlSite(requete));
  }

  @Post('paiements/verification')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vérifier le paiement au retour de la page Stripe' })
  @ApiOkResponse({ type: ResultatPaiementDto })
  verifier(
    @UtilisateurCourant() utilisateur: UtilisateurJwt,
    @Body() dto: VerificationPaiementDto,
  ): Promise<ResultatPaiementDto> {
    return this.paiements.verifierRetour(utilisateur.id, dto.sessionId);
  }

  @Post('paiements/webhook')
  @HttpCode(200)
  @SkipThrottle()
  @ApiExcludeEndpoint()
  async notification(
    @Req() requete: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ recu: true }> {
    await this.paiements.traiterNotification(requete.rawBody, signature);
    return { recu: true };
  }

  /** Adresse publique du site, pour les retours depuis Stripe. */
  private urlSite(requete: Request): string {
    const configuree = this.config.get<string>('APP_URL');
    const origine = configuree || requete.get('origin') || 'http://localhost:3000';
    return origine.replace(/\/+$/, '');
  }
}
