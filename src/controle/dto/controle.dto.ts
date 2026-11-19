import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ScanDto {
  @ApiProperty({ description: 'Contenu lu dans le QR code du billet', example: 'LGC1.42.7.xxxx' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  code!: string;

  @ApiPropertyOptional({ description: 'Séance contrôlée à l’entrée de la salle', example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seanceId?: number;
}

export type MotifRefus = 'FALSIFIE' | 'ANNULE' | 'DEJA_UTILISE' | 'AUTRE_SEANCE';

export class BilletControleDto {
  @ApiProperty() film!: string;
  @ApiProperty() debut!: Date;
  @ApiProperty() salle!: string;
  @ApiProperty() place!: string;
  @ApiProperty() tarif!: string;
  @ApiProperty({ nullable: true, description: 'Justificatif à vérifier (tarif réduit)' })
  justificatif!: string | null;
  @ApiProperty() titulaire!: string;
  @ApiProperty({ nullable: true }) scanneLe!: Date | null;
}

export class ResultatScanDto {
  @ApiProperty({ description: 'true : écran vert, entrée autorisée' }) valide!: boolean;
  @ApiPropertyOptional({ enum: ['FALSIFIE', 'ANNULE', 'DEJA_UTILISE', 'AUTRE_SEANCE'] })
  motif?: MotifRefus;
  @ApiProperty({ example: 'Billet valide' }) message!: string;
  @ApiPropertyOptional({ type: BilletControleDto }) billet?: BilletControleDto;
}

export class SeanceControleDto {
  @ApiProperty() id!: number;
  @ApiProperty() debut!: Date;
  @ApiProperty() film!: string;
  @ApiProperty() salle!: string;
}
