import { ApiProperty } from '@nestjs/swagger';
import { Version } from '@prisma/client';
import { SalleResumeDto, TarifDto } from '../../seances/dto/seances.dto';

export type Disponibilite = 'DISPONIBLE' | 'DERNIERES_PLACES' | 'COMPLET';

export class SeanceFicheDto {
  @ApiProperty() id!: number;
  @ApiProperty() debut!: Date;
  @ApiProperty() fin!: Date;
  @ApiProperty({ enum: Version }) version!: Version;
  @ApiProperty() festival!: boolean;
  @ApiProperty({ nullable: true, description: 'Ouverture de la vente en ligne (US-7.2)' })
  ouvertureVente!: Date | null;
  @ApiProperty({ type: SalleResumeDto }) salle!: SalleResumeDto;
  @ApiProperty({ description: 'Places de la configuration de salle appliquée à la séance' })
  capacite!: number;
  @ApiProperty({ description: 'Places ni vendues ni bloquées par une réservation en cours' })
  placesLibres!: number;
  @ApiProperty({ enum: ['DISPONIBLE', 'DERNIERES_PLACES', 'COMPLET'] })
  disponibilite!: Disponibilite;
}

export class FicheFilmDto {
  @ApiProperty() id!: number;
  @ApiProperty() titre!: string;
  @ApiProperty({ nullable: true }) synopsis!: string | null;
  @ApiProperty() dureeMinutes!: number;
  @ApiProperty({ nullable: true }) genre!: string | null;
  @ApiProperty({ nullable: true }) classification!: string | null;
  @ApiProperty({ nullable: true, description: 'Lien https vers la bande-annonce' })
  bandeAnnonceUrl!: string | null;
  @ApiProperty({ type: [TarifDto] }) tarifs!: TarifDto[];
  @ApiProperty({ type: [SeanceFicheDto], description: 'Séances publiées à venir, par horaire' })
  seances!: SeanceFicheDto[];
}
