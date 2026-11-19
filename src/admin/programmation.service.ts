import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EntiteJournal, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

/** Temps de nettoyage de la salle ajouté après chaque séance (US-7.1). */
export const NETTOYAGE_MINUTES = 15;
export const PERIODE_ADMIN_PAR_DEFAUT_MS = 7 * 24 * 3600 * 1000;
const MAX_SEANCES = 500;
const TAILLE_JOURNAL = 50;

// Sérialisable : les lectures de contrôle du chevauchement posent des verrous partagés,
// deux créations simultanées dans la même salle ne peuvent donc pas passer toutes les deux.
const OPTIONS_TRANSACTION = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 10_000,
};

type Tx = Prisma.TransactionClient;

/** Fin d'une séance : durée du film + nettoyage de la salle. */
export function finDeSeance(debut: Date, dureeMinutes: number): Date {
  return new Date(debut.getTime() + (dureeMinutes + NETTOYAGE_MINUTES) * 60_000);
}

const SELECTION_SEANCE = {
  id: true,
  debut: true,
  fin: true,
  version: true,
  festival: true,
  ouvertureVente: true,
  statut: true,
  film: { select: { id: true, titre: true, dureeMinutes: true } },
  salle: { select: { id: true, nom: true } },
  _count: { select: { billets: { where: { statut: { not: 'ANNULE' } } } } },
} satisfies Prisma.SeanceSelect;

type SeanceLue = Prisma.SeanceGetPayload<{ select: typeof SELECTION_SEANCE }>;

function versSeanceAdmin({ _count, ...seance }: SeanceLue): SeanceAdminDto {
  return { ...seance, billetsActifs: _count.billets };
}

/** Copie JSON d'un DTO pour le journal (les champs absents disparaissent). */
function enJson(objet: object): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(objet)) as Prisma.InputJsonObject;
}

function estConflitTransaction(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034';
}

const fmtHoraire = (d: Date) =>
  d.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

@Injectable()
export class ProgrammationService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Films ----------

  async listerFilms(): Promise<FilmAdminDto[]> {
    const films = await this.prisma.film.findMany({
      orderBy: [{ statut: 'asc' }, { titre: 'asc' }],
      include: {
        _count: {
          select: { seances: { where: { statut: { not: 'ANNULEE' }, debut: { gt: new Date() } } } },
        },
      },
    });
    return films.map(({ _count, ...film }) => ({ ...film, seancesAVenir: _count.seances }));
  }

  async creerFilm(utilisateurId: number, dto: CreerFilmDto): Promise<FilmAdminDto> {
    return this.prisma.$transaction(async (tx) => {
      const film = await tx.film.create({ data: { ...dto, statut: 'BROUILLON' } });
      await this.journaliser(tx, utilisateurId, 'CREATION', 'FILM', film.id, { titre: film.titre });
      return { ...film, seancesAVenir: 0 };
    });
  }

  async modifierFilm(
    utilisateurId: number,
    id: number,
    dto: ModifierFilmDto,
  ): Promise<FilmAdminDto> {
    return this.prisma.$transaction(async (tx) => {
      const avant = await this.filmOuErreur(tx, id);
      const seancesAVenir = await this.compterSeancesAVenir(tx, id);
      if (
        dto.dureeMinutes !== undefined &&
        dto.dureeMinutes !== avant.dureeMinutes &&
        seancesAVenir > 0
      ) {
        throw new ConflictException(
          'La durée ne peut pas changer tant que des séances à venir sont programmées : elle fixe leurs horaires.',
        );
      }
      const film = await tx.film.update({ where: { id }, data: dto });
      await this.journaliser(tx, utilisateurId, 'MODIFICATION', 'FILM', id, {
        avant: { titre: avant.titre, dureeMinutes: avant.dureeMinutes, genre: avant.genre },
        modifications: enJson(dto),
      });
      return { ...film, seancesAVenir };
    });
  }

  async changerStatutFilm(
    utilisateurId: number,
    id: number,
    dto: StatutFilmDto,
  ): Promise<FilmAdminDto> {
    return this.prisma.$transaction(async (tx) => {
      const avant = await this.filmOuErreur(tx, id);
      const seancesAVenir = await this.compterSeancesAVenir(tx, id);
      if (dto.statut === 'ARCHIVE' && seancesAVenir > 0) {
        throw new ConflictException(
          'Ce film a encore des séances à venir : annulez-les avant de l’archiver.',
        );
      }
      const film = await tx.film.update({ where: { id }, data: { statut: dto.statut } });
      await this.journaliser(tx, utilisateurId, 'STATUT', 'FILM', id, {
        avant: avant.statut,
        apres: dto.statut,
      });
      return { ...film, seancesAVenir };
    });
  }

  async supprimerFilm(utilisateurId: number, id: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const film = await this.filmOuErreur(tx, id);
      if ((await tx.seance.count({ where: { filmId: id } })) > 0) {
        throw new ConflictException(
          'Ce film a déjà été programmé : archivez-le plutôt que de le supprimer.',
        );
      }
      await tx.film.delete({ where: { id } });
      await this.journaliser(tx, utilisateurId, 'SUPPRESSION', 'FILM', id, { titre: film.titre });
    });
  }

  // ---------- Salles ----------

  listerSalles(): Promise<SalleAdminDto[]> {
    return this.prisma.salle.findMany({
      select: { id: true, nom: true, capacite: true },
      orderBy: { nom: 'asc' },
    });
  }

  // ---------- Séances ----------

  async listerSeances(filtres: FiltresSeancesAdminDto): Promise<SeanceAdminDto[]> {
    const du = filtres.du ? new Date(filtres.du) : new Date();
    const au = filtres.au
      ? new Date(filtres.au)
      : new Date(du.getTime() + PERIODE_ADMIN_PAR_DEFAUT_MS);
    if (au <= du) throw new BadRequestException('La fin de période doit suivre son début.');
    const seances = await this.prisma.seance.findMany({
      where: {
        debut: { gte: du, lte: au },
        ...(filtres.salleId ? { salleId: filtres.salleId } : {}),
      },
      select: SELECTION_SEANCE,
      orderBy: [{ debut: 'asc' }, { salleId: 'asc' }],
      take: MAX_SEANCES,
    });
    return seances.map(versSeanceAdmin);
  }

  async creerSeance(utilisateurId: number, dto: CreerSeanceDto): Promise<SeanceAdminDto> {
    return this.transactionProgrammation(async (tx) => {
      const film = await this.filmOuErreur(tx, dto.filmId);
      if (film.statut === 'ARCHIVE') {
        throw new UnprocessableEntityException('Un film archivé ne peut plus être programmé.');
      }
      await this.salleOuErreur(tx, dto.salleId);
      const debut = new Date(dto.debut);
      const ouvertureVente = dto.ouvertureVente ? new Date(dto.ouvertureVente) : null;
      this.verifierHoraires(debut, ouvertureVente);
      const fin = finDeSeance(debut, film.dureeMinutes);
      await this.verifierSalleLibre(tx, dto.salleId, debut, fin);

      const seance = await tx.seance.create({
        data: {
          filmId: dto.filmId,
          salleId: dto.salleId,
          debut,
          fin,
          version: dto.version ?? 'VF',
          festival: dto.festival ?? false,
          ouvertureVente,
          statut: 'PROGRAMMEE',
        },
        select: SELECTION_SEANCE,
      });
      await this.journaliser(tx, utilisateurId, 'CREATION', 'SEANCE', seance.id, {
        film: film.titre,
        salleId: dto.salleId,
        debut: debut.toISOString(),
      });
      return versSeanceAdmin(seance);
    });
  }

  async modifierSeance(
    utilisateurId: number,
    id: number,
    dto: ModifierSeanceDto,
  ): Promise<SeanceAdminDto> {
    return this.transactionProgrammation(async (tx) => {
      const avant = await this.seanceOuErreur(tx, id);
      if (avant.statut === 'ANNULEE') throw new ConflictException('Cette séance est annulée.');

      const filmId = dto.filmId ?? avant.film.id;
      const salleId = dto.salleId ?? avant.salle.id;
      const debut = dto.debut ? new Date(dto.debut) : avant.debut;
      const horaireOuLieuChange =
        filmId !== avant.film.id ||
        salleId !== avant.salle.id ||
        debut.getTime() !== avant.debut.getTime();
      if (horaireOuLieuChange && avant._count.billets > 0) {
        throw new ConflictException(
          'Des billets sont déjà vendus pour cette séance : son film, sa salle et son horaire ne peuvent plus changer. Annulez-la si nécessaire.',
        );
      }

      let dureeMinutes = avant.film.dureeMinutes;
      if (filmId !== avant.film.id) {
        const nouveauFilm = await this.filmOuErreur(tx, filmId);
        if (nouveauFilm.statut === 'ARCHIVE') {
          throw new UnprocessableEntityException('Un film archivé ne peut plus être programmé.');
        }
        dureeMinutes = nouveauFilm.dureeMinutes;
      }
      if (salleId !== avant.salle.id) await this.salleOuErreur(tx, salleId);
      const ouvertureVente =
        dto.ouvertureVente !== undefined ? new Date(dto.ouvertureVente) : avant.ouvertureVente;
      if (horaireOuLieuChange || dto.ouvertureVente !== undefined)
        this.verifierHoraires(debut, ouvertureVente);
      const fin = finDeSeance(debut, dureeMinutes);
      if (horaireOuLieuChange) await this.verifierSalleLibre(tx, salleId, debut, fin, id);

      const seance = await tx.seance.update({
        where: { id },
        data: {
          filmId,
          salleId,
          debut,
          fin,
          ouvertureVente,
          ...(dto.version ? { version: dto.version } : {}),
          ...(dto.festival !== undefined ? { festival: dto.festival } : {}),
        },
        select: SELECTION_SEANCE,
      });
      await this.journaliser(tx, utilisateurId, 'MODIFICATION', 'SEANCE', id, {
        avant: { filmId: avant.film.id, salleId: avant.salle.id, debut: avant.debut.toISOString() },
        modifications: enJson(dto),
      });
      return versSeanceAdmin(seance);
    });
  }

  async changerStatutSeance(
    utilisateurId: number,
    id: number,
    dto: StatutSeanceDto,
  ): Promise<SeanceAdminDto> {
    return this.prisma.$transaction(async (tx) => {
      const avant = await this.seanceOuErreur(tx, id);
      if (avant.statut === 'ANNULEE') throw new ConflictException('Cette séance est annulée.');
      if (dto.statut === 'PUBLIEE') {
        const film = await this.filmOuErreur(tx, avant.film.id);
        if (film.statut !== 'PUBLIE') {
          throw new UnprocessableEntityException(
            'Publiez d’abord le film pour rendre ses séances visibles.',
          );
        }
      }
      const seance = await tx.seance.update({
        where: { id },
        data: { statut: dto.statut },
        select: SELECTION_SEANCE,
      });
      await this.journaliser(tx, utilisateurId, 'STATUT', 'SEANCE', id, {
        avant: avant.statut,
        apres: dto.statut,
      });
      return versSeanceAdmin(seance);
    });
  }

  /**
   * Annule une séance : ses billets sont invalidés, ses places libérées et ses réservations annulées.
   * Le remboursement des réservations payées passe par le prestataire de paiement (US-4.2).
   */
  async annulerSeance(
    utilisateurId: number,
    id: number,
  ): Promise<{ reservationsAnnulees: number; remboursementsATraiter: number }> {
    return this.prisma.$transaction(async (tx) => {
      const seance = await this.seanceOuErreur(tx, id);
      if (seance.statut === 'ANNULEE')
        throw new ConflictException('Cette séance est déjà annulée.');
      if (seance.debut <= new Date())
        throw new ConflictException('Une séance passée ne peut pas être annulée.');

      const remboursementsATraiter = await tx.reservation.count({
        where: { seanceId: id, statut: 'CONFIRMEE' },
      });
      await tx.billet.updateMany({
        where: { seanceId: id, statut: { not: 'ANNULE' } },
        data: { statut: 'ANNULE' },
      });
      const { count: reservationsAnnulees } = await tx.reservation.updateMany({
        where: { seanceId: id, statut: { in: ['EN_ATTENTE', 'CONFIRMEE'] } },
        data: { statut: 'ANNULEE' },
      });
      await tx.seance.update({ where: { id }, data: { statut: 'ANNULEE' } });
      await this.journaliser(tx, utilisateurId, 'ANNULATION', 'SEANCE', id, {
        reservationsAnnulees,
        remboursementsATraiter,
      });
      return { reservationsAnnulees, remboursementsATraiter };
    }, OPTIONS_TRANSACTION);
  }

  async supprimerSeance(utilisateurId: number, id: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const seance = await this.seanceOuErreur(tx, id);
      if ((await tx.reservation.count({ where: { seanceId: id } })) > 0) {
        throw new ConflictException(
          'Cette séance a déjà des réservations : elle ne peut pas être supprimée, utilisez l’annulation.',
        );
      }
      await tx.seance.delete({ where: { id } });
      await this.journaliser(tx, utilisateurId, 'SUPPRESSION', 'SEANCE', id, {
        film: seance.film.titre,
        debut: seance.debut.toISOString(),
      });
    });
  }

  // ---------- Journal ----------

  async journal(): Promise<EntreeJournalDto[]> {
    const entrees = await this.prisma.journalAdmin.findMany({
      orderBy: { id: 'desc' },
      take: TAILLE_JOURNAL,
      include: { utilisateur: { select: { prenom: true, nom: true } } },
    });
    return entrees.map((e) => ({
      id: e.id,
      action: e.action,
      entite: e.entite,
      entiteId: e.entiteId,
      details: e.details,
      creeLe: e.creeLe,
      auteur: `${e.utilisateur.prenom} ${e.utilisateur.nom}`,
    }));
  }

  // ---------- Règles communes ----------

  private async transactionProgrammation<T>(travail: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(travail, OPTIONS_TRANSACTION);
    } catch (e) {
      if (estConflitTransaction(e)) {
        throw new ConflictException(
          'La programmation de cette salle vient d’être modifiée. Merci de réessayer.',
        );
      }
      throw e;
    }
  }

  private verifierHoraires(debut: Date, ouvertureVente: Date | null): void {
    if (debut <= new Date())
      throw new UnprocessableEntityException('Une séance doit commencer dans le futur.');
    if (ouvertureVente && ouvertureVente >= debut) {
      throw new UnprocessableEntityException(
        'L’ouverture de la vente doit précéder le début de la séance.',
      );
    }
  }

  /** Refuse tout chevauchement dans la salle, nettoyage compris (les séances annulées libèrent le créneau). */
  private async verifierSalleLibre(
    tx: Tx,
    salleId: number,
    debut: Date,
    fin: Date,
    sauf?: number,
  ): Promise<void> {
    const conflit = await tx.seance.findFirst({
      where: {
        salleId,
        statut: { not: 'ANNULEE' },
        debut: { lt: fin },
        fin: { gt: debut },
        ...(sauf ? { id: { not: sauf } } : {}),
      },
      select: { debut: true, fin: true, film: { select: { titre: true } } },
    });
    if (conflit) {
      throw new ConflictException(
        `La salle est déjà occupée par « ${conflit.film.titre} » de ${fmtHoraire(conflit.debut)} à ${fmtHoraire(conflit.fin)} (nettoyage compris).`,
      );
    }
  }

  private async filmOuErreur(tx: Tx, id: number) {
    const film = await tx.film.findUnique({ where: { id } });
    if (!film) throw new NotFoundException('Film introuvable.');
    return film;
  }

  private async salleOuErreur(tx: Tx, id: number) {
    const salle = await tx.salle.findUnique({ where: { id }, select: { id: true } });
    if (!salle) throw new NotFoundException('Salle introuvable.');
    return salle;
  }

  private async seanceOuErreur(tx: Tx, id: number): Promise<SeanceLue> {
    const seance = await tx.seance.findUnique({ where: { id }, select: SELECTION_SEANCE });
    if (!seance) throw new NotFoundException('Séance introuvable.');
    return seance;
  }

  private compterSeancesAVenir(tx: Tx, filmId: number): Promise<number> {
    return tx.seance.count({
      where: { filmId, statut: { not: 'ANNULEE' }, debut: { gt: new Date() } },
    });
  }

  private async journaliser(
    tx: Tx,
    utilisateurId: number,
    action: string,
    entite: EntiteJournal,
    entiteId: number,
    details: Prisma.InputJsonObject,
  ): Promise<void> {
    await tx.journalAdmin.create({ data: { utilisateurId, action, entite, entiteId, details } });
  }
}
