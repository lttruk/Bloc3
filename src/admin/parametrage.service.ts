import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntiteJournal, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfigurationSalleDto,
  ConfigurationSalleLueDto,
  CreerTarifDto,
  ModifierTarifDto,
  RangeeConfigDto,
  TarifAdminDto,
} from './dto/parametrage.dto';

type Tx = Prisma.TransactionClient;

const SELECTION_TARIF = {
  id: true,
  libelle: true,
  prix: true,
  justificatifRequis: true,
  actif: true,
  _count: { select: { billets: { where: { statut: { not: 'ANNULE' } } } } },
} satisfies Prisma.TarifSelect;

type TarifLu = Prisma.TarifGetPayload<{ select: typeof SELECTION_TARIF }>;

function versTarifAdmin({ _count, prix, ...t }: TarifLu): TarifAdminDto {
  return { ...t, prix: Number(prix), billetsVendus: _count.billets };
}

function estDoublon(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

const enJson = (objet: object) => JSON.parse(JSON.stringify(objet)) as Prisma.InputJsonObject;

/** Paramétrage réservé à l'administrateur (US-7.2) : tarifs et configuration des salles. */
@Injectable()
export class ParametrageService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Tarifs ----------

  async listerTarifs(): Promise<TarifAdminDto[]> {
    const tarifs = await this.prisma.tarif.findMany({
      select: SELECTION_TARIF,
      orderBy: [{ actif: 'desc' }, { prix: 'desc' }],
    });
    return tarifs.map(versTarifAdmin);
  }

  async creerTarif(utilisateurId: number, dto: CreerTarifDto): Promise<TarifAdminDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tarif = await tx.tarif.create({
          data: {
            libelle: dto.libelle,
            prix: dto.prix,
            justificatifRequis: dto.justificatifRequis ?? false,
          },
          select: SELECTION_TARIF,
        });
        await this.journaliser(tx, utilisateurId, 'CREATION', 'TARIF', tarif.id, enJson(dto));
        return versTarifAdmin(tarif);
      });
    } catch (e) {
      if (estDoublon(e)) throw new ConflictException('Un tarif porte déjà ce libellé.');
      throw e;
    }
  }

  /**
   * Modifie ou active / désactive un tarif. Les billets déjà vendus ne changent pas :
   * chacun a enregistré son prix au moment de la vente.
   */
  async modifierTarif(
    utilisateurId: number,
    id: number,
    dto: ModifierTarifDto,
  ): Promise<TarifAdminDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const avant = await tx.tarif.findUnique({ where: { id } });
        if (!avant) throw new NotFoundException('Tarif introuvable.');
        const tarif = await tx.tarif.update({ where: { id }, data: dto, select: SELECTION_TARIF });
        await this.journaliser(tx, utilisateurId, 'MODIFICATION', 'TARIF', id, {
          avant: { libelle: avant.libelle, prix: Number(avant.prix), actif: avant.actif },
          modifications: enJson(dto),
        });
        return versTarifAdmin(tarif);
      });
    } catch (e) {
      if (estDoublon(e)) throw new ConflictException('Un tarif porte déjà ce libellé.');
      throw e;
    }
  }

  // ---------- Configuration des salles ----------

  async lireConfiguration(salleId: number): Promise<ConfigurationSalleLueDto> {
    const salle = await this.prisma.salle.findUnique({
      where: { id: salleId },
      select: { id: true, nom: true, capacite: true },
    });
    if (!salle) throw new NotFoundException('Salle introuvable.');
    const [places, seancesAVenir] = await Promise.all([
      this.prisma.place.findMany({
        where: { salleId, retireeLe: null },
        select: { rangee: true, numero: true, type: true },
        orderBy: [{ rangee: 'asc' }, { numero: 'asc' }],
      }),
      this.prisma.seance.count({
        where: { salleId, statut: { not: 'ANNULEE' }, debut: { gt: new Date() } },
      }),
    ]);
    const rangees = new Map<string, RangeeConfigDto>();
    for (const p of places) {
      const r = rangees.get(p.rangee) ?? { rangee: p.rangee, places: 0, pmr: [] };
      r.places = Math.max(r.places, p.numero);
      if (p.type === 'PMR') r.pmr!.push(p.numero);
      rangees.set(p.rangee, r);
    }
    return { salle, rangees: [...rangees.values()], seancesAVenir };
  }

  /**
   * Reconfigure une salle modulable. Les places retirées sont datées et jamais supprimées : les
   * séances déjà programmées gardent leur plan et leurs billets, seules les nouvelles séances
   * utilisent la nouvelle configuration.
   */
  async configurerSalle(
    utilisateurId: number,
    salleId: number,
    dto: ConfigurationSalleDto,
  ): Promise<ConfigurationSalleLueDto> {
    const voulues = new Map<string, { rangee: string; numero: number; type: 'STANDARD' | 'PMR' }>();
    const lettres = new Set<string>();
    for (const r of dto.rangees) {
      if (lettres.has(r.rangee))
        throw new BadRequestException(`La rangée ${r.rangee} est déclarée deux fois.`);
      lettres.add(r.rangee);
      const pmr = new Set(r.pmr ?? []);
      for (const n of pmr) {
        if (n < 1 || n > r.places) {
          throw new BadRequestException(
            `La place PMR ${r.rangee}${n} n’existe pas dans la rangée.`,
          );
        }
      }
      for (let numero = 1; numero <= r.places; numero++) {
        voulues.set(`${r.rangee}-${numero}`, {
          rangee: r.rangee,
          numero,
          type: pmr.has(numero) ? 'PMR' : 'STANDARD',
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const salle = await tx.salle.findUnique({
        where: { id: salleId },
        select: { capacite: true },
      });
      if (!salle) throw new NotFoundException('Salle introuvable.');
      const maintenant = new Date();
      const existantes = await tx.place.findMany({
        where: { salleId },
        select: { id: true, rangee: true, numero: true, type: true, retireeLe: true },
      });
      const parPosition = new Map(existantes.map((p) => [`${p.rangee}-${p.numero}`, p]));

      // Places qui sortent de la configuration : datées, conservées pour les séances existantes
      const aRetirer = existantes.filter(
        (p) => p.retireeLe === null && !voulues.has(`${p.rangee}-${p.numero}`),
      );
      if (aRetirer.length > 0) {
        await tx.place.updateMany({
          where: { id: { in: aRetirer.map((p) => p.id) } },
          data: { retireeLe: maintenant, active: false },
        });
      }
      const aCreer: Prisma.PlaceCreateManyInput[] = [];
      for (const [position, voulue] of voulues) {
        const existante = parPosition.get(position);
        if (!existante) {
          aCreer.push({ salleId, ...voulue, ajouteeLe: maintenant });
        } else if (existante.retireeLe !== null || existante.type !== voulue.type) {
          // Une position déjà connue est réactivée (la contrainte d'unicité interdit de la recréer)
          await tx.place.update({
            where: { id: existante.id },
            data: { type: voulue.type, retireeLe: null, active: true },
          });
        }
      }
      if (aCreer.length > 0) await tx.place.createMany({ data: aCreer });
      await tx.salle.update({ where: { id: salleId }, data: { capacite: voulues.size } });
      await this.journaliser(tx, utilisateurId, 'MODIFICATION', 'SALLE', salleId, {
        capaciteAvant: salle.capacite,
        capaciteApres: voulues.size,
        placesRetirees: aRetirer.length,
        placesAjoutees: aCreer.length,
      });
    });
    return this.lireConfiguration(salleId);
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
