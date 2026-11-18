import { Controller, Delete, Get, HttpCode, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UtilisateurCourant, UtilisateurJwt } from '../auth/utilisateur-courant.decorator';
import { MaReservationDto } from './dto/mes-reservations.dto';
import { MesReservationsService } from './mes-reservations.service';

@ApiTags('Réservations')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentification requise' })
@UseGuards(JwtAuthGuard)
@Controller('reservations')
export class MesReservationsController {
  constructor(private readonly mesReservations: MesReservationsService) {}

  @Get('moi')
  @ApiOperation({ summary: 'Consulter mes réservations (US-5.2)' })
  @ApiOkResponse({ type: [MaReservationDto] })
  lister(@UtilisateurCourant() utilisateur: UtilisateurJwt): Promise<MaReservationDto[]> {
    return this.mesReservations.lister(utilisateur.id);
  }

  @Delete(':reference')
  @HttpCode(204)
  @ApiOperation({ summary: 'Libérer les places d’une réservation en attente' })
  @ApiNoContentResponse({ description: 'Places libérées' })
  @ApiNotFoundResponse({ description: 'Réservation introuvable' })
  @ApiConflictResponse({ description: 'La réservation n’est plus en attente' })
  liberer(
    @Param('reference') reference: string,
    @UtilisateurCourant() utilisateur: UtilisateurJwt,
  ): Promise<void> {
    return this.mesReservations.liberer(utilisateur.id, reference);
  }
}
