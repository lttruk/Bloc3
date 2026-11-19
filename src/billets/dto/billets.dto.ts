import { ApiProperty } from '@nestjs/swagger';
import { StatutBillet } from '@prisma/client';

export class BilletDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'Hors Ligne' }) film!: string;
  @ApiProperty() debut!: Date;
  @ApiProperty({ example: 'Salle 1' }) salle!: string;
  @ApiProperty({ example: 'VF' }) version!: string;
  @ApiProperty({ example: 'D9' }) place!: string;
  @ApiProperty({ example: false }) pmr!: boolean;
  @ApiProperty({ example: 'Plein' }) tarif!: string;
  @ApiProperty({ description: 'Justificatif à présenter à l’entrée (tarif réduit)' })
  justificatifRequis!: boolean;
  @ApiProperty({ example: 11.5 }) prix!: number;
  @ApiProperty({ example: 'Camille Durand' }) titulaire!: string;
  @ApiProperty({ enum: StatutBillet }) statut!: StatutBillet;
  @ApiProperty({ nullable: true }) scanneLe!: Date | null;
  @ApiProperty({ description: 'Contenu signé du QR code' }) codeQr!: string;
  @ApiProperty({ description: 'QR code au format SVG' }) qrSvg!: string;
}
