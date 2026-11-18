import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ConnexionDto, InscriptionDto, JetonDto, UtilisateurPublicDto } from './dto/auth.dto';

const CHAMPS_PUBLICS = { id: true, nom: true, prenom: true, email: true, role: true } as const;
const MESSAGE_IDENTIFIANTS = 'E-mail ou mot de passe incorrect.';

@Injectable()
export class AuthService {
  // Empreinte calculée une seule fois : elle sert à vérifier un mot de passe même quand
  // l'e-mail est inconnu, pour que le temps de réponse ne révèle pas l'existence d'un compte.
  private empreinteFactice?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
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

  async connecter(dto: ConnexionDto): Promise<JetonDto> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email: dto.email },
      select: { id: true, role: true, motDePasseHash: true },
    });
    const empreinte = utilisateur?.motDePasseHash ?? (await this.obtenirEmpreinteFactice());
    const valide = await argon2.verify(empreinte, dto.motDePasse);
    if (!utilisateur || !valide) {
      throw new UnauthorizedException(MESSAGE_IDENTIFIANTS);
    }
    const accessToken = await this.jwt.signAsync({ sub: utilisateur.id, role: utilisateur.role });
    return { accessToken, role: utilisateur.role };
  }

  async profil(id: number): Promise<UtilisateurPublicDto> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id },
      select: CHAMPS_PUBLICS,
    });
    if (!utilisateur) throw new UnauthorizedException();
    return utilisateur;
  }

  private obtenirEmpreinteFactice(): Promise<string> {
    return (this.empreinteFactice ??= argon2.hash('empreinte-factice-non-utilisable'));
  }
}
