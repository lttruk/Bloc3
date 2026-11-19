import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toString as qrEnSvg } from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { BilletDto } from './dto/billets.dto';

@Injectable()
export class BilletsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Billets dématérialisés d'une réservation payée de l'utilisateur, avec leur QR code (US-5.1). */
  async billetsDeReservation(utilisateurId: number, reference: string): Promise<BilletDto[]> {
    const reservation = await this.prisma.reservation.findFirst({
      where: { reference, utilisateurId },
      select: {
        statut: true,
        utilisateur: { select: { prenom: true, nom: true } },
        seance: {
          select: {
            debut: true,
            version: true,
            film: { select: { titre: true } },
            salle: { select: { nom: true } },
          },
        },
        billets: {
          select: {
            id: true,
            codeQr: true,
            statut: true,
            scanneLe: true,
            prixApplique: true,
            place: { select: { rangee: true, numero: true, type: true } },
            tarif: { select: { libelle: true, justificatifRequis: true } },
          },
          orderBy: { placeId: 'asc' },
        },
      },
    });
    // La réservation d'un autre spectateur est traitée comme inexistante.
    if (!reservation) throw new NotFoundException('Réservation introuvable.');
    if (reservation.statut !== 'CONFIRMEE') {
      throw new ConflictException('Les billets sont disponibles une fois la réservation payée.');
    }

    const { seance, utilisateur } = reservation;
    const billets = reservation.billets.filter((b) => b.codeQr !== null);
    return Promise.all(
      billets.map(async (b) => ({
        id: b.id,
        film: seance.film.titre,
        debut: seance.debut,
        salle: seance.salle.nom,
        version: seance.version,
        place: `${b.place.rangee}${b.place.numero}`,
        pmr: b.place.type === 'PMR',
        tarif: b.tarif.libelle,
        justificatifRequis: b.tarif.justificatifRequis,
        prix: Number(b.prixApplique),
        titulaire: `${utilisateur.prenom} ${utilisateur.nom}`,
        statut: b.statut,
        scanneLe: b.scanneLe,
        codeQr: b.codeQr as string,
        qrSvg: await qrEnSvg(b.codeQr as string, {
          type: 'svg',
          errorCorrectionLevel: 'M',
          margin: 2,
        }),
      })),
    );
  }
}
