import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
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
  CreerFilmDto,
  CreerSeanceDto,
  EntreeJournalDto,
  FilmAdminDto,
  FiltresSeancesAdminDto,
  ModifierFilmDto,
  ModifierSeanceDto,
  SalleAdminDto,
  SeanceAdminDto,
  StatutFilmDto,
  StatutSeanceDto,
} from './dto/programmation.dto';
import { ProgrammationService } from './programmation.service';

@ApiTags('Back-office – programmation (US-7.1)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentification requise' })
@ApiForbiddenResponse({ description: 'Réservé aux rôles PROGRAMMATION et ADMIN' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROGRAMMATION', 'ADMIN')
@Controller('admin')
export class ProgrammationController {
  constructor(private readonly programmation: ProgrammationService) {}

  // ---------- Films ----------

  @Get('films')
  @ApiOperation({ summary: 'Lister tous les films, y compris brouillons et archives' })
  @ApiOkResponse({ type: [FilmAdminDto] })
  listerFilms(): Promise<FilmAdminDto[]> {
    return this.programmation.listerFilms();
  }

  @Post('films')
  @ApiOperation({ summary: 'Créer un film (créé en brouillon)' })
  @ApiCreatedResponse({ type: FilmAdminDto })
  creerFilm(
    @UtilisateurCourant() u: UtilisateurJwt,
    @Body() dto: CreerFilmDto,
  ): Promise<FilmAdminDto> {
    return this.programmation.creerFilm(u.id, dto);
  }

  @Patch('films/:id')
  @ApiOperation({ summary: 'Modifier un film' })
  @ApiOkResponse({ type: FilmAdminDto })
  @ApiNotFoundResponse({ description: 'Film introuvable' })
  @ApiConflictResponse({ description: 'Durée verrouillée par des séances à venir' })
  modifierFilm(
    @UtilisateurCourant() u: UtilisateurJwt,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierFilmDto,
  ): Promise<FilmAdminDto> {
    return this.programmation.modifierFilm(u.id, id, dto);
  }

  @Patch('films/:id/statut')
  @ApiOperation({ summary: 'Publier, dépublier ou archiver un film' })
  @ApiOkResponse({ type: FilmAdminDto })
  @ApiConflictResponse({ description: 'Archivage impossible : séances à venir' })
  changerStatutFilm(
    @UtilisateurCourant() u: UtilisateurJwt,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StatutFilmDto,
  ): Promise<FilmAdminDto> {
    return this.programmation.changerStatutFilm(u.id, id, dto);
  }

  @Delete('films/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer un film jamais programmé' })
  @ApiNoContentResponse({ description: 'Film supprimé' })
  @ApiConflictResponse({ description: 'Film déjà programmé : à archiver' })
  supprimerFilm(
    @UtilisateurCourant() u: UtilisateurJwt,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.programmation.supprimerFilm(u.id, id);
  }

  // ---------- Salles ----------

  @Get('salles')
  @ApiOperation({ summary: 'Lister les salles' })
  @ApiOkResponse({ type: [SalleAdminDto] })
  listerSalles(): Promise<SalleAdminDto[]> {
    return this.programmation.listerSalles();
  }

  // ---------- Séances ----------

  @Get('seances')
  @ApiOperation({ summary: 'Lister les séances de la période, tous statuts confondus' })
  @ApiOkResponse({ type: [SeanceAdminDto] })
  listerSeances(@Query() filtres: FiltresSeancesAdminDto): Promise<SeanceAdminDto[]> {
    return this.programmation.listerSeances(filtres);
  }

  @Post('seances')
  @ApiOperation({
    summary: 'Programmer une séance (refus de tout chevauchement, nettoyage compris)',
  })
  @ApiCreatedResponse({ type: SeanceAdminDto })
  @ApiConflictResponse({ description: 'La salle est déjà occupée sur ce créneau' })
  creerSeance(
    @UtilisateurCourant() u: UtilisateurJwt,
    @Body() dto: CreerSeanceDto,
  ): Promise<SeanceAdminDto> {
    return this.programmation.creerSeance(u.id, dto);
  }

  @Patch('seances/:id')
  @ApiOperation({ summary: 'Modifier une séance' })
  @ApiOkResponse({ type: SeanceAdminDto })
  @ApiConflictResponse({ description: 'Chevauchement, ou séance déjà réservée' })
  modifierSeance(
    @UtilisateurCourant() u: UtilisateurJwt,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierSeanceDto,
  ): Promise<SeanceAdminDto> {
    return this.programmation.modifierSeance(u.id, id, dto);
  }

  @Patch('seances/:id/statut')
  @ApiOperation({ summary: 'Publier ou dépublier une séance' })
  @ApiOkResponse({ type: SeanceAdminDto })
  changerStatutSeance(
    @UtilisateurCourant() u: UtilisateurJwt,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StatutSeanceDto,
  ): Promise<SeanceAdminDto> {
    return this.programmation.changerStatutSeance(u.id, id, dto);
  }

  @Post('seances/:id/annulation')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Annuler une séance : billets invalidés, places libérées, remboursements à traiter',
  })
  annulerSeance(
    @UtilisateurCourant() u: UtilisateurJwt,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ reservationsAnnulees: number; remboursementsATraiter: number }> {
    return this.programmation.annulerSeance(u.id, id);
  }

  @Delete('seances/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer une séance sans aucune réservation' })
  @ApiNoContentResponse({ description: 'Séance supprimée' })
  @ApiConflictResponse({ description: 'Séance déjà réservée : passer par l’annulation' })
  supprimerSeance(
    @UtilisateurCourant() u: UtilisateurJwt,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.programmation.supprimerSeance(u.id, id);
  }

  // ---------- Journal ----------

  @Get('journal')
  @ApiOperation({ summary: 'Dernières modifications du back-office (qui, quoi, quand)' })
  @ApiOkResponse({ type: [EntreeJournalDto] })
  journal(): Promise<EntreeJournalDto[]> {
    return this.programmation.journal();
  }
}
