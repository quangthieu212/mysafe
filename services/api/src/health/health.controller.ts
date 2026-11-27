import { Controller, Get, Inject, Res } from '@nestjs/common';
import { Pool } from 'pg';

import { PG_POOL } from '../database/database.tokens.js';

interface ResponseWriter {
  status(code: number): ResponseWriter;
  type(contentType: string): ResponseWriter;
}

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get('live')
  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async getReadiness(
    @Res({ passthrough: true }) response: ResponseWriter,
  ): Promise<
    | { status: 'ok'; dependencies: { postgres: 'ok' } }
    | { type: string; title: string; status: 503; code: string; detail: string }
  > {
    try {
      await this.pool.query('SELECT 1');
      return { status: 'ok', dependencies: { postgres: 'ok' } };
    } catch {
      response.status(503).type('application/problem+json');
      return {
        type: 'about:blank',
        title: 'Service Unavailable',
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        detail: 'A required service is unavailable.',
      };
    }
  }
}
