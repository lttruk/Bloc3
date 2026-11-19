import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UtilisateurCourant, UtilisateurJwt } from '../auth/utilisateur-courant.decorator';
import { BilletsService } from './billets.service';
import { BilletDto } from './dto/billets.dto';

@ApiTags('Billets (US-5.1)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentification requise' })
@UseGuards(JwtAuthGuard)
@Controller('reservations')
export class BilletsController {
  constructor(private readonly billets: BilletsService) {}

  @Get(':reference/billets')
  @ApiOperation({ summary: 'Billets dématérialisés d’une réservation payée, avec QR code' })
  @ApiOkResponse({ type: [BilletDto] })
  @ApiNotFoundResponse({ description: 'Réservation introuvable' })
  @ApiConflictResponse({ description: 'Réservation non payée' })
  lister(
    @UtilisateurCourant() utilisateur: UtilisateurJwt,
    @Param('reference') reference: string,
  ): Promise<BilletDto[]> {
    return this.billets.billetsDeReservation(utilisateur.id, reference);
  }
}
