import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ControleService } from './controle.service';
import { ResultatScanDto, ScanDto, SeanceControleDto } from './dto/controle.dto';

@ApiTags('Contrôle en salle (US-6.1)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentification requise' })
@ApiForbiddenResponse({ description: 'Réservé aux rôles CONTROLEUR et ADMIN' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTROLEUR', 'ADMIN')
@Controller('controle')
export class ControleController {
  constructor(private readonly controle: ControleService) {}

  @Get('seances')
  @ApiOperation({ summary: 'Séances du moment, pour choisir la salle contrôlée' })
  @ApiOkResponse({ type: [SeanceControleDto] })
  seances(): Promise<SeanceControleDto[]> {
    return this.controle.seancesDuMoment();
  }

  // Un contrôleur scanne plusieurs billets par minute à l'ouverture de la salle.
  @Post('scan')
  @HttpCode(200)
  @SkipThrottle()
  @ApiOperation({ summary: 'Contrôler un billet : écran vert ou rouge avec le motif' })
  @ApiOkResponse({ type: ResultatScanDto })
  scanner(@Body() dto: ScanDto): Promise<ResultatScanDto> {
    return this.controle.scanner(dto);
  }
}
