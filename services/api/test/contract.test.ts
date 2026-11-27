import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import SwaggerParser from '@apidevtools/swagger-parser';

const contractPath = fileURLToPath(new URL('../../../contracts/openapi.yaml', import.meta.url));

test('v2 OpenAPI contract is valid and exposes its health probes', async () => {
  const api = await SwaggerParser.validate(contractPath);

  assert.equal(api.openapi, '3.0.3');
  assert.equal(api.servers?.[0]?.url, '/api/v2');
  assert.ok(api.paths?.['/health/live']?.get);
  assert.ok(api.paths?.['/health/ready']?.get);

  const operationIds = new Set<string>();
  for (const path of Object.values(api.paths ?? {})) {
    for (const operation of Object.values(path ?? {})) {
      if (!operation || typeof operation !== 'object' || !('operationId' in operation)) continue;
      const operationId = operation.operationId;
      if (typeof operationId !== 'string') continue;
      assert.equal(operationIds.has(operationId), false, `duplicate operationId: ${operationId}`);
      operationIds.add(operationId);
    }
  }
});
