import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FicheFilmDto } from './dto/films.dto';
import { FilmsService } from './films.service';

@ApiTags('Films')
@Controller('films')
export class FilmsController {
  constructor(private readonly films: FilmsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Fiche détaillée d’un film et disponibilité de ses séances (US-1.2)' })
  @ApiOkResponse({ type: FicheFilmDto })
  @ApiNotFoundResponse({ description: 'Film inexistant ou non publié' })
  fiche(@Param('id', ParseIntPipe) id: number): Promise<FicheFilmDto> {
    return this.films.fiche(id);
  }
}
