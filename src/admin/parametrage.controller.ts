import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UtilisateurCourant, UtilisateurJwt } from '../auth/utilisateur-courant.decorator';
import {
  ConfigurationSalleDto,
  ConfigurationSalleLueDto,
  CreerTarifDto,
  ModifierTarifDto,
  TarifAdminDto,
} from './dto/parametrage.dto';
import { ParametrageService } from './parametrage.service';

@ApiTags('Back-office – tarifs et salles (US-7.2)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentification requise' })
@ApiForbiddenResponse({ description: 'Réservé au rôle ADMIN' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class ParametrageController {
  constructor(private readonly parametrage: ParametrageService) {}

  @Get('tarifs')
  @ApiOperation({ summary: 'Lister les tarifs, actifs et inactifs' })
  @ApiOkResponse({ type: [TarifAdminDto] })
  listerTarifs(): Promise<TarifAdminDto[]> {
    return this.parametrage.listerTarifs();
  }

  @Post('tarifs')
  @ApiOperation({ summary: 'Créer un tarif' })
  @ApiCreatedResponse({ type: TarifAdminDto })
  @ApiConflictResponse({ description: 'Libellé déjà utilisé' })
  creerTarif(
    @UtilisateurCourant() u: UtilisateurJwt,
    @Body() dto: CreerTarifDto,
  ): Promise<TarifAdminDto> {
    return this.parametrage.creerTarif(u.id, dto);
  }

  @Patch('tarifs/:id')
  @ApiOperation({
    summary: 'Modifier, activer ou désactiver un tarif (sans effet sur les billets vendus)',
  })
  @ApiOkResponse({ type: TarifAdminDto })
  modifierTarif(
    @UtilisateurCourant() u: UtilisateurJwt,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierTarifDto,
  ): Promise<TarifAdminDto> {
    return this.parametrage.modifierTarif(u.id, id, dto);
  }

  @Get('salles/:id/configuration')
  @ApiOperation({ summary: 'Configuration actuelle d’une salle : rangées, places, places PMR' })
  @ApiOkResponse({ type: ConfigurationSalleLueDto })
  lireConfiguration(@Param('id', ParseIntPipe) id: number): Promise<ConfigurationSalleLueDto> {
    return this.parametrage.lireConfiguration(id);
  }

  @Put('salles/:id/configuration')
  @ApiOperation({
    summary: 'Reconfigurer une salle modulable (appliqué aux nouvelles séances uniquement)',
  })
  @ApiOkResponse({ type: ConfigurationSalleLueDto })
  configurerSalle(
    @UtilisateurCourant() u: UtilisateurJwt,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfigurationSalleDto,
  ): Promise<ConfigurationSalleLueDto> {
    return this.parametrage.configurerSalle(u.id, id, dto);
  }
}
