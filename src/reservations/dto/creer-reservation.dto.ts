import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

export class PlaceDemandeeDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  @Min(1)
  placeId!: number;

  @ApiProperty({ example: 1, description: 'Plein, réduit, moins de 14 ans, groupe' })
  @IsInt()
  @Min(1)
  tarifId!: number;
}

export class CreerReservationDto {
  @ApiProperty({ type: [PlaceDemandeeDto], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10) // RG5 : 10 places au plus par réservation
  @ValidateNested({ each: true })
  @Type(() => PlaceDemandeeDto)
  places!: PlaceDemandeeDto[];
}

export class ReservationVerrouilleeDto {
  @ApiProperty({ example: 'A1B2C3D4E5F6' })
  reference!: string;

  @ApiProperty({ example: 'EN_ATTENTE' })
  statut!: string;

  @ApiProperty({ example: '2027-03-27T10:10:00.000Z' })
  expireLe!: string;

  @ApiProperty({ example: 2 })
  nombrePlaces!: number;
}
