import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Santé')
@Controller('sante')
export class SanteController {
  @Get()
  @ApiOkResponse({ description: "L'API répond" })
  verifier(): { statut: string; horodatage: string } {
    return { statut: 'ok', horodatage: new Date().toISOString() };
  }
}
