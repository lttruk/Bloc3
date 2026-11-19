import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, ValidateNested } from 'class-validator';
import { PlaceDemandeeDto } from '../../reservations/dto/creer-reservation.dto';

export const MODES_PAIEMENT = ['ESPECES', 'CARTE'] as const;
export type ModePaiement = (typeof MODES_PAIEMENT)[number];

export class VenteGuichetDto {
  @ApiProperty({ type: [PlaceDemandeeDto], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PlaceDemandeeDto)
  places!: PlaceDemandeeDto[];

  @ApiProperty({ enum: MODES_PAIEMENT, description: 'Encaissement au comptoir' })
  @IsIn(MODES_PAIEMENT)
  modePaiement!: ModePaiement;
}

export class SeanceGuichetDto {
  @ApiProperty() id!: number;
  @ApiProperty() debut!: Date;
  @ApiProperty() film!: string;
  @ApiProperty() salle!: string;
  @ApiProperty({ example: 'VF' }) version!: string;
  @ApiProperty({ description: 'Places encore libres (hors places en cours de réservation)' })
  placesLibres!: number;
  @ApiProperty() capacite!: number;
}

export class BilletGuichetDto {
  @ApiProperty() id!: number;
  @ApiProperty() film!: string;
  @ApiProperty() debut!: Date;
  @ApiProperty() salle!: string;
  @ApiProperty() version!: string;
  @ApiProperty({ example: 'D9' }) place!: string;
  @ApiProperty() pmr!: boolean;
  @ApiProperty() tarif!: string;
  @ApiProperty() justificatifRequis!: boolean;
  @ApiProperty() prix!: number;
  @ApiProperty({ example: 'Vente au guichet' }) titulaire!: string;
  @ApiProperty({ example: 'ACTIF' }) statut!: string;
  @ApiProperty({ nullable: true }) scanneLe!: Date | null;
  @ApiProperty() codeQr!: string;
  @ApiProperty() qrSvg!: string;
}

export class VenteEffectueeDto {
  @ApiProperty({ example: 'A1B2C3D4E5F6' }) reference!: string;
  @ApiProperty({ example: 23 }) total!: number;
  @ApiProperty({ enum: MODES_PAIEMENT }) modePaiement!: ModePaiement;
  @ApiProperty({ type: [BilletGuichetDto] }) billets!: BilletGuichetDto[];
}

export class BilanCanalDto {
  @ApiProperty({ enum: ['WEB', 'GUICHET'] }) canal!: 'WEB' | 'GUICHET';
  @ApiProperty() billets!: number;
  @ApiProperty() montant!: number;
}

export class BilanJourDto {
  @ApiProperty({ example: '2026-11-20' }) jour!: string;
  @ApiProperty({ type: [BilanCanalDto] }) canaux!: BilanCanalDto[];
}
