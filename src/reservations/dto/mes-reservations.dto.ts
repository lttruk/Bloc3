import { ApiProperty } from '@nestjs/swagger';

export type StatutAffiche = 'EN_ATTENTE' | 'CONFIRMEE' | 'ANNULEE' | 'EXPIREE';

export class BilletResumeDto {
  @ApiProperty({ example: 'D9' }) place!: string;
  @ApiProperty({ example: 'Plein' }) tarif!: string;
  @ApiProperty({ example: 11.5 }) prix!: number;
}

export class MaReservationDto {
  @ApiProperty({ example: 'A1B2C3D4E5F6' }) reference!: string;
  @ApiProperty({ enum: ['EN_ATTENTE', 'CONFIRMEE', 'ANNULEE', 'EXPIREE'] }) statut!: StatutAffiche;
  @ApiProperty() creeeLe!: Date;
  @ApiProperty({ nullable: true, description: 'Fin du blocage des places (réservation en attente)' })
  expireLe!: Date | null;
  @ApiProperty() seanceId!: number;
  @ApiProperty() film!: string;
  @ApiProperty() debut!: Date;
  @ApiProperty() salle!: string;
  @ApiProperty({ example: 'VF' }) version!: string;
  @ApiProperty({ type: [BilletResumeDto] }) billets!: BilletResumeDto[];
  @ApiProperty({ example: 23 }) total!: number;
}
