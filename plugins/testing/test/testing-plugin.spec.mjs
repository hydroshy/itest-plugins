import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TestingPlugin, PacketProcessor } from '../dist/index.js';

describe('Testing Plugin Tests', () => {
  const plugin = new TestingPlugin();
  const service = plugin.getService();

  describe('1. Traceability Lookup', () => {
    it('should fetch available SO list', async () => {
      const sos = await service.getAvailableSOs();
      assert.strictEqual(Array.isArray(sos), true);
      assert.strictEqual(sos.length > 0, true);
      assert.ok(sos[0].so_number);
    });

    it('should fetch WAs corresponding to an SO', async () => {
      const was = await service.getAvailableWAs('SO-2026-10-001');
      assert.strictEqual(was.length, 2);
      assert.strictEqual(was[0].so_number, 'SO-2026-10-001');
    });

    it('should fetch item codes matching WA or general', async () => {
      const items = await service.getAvailableItemCodes('SO-2026-10-001', 'WA-001-A');
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].item_code, '5F0820');
    });
  });

  describe('2. Device Registration with SO, WA, Item Code', () => {
    it('should register a LoRaWAN device successfully and link to traceability', async () => {
      const device = await service.registerDevice({
        serial_number: 'SN-DEV-2026-001',
        device_name: 'Test LoRa Gateway 01',
        device_type: 'lorawan_gateway',
        network_id: 'A84041000182E3F1',
        so: 'SO-2026-10-001',
        wa: 'WA-001-A',
        item_code: '5F0820',
        network_config: { region: 'AS923_2', model: 'SX1302' },
      });

      assert.ok(device.id);
      assert.strictEqual(device.serial_number, 'SN-DEV-2026-001');
      assert.strictEqual(device.so, 'SO-2026-10-001');
      assert.strictEqual(device.wa, 'WA-001-A');
      assert.strictEqual(device.item_code, '5F0820');
      assert.strictEqual(device.status, 'REGISTERED');

      const found = await service.getDeviceById(device.id);
      assert.ok(found);
      assert.strictEqual(found?.serial_number, 'SN-DEV-2026-001');
    });

    it('should prevent duplicate serial number or network_id', async () => {
      await service.registerDevice({
        serial_number: 'SN-DEV-DUP',
        device_type: 'lorawan_node',
        network_id: 'A840410001820001',
        so: 'SO-2026-10-001',
        wa: 'WA-001-A',
        item_code: '5F0820',
      });

      await assert.rejects(
        async () => {
          await service.registerDevice({
            serial_number: 'SN-DEV-DUP',
            device_type: 'lorawan_node',
            network_id: 'A840410001820002',
            so: 'SO-2026-10-001',
            wa: 'WA-001-A',
            item_code: '5F0820',
          });
        },
        {
          name: 'Error',
          message: /already registered/,
        }
      );
    });
  });

  describe('3. Packet Processor & Decoded Payload JSONB', () => {
    it('should convert Base64 and HEX payloads accurately', () => {
      const hex = '01020304';
      assert.strictEqual(PacketProcessor.toHex(hex), '01020304');

      const b64 = Buffer.from(hex, 'hex').toString('base64');
      assert.strictEqual(PacketProcessor.toHex(b64), '01020304');
    });

    it('should parse and decode payload dynamically', () => {
      const buf = Buffer.alloc(8);
      buf.writeUInt8(200, 0);
      buf.writeInt16BE(250, 1);
      buf.writeUInt32BE(123456, 4);

      const decoded = PacketProcessor.decodePayload(buf.toString('hex'), 10);
      assert.strictEqual(decoded.battery_percent, 78);
      assert.strictEqual(decoded.metric_value, 25.0);
      assert.strictEqual(decoded.counter, 123456);
      assert.strictEqual(decoded.hex, buf.toString('hex').toUpperCase());
    });

    it('should ingest incoming packet, update device status, and store decoded JSONB', async () => {
      const device = await service.registerDevice({
        serial_number: 'SN-TEST-NODE-88',
        device_type: 'lorawan_node',
        network_id: 'A840410001828888',
        so: 'SO-2026-10-002',
        wa: 'WA-002-A',
        item_code: '4F0120',
      });

      const buf = Buffer.alloc(8);
      buf.writeUInt8(255, 0);
      buf.writeInt16BE(312, 1);
      buf.writeUInt32BE(9999, 4);

      const packet = await service.recordPacket({
        network_id: 'A840410001828888',
        raw_payload: buf.toString('hex'),
        f_port: 2,
        f_cnt: 105,
        rf_info: { rssi: -65, snr: 9.5, frequency: 921400000 },
      });

      assert.strictEqual(packet.device_id, device.id);
      assert.strictEqual(packet.decoded_payload.battery_percent, 100);
      assert.strictEqual(packet.decoded_payload.metric_value, 31.2);
      assert.strictEqual(packet.rf_info?.rssi, -65);

      const updatedDev = await service.getDeviceById(device.id);
      assert.ok(updatedDev?.last_seen_at);
      assert.strictEqual(updatedDev?.status, 'IN_TEST');

      const packetList = await service.getPackets({ network_id: 'A840410001828888' });
      assert.strictEqual(packetList.total, 1);
      assert.strictEqual(packetList.items[0].raw_payload, buf.toString('hex').toUpperCase());
    });
  });
});
