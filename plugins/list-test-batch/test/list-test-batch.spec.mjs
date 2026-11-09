import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ListTestBatchService } from '../dist/list-test-batch.service.js';
import { ListTestBatchController } from '../dist/list-test-batch.controller.js';

describe('ListTestBatchPlugin Service and Controller', () => {
  const mockRows = [
    {
      id: 'batch-001',
      batch_code: 'BATCH-20261110-001',
      name: 'Batch Test Sensor 01',
      item_code: 'WSLRW-ATH-06',
      fw_version: '6F0627',
      long_fw: '6F0627',
      status: 'READY',
      verdict: 'PASS',
      max_devices: 10,
      device_count: 5,
      simulation_flow_id: 'flow-01',
      simulation_flow_name: 'Standard Temp Humidity Flow',
      duration_seconds: 60,
      created_at: '2026-11-10T00:00:00Z',
    },
    {
      id: 'batch-002',
      batch_code: 'BATCH-20261110-002',
      name: 'Batch Test Soil Sensor',
      item_code: 'WSLRW-SOIL-01',
      fw_version: '6F0520',
      long_fw: '6F0520',
      status: 'RUNNING',
      verdict: null,
      max_devices: 5,
      device_count: 3,
      simulation_flow_id: 'flow-02',
      simulation_flow_name: 'Soil Moisture Flow',
      duration_seconds: 120,
      created_at: '2026-11-10T01:00:00Z',
    },
  ];

  const createMockDb = () => {
    let lastQuery = '';
    let lastParams = [];
    return {
      get lastQuery() {
        return lastQuery;
      },
      get lastParams() {
        return lastParams;
      },
      async query(sql, params = []) {
        lastQuery = sql;
        lastParams = params;
        if (sql.includes('WHERE b.id = $1')) {
          const match = mockRows.find((r) => r.id === params[0]);
          return match ? [match] : [];
        }
        if (sql.includes('DELETE FROM')) {
          return [];
        }
        return mockRows;
      },
    };
  };

  it('should list test batches with filter', async () => {
    const db = createMockDb();
    const service = new ListTestBatchService(db);
    const controller = new ListTestBatchController(service);

    const result = await controller.listBatches({
      item_code: 'WSLRW-ATH-06',
      status: 'READY',
      limit: 10,
    });

    assert.equal(result.success, true);
    assert.equal(result.data.length, 2);
    assert.match(db.lastQuery, /b\.item_code = \$1/);
    assert.match(db.lastQuery, /b\.status = \$2/);
  });

  it('should get batch detail by id', async () => {
    const db = createMockDb();
    const service = new ListTestBatchService(db);
    const controller = new ListTestBatchController(service);

    const result = await controller.getBatch('batch-001');
    assert.equal(result.success, true);
    assert.equal(result.data.batch_code, 'BATCH-20261110-001');
  });

  it('should reject deleting a running batch', async () => {
    const db = createMockDb();
    const service = new ListTestBatchService(db);
    const controller = new ListTestBatchController(service);

    const result = await controller.deleteBatch('batch-002');
    assert.equal(result.success, false);
    assert.match(result.message || result.error, /RUNNING/);
  });

  it('should successfully delete non-running batch', async () => {
    const db = createMockDb();
    const service = new ListTestBatchService(db);
    const controller = new ListTestBatchController(service);

    const result = await controller.deleteBatch('batch-001');
    assert.equal(result.success, true);
  });
});
