import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestingService } from '../dist/index.js';

const sample = (value, time = 1, id = 'DUT') => ({ network_id: id, raw_payload: '01', decoded_payload: { temperature: value }, received_at: new Date(time) });
const criteria = { dut: { item_code: 'ITEM', fw_version: '1F0001', rules: [{ field: 'temperature', count: 2, min: 20, max: 30 }] } };

test('count only samples satisfying field limits without legacy RF defaults', async () => {
  const service = new TestingService();
  const result = await service.evaluateAutoCheck({ packets: [sample(21), sample(25), sample(40)] }, criteria);
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.total_rules, 1);
  const failed = await service.evaluateAutoCheck({ packets: [sample(21), sample(40)] }, criteria);
  assert.equal(failed.verdict, 'FAIL');
});

test('compare newest samples, not array order; missing reference fails', async () => {
  const service = new TestingService();
  const config = { dut: { ...criteria.dut, rules: [{ field: 'temperature', count: 1 }] }, comparisons: [{ dut_field: 'temperature', reference_field: 'temperature', tolerance: 1 }] };
  const result = await service.evaluateAutoCheck({ packets: [sample(25, 2), sample(90, 1)], reference_packets: [sample(25.5, 2, 'REF')] }, config);
  assert.equal(result.verdict, 'PASS');
  const missing = await service.evaluateAutoCheck({ packets: [sample(25)] }, config);
  assert.equal(missing.verdict, 'FAIL');
});

test('reference rules count independently and reject missing fields', async () => {
  const service = new TestingService();
  const config = { dut: { ...criteria.dut, rules: [{ field: 'temperature', count: 1 }] }, reference: { ...criteria.dut, rules: [{ field: 'temperature', count: 2, equals: 25 }] } };
  const result = await service.evaluateAutoCheck({ packets: [sample(25)], reference_packets: [sample(25, 1, 'REF'), sample(25, 2, 'REF')] }, config);
  assert.equal(result.verdict, 'PASS');
  const missing = await service.evaluateAutoCheck({ packets: [sample(25)], reference_packets: [{ ...sample(25, 1, 'REF'), decoded_payload: {} }] }, config);
  assert.equal(missing.verdict, 'FAIL');
});

test('reject invalid counts, tolerance and mixed devices', async () => {
  const service = new TestingService();
  await assert.rejects(service.evaluateAutoCheck({ packets: [sample(25)] }, { dut: { ...criteria.dut, rules: [{ field: 'temperature', count: 0 }] } }), /invalid/);
  await assert.rejects(service.evaluateAutoCheck({ packets: [sample(25)] }, { comparisons: [{ dut_field: 'temperature', reference_field: 'temperature', tolerance: -1 }] }), /Invalid/);
  await assert.rejects(service.evaluateAutoCheck({ packets: [sample(25), sample(25, 1, 'OTHER')] }, criteria), /one device/);
});
