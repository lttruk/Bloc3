import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FiltresSeancesDto, PlanSalleDto, SeanceDto } from './dto/seances.dto';
import { SeancesService } from './seances.service';

@ApiTags('Séances')
@Controller('seances')
export class SeancesController {
  constructor(private readonly seances: SeancesService) {}

  @Get()
  @ApiOperation({ summary: 'Programme : séances à venir, filtrables par période, film et version (US-1.1)' })
  @ApiOkResponse({ type: [SeanceDto] })
  @ApiBadRequestResponse({ description: 'Filtres invalides' })
  lister(@Query() filtres: FiltresSeancesDto): Promise<SeanceDto[]> {
    return this.seances.lister(filtres);
  }

  @Get(':id/places')
  @ApiOperation({ summary: 'Plan de salle : état des places et tarifs (US-3.1)' })
  @ApiOkResponse({ type: PlanSalleDto })
  @ApiNotFoundResponse({ description: 'Séance inexistante ou non publiée' })
  planDeSalle(@Param('id', ParseIntPipe) id: number): Promise<PlanSalleDto> {
    return this.seances.planDeSalle(id);
  }
}
