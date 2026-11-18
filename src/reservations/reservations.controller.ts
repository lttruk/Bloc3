import { Body, Controller, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UtilisateurCourant, UtilisateurJwt } from '../auth/utilisateur-courant.decorator';
import { CreerReservationDto, ReservationVerrouilleeDto } from './dto/creer-reservation.dto';
import { ReservationsService } from './reservations.service';

@ApiTags('Réservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('seances/:seanceId/reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Verrouiller des places pour une séance pendant 10 minutes' })
  @ApiCreatedResponse({ type: ReservationVerrouilleeDto })
  @ApiBadRequestResponse({ description: 'Requête invalide (place en double, plus de 10 places)' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiConflictResponse({ description: "Une des places vient d'être prise" })
  @ApiUnprocessableEntityResponse({
    description: 'Séance non réservable, place ou tarif invalide',
  })
  async verrouiller(
    @Param('seanceId', ParseIntPipe) seanceId: number,
    @Body() dto: CreerReservationDto,
    @UtilisateurCourant() utilisateur: UtilisateurJwt,
  ): Promise<ReservationVerrouilleeDto> {
    const r = await this.reservations.verrouillerPlaces(utilisateur.id, seanceId, dto);
    return {
      reference: r.reference,
      statut: r.statut,
      expireLe: r.expireLe!.toISOString(),
      nombrePlaces: r.billets.length,
    };
  }
}
