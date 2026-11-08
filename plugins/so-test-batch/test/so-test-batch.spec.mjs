import test from 'node:test';
import assert from 'node:assert/strict';
import { SoTestBatchService } from '../dist/so-test-batch.service.js';
import { SoTestBatchController } from '../dist/so-test-batch.controller.js';

class MockDatabase {
  constructor() {
    this.sos = [
      {
        id: 'so-1',
        so_number: 'SO/2026/001',
        customer_name: 'Khach Hang A',
        customer_email: 'a@example.com',
        partner_email: 'partner@example.com',
        notes: 'Test order 1',
        created_at: new Date('2026-11-01T10:00:00Z'),
        updated_at: new Date('2026-11-01T10:00:00Z'),
        test_batches: [],
        test_batch_count: 0,
      },
      {
        id: 'so-2',
        so_number: 'SO/2026/002',
        customer_name: 'Khach Hang B',
        customer_email: 'b@example.com',
        partner_email: null,
        notes: null,
        created_at: new Date('2026-11-02T10:00:00Z'),
        updated_at: new Date('2026-11-02T10:00:00Z'),
        test_batches: [
          {
            linkId: 'link-1',
            batchId: 'batch-1',
            batchCode: 'TB-001',
            batchName: 'Batch 1',
            itemCode: 'ATH-001',
            longFw: 'FW-1.0.0',
            fwVersion: 'v1.0.0',
            status: 'COMPLETED',
            verdict: 'PASSED',
            deviceCount: 5,
            linkedAt: new Date('2026-11-02T11:00:00Z').toISOString(),
            linkedBy: 'tester',
          },
        ],
        test_batch_count: 1,
      },
    ];

    this.batches = [
      {
        id: 'batch-1',
        batch_code: 'TB-001',
        batch_name: 'Batch 1',
        item_code: 'ATH-001',
        long_fw: 'FW-1.0.0',
        fw_version: 'v1.0.0',
        status: 'COMPLETED',
        verdict: 'PASSED',
        device_count: 5,
        max_devices: 10,
        created_at: new Date('2026-11-01T08:00:00Z'),
      },
      {
        id: 'batch-2',
        batch_code: 'TB-002',
        batch_name: 'Batch 2',
        item_code: 'ATH-002',
        long_fw: 'FW-1.1.0',
        fw_version: 'v1.1.0',
        status: 'READY',
        verdict: 'PENDING',
        device_count: 0,
        max_devices: 20,
        created_at: new Date('2026-11-03T08:00:00Z'),
      },
    ];

    this.links = [
      {
        id: 'link-1',
        so_id: 'so-2',
        so_number: 'SO/2026/002',
        batch_id: 'batch-1',
        batch_code: 'TB-001',
        notes: 'Initial link',
        created_by: 'tester',
      },
    ];
  }

  async query(sql, params = []) {
    // 1. Query v_so_with_test_batches
    if (sql.includes('v_so_with_test_batches')) {
      let filtered = [...this.sos];
      if (sql.includes('test_batch_count > 0')) {
        filtered = filtered.filter((s) => s.test_batch_count > 0);
      } else if (sql.includes('test_batch_count = 0')) {
        filtered = filtered.filter((s) => s.test_batch_count === 0);
      }
      return filtered.map((s) => ({
        id: s.id,
        soNumber: s.so_number,
        customerName: s.customer_name,
        customerEmail: s.customer_email,
        partnerEmail: s.partner_email,
        notes: s.notes,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        testBatches: s.test_batches,
        testBatchCount: s.test_batch_count,
      }));
    }

    // 2. Query v_available_test_batches
    if (sql.includes('v_available_test_batches')) {
      return this.batches.map((b) => ({
        id: b.id,
        batchCode: b.batch_code,
        batchName: b.batch_name,
        itemCode: b.item_code,
        longFw: b.long_fw,
        fwVersion: b.fw_version,
        status: b.status,
        verdict: b.verdict,
        deviceCount: b.device_count,
        maxDevices: b.max_devices,
        createdAt: b.created_at,
      }));
    }

    // 3. Select so by number
    if (sql.includes('SELECT id, so_number FROM traceability_manager.traceability_so WHERE so_number = $1')) {
      const found = this.sos.find((s) => s.so_number === params[0]);
      return found ? [{ id: found.id, so_number: found.so_number }] : [];
    }

    // 4. Select batch by code
    if (sql.includes('SELECT id, batch_code FROM system_schema.device_test_batches WHERE batch_code = $1')) {
      const found = this.batches.find((b) => b.batch_code === params[0]);
      return found ? [{ id: found.id, batch_code: found.batch_code }] : [];
    }

    // 5. Insert into so_test_batches
    if (sql.includes('INSERT INTO system_schema.so_test_batches')) {
      const [soId, soNumber, batchId, batchCode, notes, createdBy] = params;
      const newId = `link-${this.links.length + 1}`;
      this.links.push({
        id: newId,
        so_id: soId,
        so_number: soNumber,
        batch_id: batchId,
        batch_code: batchCode,
        notes,
        created_by: createdBy,
      });
      return [{ id: newId }];
    }

    // 6. Delete from so_test_batches
    if (sql.includes('DELETE FROM system_schema.so_test_batches')) {
      if (sql.includes('WHERE id = $1')) {
        const idx = this.links.findIndex((l) => l.id === params[0]);
        if (idx !== -1) {
          const removed = this.links.splice(idx, 1);
          return removed;
        }
      } else if (sql.includes('WHERE batch_id = $1')) {
        const batchId = params[0];
        const soId = params[1];
        const idx = this.links.findIndex((l) => l.batch_id === batchId && (!soId || l.so_id === soId));
        if (idx !== -1) {
          const removed = this.links.splice(idx, 1);
          return removed;
        }
      }
      return [];
    }

    return [];
  }
}

test('SoTestBatchService & Controller Test Suite', async (t) => {
  const db = new MockDatabase();
  const service = new SoTestBatchService(db);
  const controller = new SoTestBatchController(service);

  await t.test('1. getSos - retrieves all SOs with test batch counts and badges', async () => {
    const res = await controller.getSos();
    assert.equal(res.success, true);
    assert.equal(res.data.length, 2);
    assert.equal(res.data[0].soNumber, 'SO/2026/001');
    assert.equal(res.data[1].soNumber, 'SO/2026/002');
    assert.equal(res.data[1].testBatches.length, 1);
    assert.equal(res.data[1].testBatches[0].batchCode, 'TB-001');
  });

  await t.test('2. getSos - filters by HAS_BATCH and NO_BATCH', async () => {
    const hasBatch = await controller.getSos({ status: 'HAS_BATCH' });
    assert.equal(hasBatch.data.length, 1);
    assert.equal(hasBatch.data[0].soNumber, 'SO/2026/002');

    const noBatch = await controller.getSos({ status: 'NO_BATCH' });
    assert.equal(noBatch.data.length, 1);
    assert.equal(noBatch.data[0].soNumber, 'SO/2026/001');
  });

  await t.test('3. getAvailableBatches - retrieves real system test batches', async () => {
    const res = await controller.getAvailableBatches();
    assert.equal(res.success, true);
    assert.equal(res.data.length, 2);
    assert.equal(res.data[0].batchCode, 'TB-001');
    assert.equal(res.data[1].batchCode, 'TB-002');
  });

  await t.test('4. linkBatch - creates association between SO and Test Batch', async () => {
    const res = await controller.linkBatch({
      soNumber: 'SO/2026/001',
      batchCode: 'TB-002',
      notes: 'Gán mẻ đo kiểm mới',
    });
    assert.equal(res.success, true);
    assert.ok(res.message.includes('TB-002'));
    assert.equal(db.links.length, 2);
  });

  await t.test('5. unlinkBatch - removes association safely', async () => {
    const res = await controller.unlinkBatch({
      linkId: 'link-1',
    });
    assert.equal(res.success, true);
    assert.equal(res.deletedCount, 1);
  });
});
