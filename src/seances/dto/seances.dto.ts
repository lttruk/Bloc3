import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, Min } from 'class-validator';
import { Version } from '@prisma/client';

export class FiltresSeancesDto {
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
  filmId?: number;

  @ApiPropertyOptional({ enum: Version })
  @IsOptional()
  @IsEnum(Version)
  version?: Version;
}

export class FilmResumeDto {
  @ApiProperty() id!: number;
  @ApiProperty() titre!: string;
  @ApiProperty({ nullable: true }) genre!: string | null;
  @ApiProperty() dureeMinutes!: number;
  @ApiProperty({ nullable: true }) classification!: string | null;
  @ApiProperty({ nullable: true }) synopsis!: string | null;
}

export class SalleResumeDto {
  @ApiProperty() id!: number;
  @ApiProperty() nom!: string;
}

export class SeanceDto {
  @ApiProperty() id!: number;
  @ApiProperty() debut!: Date;
  @ApiProperty() fin!: Date;
  @ApiProperty({ enum: Version }) version!: Version;
  @ApiProperty() festival!: boolean;
  @ApiProperty({ nullable: true, description: 'Ouverture de la vente en ligne (US-7.2)' })
  ouvertureVente!: Date | null;
  @ApiProperty({ type: FilmResumeDto }) film!: FilmResumeDto;
  @ApiProperty({ type: SalleResumeDto }) salle!: SalleResumeDto;
}

export type StatutPlace = 'LIBRE' | 'EN_COURS' | 'OCCUPEE';

export class PlacePlanDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'A' }) rangee!: string;
  @ApiProperty({ example: 1 }) numero!: number;
  @ApiProperty({ enum: ['STANDARD', 'PMR'] }) type!: 'STANDARD' | 'PMR';
  @ApiProperty({
    enum: ['LIBRE', 'EN_COURS', 'OCCUPEE'],
    description: 'EN_COURS : place bloquée par une réservation en attente de paiement',
  })
  statut!: StatutPlace;
}

export class TarifDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'Plein' }) libelle!: string;
  @ApiProperty({ example: 11.5 }) prix!: number;
  @ApiProperty() justificatifRequis!: boolean;
}

export class PlanSalleDto {
  @ApiProperty({ type: SeanceDto }) seance!: SeanceDto;
  @ApiProperty({ type: [PlacePlanDto] }) places!: PlacePlanDto[];
  @ApiProperty({ type: [TarifDto] }) tarifs!: TarifDto[];
}
