import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { StatutFilm, StatutSeance, Version } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const nettoyer = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ---------- Films ----------

export class CreerFilmDto {
  @ApiProperty({ example: 'Hors Ligne' })
  @Transform(nettoyer)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titre!: string;

  @ApiPropertyOptional({ example: 'Une panne mondiale coupe tous les réseaux…' })
  @IsOptional()
  @Transform(nettoyer)
  @IsString()
  @MaxLength(5000)
  synopsis?: string;

  @ApiProperty({ example: 112, description: 'Durée en minutes' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  dureeMinutes!: number;

  @ApiPropertyOptional({ example: 'Thriller' })
  @IsOptional()
  @Transform(nettoyer)
  @IsString()
  @MaxLength(50)
  genre?: string;

  @ApiPropertyOptional({ example: 'Tous publics' })
  @IsOptional()
  @Transform(nettoyer)
  @IsString()
  @MaxLength(30)
  classification?: string;

  @ApiPropertyOptional({
    example: 'https://www.youtube.com/watch?v=abcdefghijk',
    nullable: true,
    description: 'Lien https vers la bande-annonce (US-1.2) ; une chaîne vide le retire',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'La bande-annonce doit être un lien https valide.' },
  )
  @MaxLength(500)
  bandeAnnonceUrl?: string | null;
}

export class ModifierFilmDto extends PartialType(CreerFilmDto) {}

export class StatutFilmDto {
  @ApiProperty({ enum: StatutFilm, description: 'BROUILLON (dépublié), PUBLIE ou ARCHIVE' })
  @IsEnum(StatutFilm)
  statut!: StatutFilm;
}

export class FilmAdminDto {
  @ApiProperty() id!: number;
  @ApiProperty() titre!: string;
  @ApiProperty({ nullable: true }) synopsis!: string | null;
  @ApiProperty() dureeMinutes!: number;
  @ApiProperty({ nullable: true }) genre!: string | null;
  @ApiProperty({ nullable: true }) classification!: string | null;
  @ApiProperty({ nullable: true }) bandeAnnonceUrl!: string | null;
  @ApiProperty({ enum: StatutFilm }) statut!: StatutFilm;
  @ApiProperty({ description: 'Nombre de séances à venir non annulées' }) seancesAVenir!: number;
}

// ---------- Séances ----------

export class CreerSeanceDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  filmId!: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  salleId!: number;

  @ApiProperty({
    example: '2026-12-01T20:00:00+01:00',
    description: 'Début de la séance (ISO 8601)',
  })
  @IsISO8601()
  debut!: string;

  @ApiPropertyOptional({ enum: Version, default: Version.VF })
  @IsOptional()
  @IsEnum(Version)
  version?: Version;

  @ApiPropertyOptional({ description: 'Séance labellisée Jazz Festival', default: false })
  @IsOptional()
  @IsBoolean()
  festival?: boolean;

  @ApiPropertyOptional({
    description: 'Ouverture de la vente en ligne (ISO 8601), immédiate si absente',
  })
  @IsOptional()
  @IsISO8601()
  ouvertureVente?: string;
}

export class ModifierSeanceDto extends PartialType(CreerSeanceDto) {}

export class StatutSeanceDto {
  @ApiProperty({
    enum: [StatutSeance.PROGRAMMEE, StatutSeance.PUBLIEE],
    description: 'PUBLIEE (visible et réservable) ou PROGRAMMEE (dépubliée)',
  })
  @IsIn([StatutSeance.PROGRAMMEE, StatutSeance.PUBLIEE])
  statut!: 'PROGRAMMEE' | 'PUBLIEE';
}

export class FiltresSeancesAdminDto {
  @ApiPropertyOptional({ description: 'Début de période (ISO 8601), par défaut maintenant' })
  @IsOptional()
  @IsISO8601()
  du?: string;

  @ApiPropertyOptional({ description: 'Fin de période (ISO 8601), par défaut dans 7 jours' })
  @IsOptional()
  @IsISO8601()
  au?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  salleId?: number;
}

export class SeanceAdminDto {
  @ApiProperty() id!: number;
  @ApiProperty() debut!: Date;
  @ApiProperty({ description: 'Fin, nettoyage de la salle compris' }) fin!: Date;
  @ApiProperty({ enum: Version }) version!: Version;
  @ApiProperty() festival!: boolean;
  @ApiProperty({ nullable: true }) ouvertureVente!: Date | null;
  @ApiProperty({ enum: StatutSeance }) statut!: StatutSeance;
  @ApiProperty() film!: { id: number; titre: string; dureeMinutes: number };
  @ApiProperty() salle!: { id: number; nom: string };
  @ApiProperty({ description: 'Billets vendus ou en cours de paiement' }) billetsActifs!: number;
}

export class SalleAdminDto {
  @ApiProperty() id!: number;
  @ApiProperty() nom!: string;
  @ApiProperty() capacite!: number;
}

export class EntreeJournalDto {
  @ApiProperty() id!: number;
  @ApiProperty() action!: string;
  @ApiProperty({ enum: ['FILM', 'SEANCE', 'TARIF', 'SALLE'] })
  entite!: 'FILM' | 'SEANCE' | 'TARIF' | 'SALLE';
  @ApiProperty() entiteId!: number;
  @ApiProperty({ nullable: true }) details!: unknown;
  @ApiProperty() creeLe!: Date;
  @ApiProperty() auteur!: string;
}
