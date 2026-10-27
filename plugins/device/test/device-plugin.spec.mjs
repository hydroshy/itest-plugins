import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceService, DeviceController, DeviceStatus } from '../dist/index.js';

describe('Device Management Plugin (@universal-iot/plugin-device)', () => {
  const service = new DeviceService();
  const controller = new DeviceController(service);

  test('Traceability bridge lookups return valid lists', async () => {
    const sosRes = await controller.getSOs();
    assert.equal(sosRes.success, true);
    assert.ok(Array.isArray(sosRes.data));
    assert.ok(sosRes.data.length > 0);

    const waRes = await controller.getWAs('SO-2026-001');
    assert.equal(waRes.success, true);
    assert.ok(Array.isArray(waRes.data));

    const itemCodesRes = await controller.getItemCodes('SO-2026-001');
    assert.equal(itemCodesRes.success, true);
    assert.ok(Array.isArray(itemCodesRes.data));
  });

  test('Register device successfully with SO & WA linkage', async () => {
    const res = await controller.registerDevice({
      serial_number: 'SN-LORA-DEV-001',
      dev_eui: 'AABBCCDDEE000001',
      so_number: 'SO-2026-001',
      wa_number: 'SO-2026-001-WA01',
      item_code: 'LORA-NODE-TH01',
      device_name: 'Cảm biến Nhiệt Ẩm 01',
      device_type: 'LORA_NODE',
    });

    assert.equal(res.success, true);
    assert.ok(res.data);
    assert.equal(res.data.serial_number, 'SN-LORA-DEV-001');
    assert.equal(res.data.dev_eui, 'AABBCCDDEE000001');
    assert.equal(res.data.so_number, 'SO-2026-001');
    assert.equal(res.data.status, DeviceStatus.PENDING);
  });

  test('Reject registering duplicate serial_number', async () => {
    const res = await controller.registerDevice({
      serial_number: 'SN-LORA-DEV-001',
      so_number: 'SO-2026-001',
    });

    assert.equal(res.success, false);
    assert.match(res.error, /already registered/);
  });

  test('Reject registration missing serial_number or so_number', async () => {
    const res1 = await controller.registerDevice({
      serial_number: '',
      so_number: 'SO-2026-001',
    });
    assert.equal(res1.success, false);

    const res2 = await controller.registerDevice({
      serial_number: 'SN-999',
      so_number: '',
    });
    assert.equal(res2.success, false);
  });

  test('Query devices with filters and search', async () => {
    await controller.registerDevice({
      serial_number: 'SN-LORA-DEV-002',
      so_number: 'SO-2026-002',
      item_code: 'SMART-METER-WM02',
    });

    const res = await controller.getDevices({ search: 'DEV-002' });
    assert.equal(res.success, true);
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].serial_number, 'SN-LORA-DEV-002');
  });

  test('Update device status and metadata', async () => {
    const findRes = await controller.getDeviceBySerial('SN-LORA-DEV-001');
    assert.equal(findRes.success, true);
    const devId = findRes.data.id;

    const updateRes = await controller.updateDeviceStatus(devId, {
      status: DeviceStatus.PROVISIONED,
      metadata: { lastPing: '2026-10-27T22:00:00Z' },
    });

    assert.equal(updateRes.success, true);
    assert.equal(updateRes.data.status, DeviceStatus.PROVISIONED);
    assert.equal(updateRes.data.metadata.lastPing, '2026-10-27T22:00:00Z');
  });
});
