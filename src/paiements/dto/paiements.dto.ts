import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatutReservation } from '@prisma/client';
import { IsString, Matches, MaxLength } from 'class-validator';

export class VerificationPaiementDto {
  @ApiProperty({
    example: 'cs_test_a1B2c3',
    description: 'Identifiant de la session Stripe Checkout',
  })
  @IsString()
  @MaxLength(255)
  @Matches(/^cs_\w+$/)
  sessionId!: string;
}

export class PagePaiementDto {
  @ApiProperty({ description: 'Adresse de la page de paiement Stripe' }) url!: string;
}

export class ResultatPaiementDto {
  @ApiProperty({ example: 'A1B2C3D4E5F6' }) reference!: string;
  @ApiProperty({ enum: StatutReservation }) statut!: StatutReservation;
  @ApiProperty() paye!: boolean;
  @ApiPropertyOptional({ description: 'Paiement reçu après libération des places' })
  aRembourser?: boolean;
}
