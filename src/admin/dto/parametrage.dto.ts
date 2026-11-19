import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const nettoyer = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ---------- Tarifs ----------

export class CreerTarifDto {
  @ApiProperty({ example: 'Étudiant' })
  @Transform(nettoyer)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  libelle!: string;

  @ApiProperty({ example: 8.5, description: 'Prix TTC en euros' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999.99)
  prix!: number;

  @ApiPropertyOptional({ default: false, description: 'Justificatif à présenter à l’entrée' })
  @IsOptional()
  @IsBoolean()
  justificatifRequis?: boolean;
}

export class ModifierTarifDto extends PartialType(CreerTarifDto) {
  @ApiPropertyOptional({
    description: 'Un tarif désactivé n’est plus proposé ; les billets vendus gardent leur prix',
  })
  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class TarifAdminDto {
  @ApiProperty() id!: number;
  @ApiProperty() libelle!: string;
  @ApiProperty() prix!: number;
  @ApiProperty() justificatifRequis!: boolean;
  @ApiProperty() actif!: boolean;
  @ApiProperty({ description: 'Billets vendus à ce tarif (hors billets annulés)' })
  billetsVendus!: number;
}

// ---------- Configuration des salles ----------

export class RangeeConfigDto {
  @ApiProperty({ example: 'A' })
  @Matches(/^[A-Z]{1,2}$/, {
    message: 'Une rangée est désignée par une ou deux lettres majuscules.',
  })
  rangee!: string;

  @ApiProperty({ example: 12, description: 'Nombre de places, numérotées de 1 à N' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  places!: number;

  @ApiPropertyOptional({ example: [1, 2], description: 'Numéros des places PMR' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  pmr?: number[];
}

export class ConfigurationSalleDto {
  @ApiProperty({ type: [RangeeConfigDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => RangeeConfigDto)
  rangees!: RangeeConfigDto[];
}

export class ConfigurationSalleLueDto {
  @ApiProperty() salle!: { id: number; nom: string; capacite: number };
  @ApiProperty({ type: [RangeeConfigDto] }) rangees!: RangeeConfigDto[];
  @ApiProperty({ description: 'Séances à venir, qui gardent leur configuration actuelle' })
  seancesAVenir!: number;
}
