import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TestingService } from '../src/testing.service';
import { PacketProcessor } from '../src/packet-processor';
import { TestingPlugin } from '../src/index';

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

  describe('4. Gateway Testing Registration & Flow', () => {
    it('should validate Gateway IPv4 format correctly', () => {
      assert.strictEqual(TestingService.validateGatewayIp('192.168.1.5'), true);
      assert.strictEqual(TestingService.validateGatewayIp('10.0.0.1'), true);
      assert.strictEqual(TestingService.validateGatewayIp('172.16.254.1'), true);
      assert.strictEqual(TestingService.validateGatewayIp('256.0.0.1'), false);
      assert.strictEqual(TestingService.validateGatewayIp('192.168.1'), false);
      assert.strictEqual(TestingService.validateGatewayIp('invalid-ip'), false);
      assert.strictEqual(TestingService.validateGatewayIp(''), false);
    });

    it('should validate Serial confirmation matching', () => {
      assert.strictEqual(TestingService.validateSerialConfirmation('GW-SN-9988', 'GW-SN-9988'), true);
      assert.strictEqual(TestingService.validateSerialConfirmation('GW-SN-9988', ' GW-SN-9988 '), true);
      assert.strictEqual(TestingService.validateSerialConfirmation('GW-SN-9988', 'GW-SN-0000'), false);
      assert.strictEqual(TestingService.validateSerialConfirmation('', 'GW-SN-9988'), false);
    });

    it('should build changeGatewayConfig for Ethernet test and 4G test', () => {
      // Ethernet test
      const ethConfig = TestingService.buildChangeGatewayConfig(
        {
          so: 'SO-2026-10-001',
          wa: 'WA-001-A',
          gateway_ip: '192.168.1.5',
          network_server_id: 'ns-chirpstack-01',
          internet_test_type: 'Ethernet test',
          region_test: 'EU868',
          confirmed_serial_number: 'SN-GW-1234',
        },
        '192.168.1.100'
      );

      assert.strictEqual(ethConfig.gatewayConfig.ethernet_metric, '100');
      assert.strictEqual(ethConfig.gatewayConfig.lte_metric, '102');
      assert.strictEqual(ethConfig.gatewayConfig.lorawan_frequency_plan, 'eu868');
      assert.strictEqual(ethConfig.gatewayConfig.network_server_host, '192.168.1.100');
      assert.strictEqual(ethConfig.gatewayConfig.ns_uplink_port, '1700');
      assert.strictEqual(ethConfig.gatewayConfig.ns_downlink_port, '1700');

      // 4G test
      const lteConfig = TestingService.buildChangeGatewayConfig(
        {
          so: 'SO-2026-10-001',
          wa: 'WA-001-A',
          gateway_ip: '192.168.1.5',
          network_server_id: 'ns-chirpstack-01',
          internet_test_type: '4G Test',
          region_test: 'AS923',
          confirmed_serial_number: 'SN-GW-1234',
        },
        'chirpstack.internal'
      );

      assert.strictEqual(lteConfig.gatewayConfig.ethernet_metric, '102');
      assert.strictEqual(lteConfig.gatewayConfig.lte_metric, '100');
      assert.strictEqual(lteConfig.gatewayConfig.lorawan_frequency_plan, 'as923');
      assert.strictEqual(lteConfig.gatewayConfig.network_server_host, 'chirpstack.internal');
    });

    it('should create a Gateway Test Session and persist traceability metadata', async () => {
      const session = await service.createGatewayTestSession({
        so: 'SO-2026-10-001',
        wa: 'WA-001-A',
        gateway_ip: '192.168.1.5',
        network_server_id: 'ns-chirpstack-01',
        internet_test_type: 'Ethernet test',
        region_test: 'EU868',
        confirmed_serial_number: 'SN-GW-888999',
        gateway_info: {
          serial_number: 'SN-GW-888999',
          item_code: '5F0820',
          sku: 'PINEX',
          eui: '88a29eFFFEb99f7d',
          hardware_version: '2H',
          firmware_version: '9F0731',
          mechanical_version: '2M',
          lte_module_serial_number: 'LTE-SN-776655',
          lte_module_imei: '862000055123456',
        },
      });

      assert.ok(session.id);
      assert.strictEqual(session.serial_number, 'SN-GW-888999');
      assert.strictEqual(session.eui, '88a29eFFFEb99f7d');
      assert.strictEqual(session.sku, 'PINEX');
      assert.strictEqual(session.hardware_version, '2H');
      assert.strictEqual(session.firmware_version, '9F0731');
      assert.strictEqual(session.mechanical_version, '2M');
      assert.strictEqual(session.lte_module_serial_number, 'LTE-SN-776655');
      assert.strictEqual(session.lte_module_imei, '862000055123456');
      assert.strictEqual(session.status, 'REGISTERED');

      // Verify list sessions
      const sessions = await service.getGatewayTestSessions();
      assert.strictEqual(sessions.length >= 1, true);

      // Verify controller lookup
      const controller = plugin.getController();
      const ctrlRes = await controller.getGatewayTestSession(session.id);
      assert.strictEqual(ctrlRes.success, true);
      assert.strictEqual(ctrlRes.data.serial_number, 'SN-GW-888999');
    });

    it('should reject session creation when serial confirmation does not match', async () => {
      await assert.rejects(
        async () => {
          await service.createGatewayTestSession({
            so: 'SO-2026-10-001',
            wa: 'WA-001-A',
            gateway_ip: '192.168.1.5',
            network_server_id: 'ns-chirpstack-01',
            internet_test_type: 'Ethernet test',
            region_test: 'EU868',
            confirmed_serial_number: 'WRONG-SERIAL',
            gateway_info: {
              serial_number: 'ACTUAL-SERIAL',
              item_code: '5F0820',
              sku: 'PINEX',
              eui: '88a29eFFFEb99f7d',
            },
          });
        },
        {
          name: 'Error',
          message: 'Confirmed serial "WRONG-SERIAL" does not match actual serial "ACTUAL-SERIAL"',
        }
      );
    });

    it('should reject session creation when IP is invalid', async () => {
      await assert.rejects(
        async () => {
          await service.createGatewayTestSession({
            so: 'SO-2026-10-001',
            wa: 'WA-001-A',
            gateway_ip: '999.999.999.999',
            network_server_id: 'ns-chirpstack-01',
            internet_test_type: 'Ethernet test',
            region_test: 'EU868',
            confirmed_serial_number: 'SN-GW-1234',
            gateway_info: {
              serial_number: 'SN-GW-1234',
              item_code: '5F0820',
              sku: 'PINEX',
              eui: '88a29eFFFEb99f7d',
            },
          });
        },
        /Invalid Gateway IP format/
      );
    });
  });
});

