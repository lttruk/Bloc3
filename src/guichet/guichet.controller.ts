import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UtilisateurCourant, UtilisateurJwt } from '../auth/utilisateur-courant.decorator';
import {
  BilanJourDto,
  SeanceGuichetDto,
  VenteEffectueeDto,
  VenteGuichetDto,
} from './dto/guichet.dto';
import { GuichetService } from './guichet.service';

@ApiTags('Guichet (US-7.3)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentification requise' })
@ApiForbiddenResponse({ description: 'Réservé aux rôles CAISSIER et ADMIN' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CAISSIER', 'ADMIN')
@Controller('guichet')
export class GuichetController {
  constructor(private readonly guichet: GuichetService) {}

  @Get('seances')
  @ApiOperation({ summary: 'Séances en vente au guichet, avec les places libres' })
  @ApiOkResponse({ type: [SeanceGuichetDto] })
  seances(): Promise<SeanceGuichetDto[]> {
    return this.guichet.seancesEnVente();
  }

  @Post('seances/:seanceId/ventes')
  @ApiOperation({
    summary: 'Vendre des places au comptoir : billets émis immédiatement avec QR code signé',
  })
  @ApiCreatedResponse({ type: VenteEffectueeDto })
  @ApiConflictResponse({ description: 'Une place vient d’être vendue sur un autre canal' })
  @ApiUnprocessableEntityResponse({ description: 'Séance non vendable, place ou tarif invalide' })
  vendre(
    @UtilisateurCourant() caissier: UtilisateurJwt,
    @Param('seanceId', ParseIntPipe) seanceId: number,
    @Body() dto: VenteGuichetDto,
  ): Promise<VenteEffectueeDto> {
    return this.guichet.vendre(caissier.id, seanceId, dto);
  }

  @Get('bilan')
  @ApiOperation({ summary: 'Billets vendus aujourd’hui, par canal de vente (web, guichet)' })
  @ApiOkResponse({ type: BilanJourDto })
  bilan(): Promise<BilanJourDto> {
    return this.guichet.bilanDuJour();
  }
}
