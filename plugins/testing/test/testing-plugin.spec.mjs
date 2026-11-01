import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TestingPlugin, PacketProcessor, TestingService, ATHRegisterDecoder } from '../dist/index.js';

describe('Testing Plugin Tests', () => {
  const plugin = new TestingPlugin();
  const service = plugin.getService();
  const controller = plugin.getController();

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

  describe('5. Create Device Testing Session & Flow Coordination', () => {
    it('should create device test session with serial, connectivity and auto check criteria', async () => {
      const res = await controller.createDeviceTestSession({
        serial_number: 'SN-DEV-TEST-001',
        network_id: '0004A30B001F0099',
        connectivity: 'LoRaWAN',
        item_code: '5F0820',
        sku: 'WSLRW-TH01',
        auto_check_criteria: {
          min_rssi: -100,
          expected_f_port: 2,
        },
      });

      assert.strictEqual(res.success, true);
      assert.ok(res.data.id.startsWith('dev-test-'));
      assert.strictEqual(res.data.serial_number, 'SN-DEV-TEST-001');
      assert.strictEqual(res.data.status, 'IDLE');
      assert.strictEqual(res.data.verdict, 'PENDING');
      assert.strictEqual(res.data.connectivity, 'LoRaWAN');
    });

    it('should reject device test creation when serial number is missing', async () => {
      const res = await controller.createDeviceTestSession({
        serial_number: '',
      });
      assert.strictEqual(res.success, false);
      assert.ok(res.message.includes('bắt buộc'));
    });

    it('should list device test sessions and update status', async () => {
      const listRes = await controller.listDeviceTestSessions();
      assert.strictEqual(listRes.success, true);
      assert.ok(listRes.total >= 1);

      const sessionId = listRes.data[0].id;
      const updateRes = await controller.updateDeviceTestSessionStatus(sessionId, 'RUNNING');
      assert.strictEqual(updateRes.success, true);
      assert.strictEqual(updateRes.data.status, 'RUNNING');
      assert.ok(updateRes.data.started_at);
    });
  });

  describe('6. ATH Register Decoder & ChirpStack Provisioning Helpers', () => {
    it('should correctly decode ATH registers from Modbus memory map', () => {
      const mem = new Map();

      // Reg 0: 'ATH' (string)
      mem.set(0, [65, 84]); // 'AT'
      mem.set(1, [72, 0]);  // 'H\0'

      // Reg 27: devEUI (4 regs hex) = 00 04 A3 0B 00 1F 00 99
      mem.set(27, [0x00, 0x04]);
      mem.set(28, [0xa3, 0x0b]);
      mem.set(29, [0x00, 0x1f]);
      mem.set(30, [0x00, 0x99]);

      // Reg 31: appEUI (4 regs hex) = 01 02 03 04 05 06 07 08
      mem.set(31, [0x01, 0x02]);
      mem.set(32, [0x03, 0x04]);
      mem.set(33, [0x05, 0x06]);
      mem.set(34, [0x07, 0x08]);

      // Reg 35: appKey (8 regs hex)
      for (let i = 0; i < 8; i++) {
        mem.set(35 + i, [0xaa, 0xbb]);
      }

      // Reg 69: region code 'AS9' '23'
      mem.set(69, [65, 83]); // 'AS'
      mem.set(70, [57, 50]); // '92'
      mem.set(71, [51, 0]);  // '3\0'

      // Reg 85: class 'A'
      mem.set(85, [65, 0]);

      // Reg 103: sensor type = 10 (0x000A)
      mem.set(103, [0x00, 0x0a]);

      // Reg 259: SERIAL_NUMBER = 'SN-2026'
      mem.set(259, [83, 78]); // 'SN'
      mem.set(260, [45, 50]); // '-2'
      mem.set(261, [48, 50]); // '02'
      mem.set(262, [54, 0]);  // '6\0'

      // Reg 386: ITEM_CODE = 'ATH01'
      mem.set(386, [65, 84]); // 'AT'
      mem.set(387, [72, 48]); // 'H0'
      mem.set(388, [49, 0]);  // '1\0'

      const decoded = ATHRegisterDecoder.decodeFromMemoryMap(mem);
      assert.strictEqual(decoded.fwCode, 'ATH');
      assert.strictEqual(decoded.devEui, '0004A30B001F0099');
      assert.strictEqual(decoded.appEui, '0102030405060708');
      assert.strictEqual(decoded.regionCode, 'AS923');
      assert.strictEqual(decoded.deviceClass, 'A');
      assert.strictEqual(decoded.sensorType, 10);
      assert.strictEqual(decoded.serialNumber, 'SN-2026');
      assert.strictEqual(decoded.itemCode, 'ATH01');
    });

    it('should generate 4 optimized fast-read chunks covering 0..259 and 386', () => {
      const chunks = ATHRegisterDecoder.getFastReadChunks();
      assert.strictEqual(chunks.length, 4);
      assert.strictEqual(chunks[0].start, 0);
      assert.strictEqual(chunks[0].count, 100);
      assert.strictEqual(chunks[1].start, 100);
      assert.strictEqual(chunks[1].count, 100);
      assert.strictEqual(chunks[2].start, 200);
      assert.strictEqual(chunks[2].count, 68);
      assert.strictEqual(chunks[3].start, 386);
      assert.strictEqual(chunks[3].count, 14);
    });

    it('should build ChirpStack 2-step registration payloads (Device & Keys)', () => {
      const devPayload = ATHRegisterDecoder.buildChirpstackDevicePayload({
        applicationId: 'app-uuid-001',
        devEui: '0004A30B001F0099',
        joinEui: '0102030405060708',
        serialNumber: 'SN-ATH-001',
        deviceProfileId: 'dp-lorawan-as923-class-a',
      });

      assert.strictEqual(devPayload.device.devEui, '0004a30b001f0099');
      assert.strictEqual(devPayload.device.joinEui, '0102030405060708');
      assert.strictEqual(devPayload.device.name, 'SN-ATH-001');
      assert.strictEqual(devPayload.device.skipFcntCheck, true);
      assert.strictEqual(devPayload.device.description, 'ITEST 2.0');

      const keysPayload = ATHRegisterDecoder.buildChirpstackKeysPayload({
        devEui: '0004A30B001F0099',
        appKey: 'AABBCCDDEEFF00112233445566778899',
      });

      assert.strictEqual(keysPayload.deviceKeys.devEui, '0004a30b001f0099');
      assert.strictEqual(keysPayload.deviceKeys.appKey, 'aabbccddeeff00112233445566778899');
      assert.strictEqual(keysPayload.deviceKeys.nwkKey, 'aabbccddeeff00112233445566778899');
    });
  });
});


