import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const normaliserEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class InscriptionDto {
  @ApiProperty({ example: 'Durand' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nom: string;

  @ApiProperty({ example: 'Camille' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  prenom: string;

  @ApiProperty({ example: 'camille.durand@exemple.fr' })
  @Transform(normaliserEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    description: '12 caractères minimum, dont une majuscule, une minuscule et un chiffre',
    example: 'MotDePasse2027',
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Le mot de passe doit contenir une majuscule, une minuscule et un chiffre.',
  })
  motDePasse: string;

  @ApiProperty({ description: 'Acceptation de la politique de confidentialité (RGPD)' })
  @IsBoolean()
  @Equals(true, { message: 'Le consentement RGPD est obligatoire.' })
  consentementRgpd: boolean;
}

export class ConnexionDto {
  @ApiProperty({ example: 'camille.durand@exemple.fr' })
  @Transform(normaliserEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  motDePasse: string;
}

export class JetonDto {
  @ApiProperty({ description: 'Jeton JWT à envoyer dans l’en-tête Authorization: Bearer' })
  accessToken: string;

  @ApiProperty({ enum: Role })
  role: Role;
}

export class UtilisateurPublicDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  nom: string;

  @ApiProperty()
  prenom: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;
}
