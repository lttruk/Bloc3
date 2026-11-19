import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, ResultatConnexion } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ConnexionDto, InscriptionDto, UtilisateurPublicDto } from './dto/auth.dto';
import { tronquerIp } from './ip-tronquee';
import { SessionOuverte, SessionsService } from './sessions.service';

const CHAMPS_PUBLICS = { id: true, nom: true, prenom: true, email: true, role: true } as const;
const MESSAGE_IDENTIFIANTS = 'E-mail ou mot de passe incorrect.';
/** Échecs consécutifs tolérés avant le blocage temporaire du compte (US-2.2). */
export const MAX_ECHECS_CONNEXION = 5;
export const DUREE_BLOCAGE_MS = 15 * 60 * 1000;

function compteBloque(jusqua: Date, maintenant: Date): HttpException {
  const minutes = Math.max(1, Math.ceil((jusqua.getTime() - maintenant.getTime()) / 60_000));
  return new HttpException(
    `Trop de tentatives échouées : compte bloqué temporairement. Réessayez dans ${minutes} min.`,
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

@Injectable()
export class AuthService {
  // Empreinte calculée une seule fois : elle sert à vérifier un mot de passe même quand
  // l'e-mail est inconnu, pour que le temps de réponse ne révèle pas l'existence d'un compte.
  private empreinteFactice?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  async inscrire(dto: InscriptionDto): Promise<UtilisateurPublicDto> {
    try {
      return await this.prisma.utilisateur.create({
        data: {
          nom: dto.nom.trim(),
          prenom: dto.prenom.trim(),
          email: dto.email,
          motDePasseHash: await argon2.hash(dto.motDePasse),
          role: 'CLIENT',
          consentementRgpdLe: new Date(),
        },
        select: CHAMPS_PUBLICS,
      });
    } catch (erreur) {
      if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === 'P2002') {
        throw new ConflictException('Un compte existe déjà avec cet e-mail.');
      }
      throw erreur;
    }
  }

  /**
   * Connexion : chaque tentative est journalisée (IP tronquée) ; après 5 échecs consécutifs,
   * le compte est bloqué 15 minutes, même pour le bon mot de passe.
   */
  async connecter(dto: ConnexionDto, ip?: string): Promise<SessionOuverte> {
    const maintenant = new Date();
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email: dto.email },
      select: { id: true, role: true, motDePasseHash: true, bloqueJusquA: true },
    });

    if (utilisateur?.bloqueJusquA && utilisateur.bloqueJusquA > maintenant) {
      await this.journaliser(utilisateur.id, 'BLOQUE', ip);
      throw compteBloque(utilisateur.bloqueJusquA, maintenant);
    }

    const empreinte = utilisateur?.motDePasseHash ?? (await this.obtenirEmpreinteFactice());
    const valide = await argon2.verify(empreinte, dto.motDePasse);
    if (!utilisateur) {
      await this.journaliser(null, 'ECHEC', ip);
      throw new UnauthorizedException(MESSAGE_IDENTIFIANTS);
    }
    if (!valide) {
      await this.journaliser(utilisateur.id, 'ECHEC', ip);
      return this.compterEchec(utilisateur.id, maintenant);
    }

    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { echecsConnexion: 0, bloqueJusquA: null },
    });
    await this.journaliser(utilisateur.id, 'SUCCES', ip);
    return this.sessions.ouvrir(utilisateur.id, utilisateur.role);
  }

  async profil(id: number): Promise<UtilisateurPublicDto> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id },
      select: CHAMPS_PUBLICS,
    });
    if (!utilisateur) throw new UnauthorizedException();
    return utilisateur;
  }

  /** Incrémente les échecs (atomiquement) et bloque le compte au 5e ; lève toujours une erreur. */
  private async compterEchec(utilisateurId: number, maintenant: Date): Promise<never> {
    const { echecsConnexion } = await this.prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { echecsConnexion: { increment: 1 } },
      select: { echecsConnexion: true },
    });
    if (echecsConnexion < MAX_ECHECS_CONNEXION) {
      throw new UnauthorizedException(MESSAGE_IDENTIFIANTS);
    }
    const jusqua = new Date(maintenant.getTime() + DUREE_BLOCAGE_MS);
    await this.prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { echecsConnexion: 0, bloqueJusquA: jusqua },
    });
    throw compteBloque(jusqua, maintenant);
  }

  private async journaliser(
    utilisateurId: number | null,
    resultat: ResultatConnexion,
    ip?: string,
  ): Promise<void> {
    await this.prisma.journalConnexion.create({
      data: { utilisateurId, resultat, ipTronquee: tronquerIp(ip) },
    });
  }

  private obtenirEmpreinteFactice(): Promise<string> {
    return (this.empreinteFactice ??= argon2.hash('empreinte-factice-non-utilisable'));
  }
}
