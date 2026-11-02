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

  describe('7. Device Testing List & Management (11 Fields, User/Admin isolation, Delete)', () => {
    it('should add device testing items containing all 11 required fields', () => {
      const dev1 = service.addDeviceTestingItem({
        id: 'test-dev-01',
        serial_number: 'SN-ATH-2026-001',
        item_code: '5F0820',
        fw_version: '1.2.0',
        hw_version: '2.0.1',
        fw_code: 'ATH',
        me_version: '1.0',
        dev_eui: '0004A30B001F0001',
        app_eui: '0102030405060708',
        app_key: 'AABBCCDDEEFF00112233445566778801',
        class_mode: 'CLASS_A',
        region_code: 'AS923-1',
        created_by: 'tester1',
        application_id: 'app-default-uuid',
        status: 'SUCCESS_ATTACH_BATTERY',
      });

      assert.strictEqual(dev1.serial_number, 'SN-ATH-2026-001');
      assert.strictEqual(dev1.item_code, '5F0820');
      assert.strictEqual(dev1.created_by, 'tester1');
      assert.strictEqual(dev1.application_id, 'app-default-uuid');

      // Add dev2 created by tester2
      service.addDeviceTestingItem({
        id: 'test-dev-02',
        serial_number: 'SN-ATH-2026-002',
        item_code: '5F0821',
        fw_version: '1.2.0',
        hw_version: '2.0.1',
        fw_code: 'ATH',
        dev_eui: '0004A30B001F0002',
        app_eui: '0102030405060708',
        app_key: 'AABBCCDDEEFF00112233445566778802',
        class_mode: 'CLASS_C',
        region_code: 'AU915',
        created_by: 'tester2',
        application_id: 'app-default-uuid',
        status: 'SUCCESS_ATTACH_BATTERY',
      });

      // Add dev3 created in another application
      service.addDeviceTestingItem({
        id: 'test-dev-03',
        serial_number: 'SN-ATH-2026-003',
        item_code: '5F0822',
        fw_version: '1.2.0',
        hw_version: '2.0.1',
        fw_code: 'ATH',
        dev_eui: '0004A30B001F0003',
        app_eui: '0102030405060708',
        app_key: 'AABBCCDDEEFF00112233445566778803',
        class_mode: 'CLASS_A',
        region_code: 'AS923-1',
        created_by: 'tester1',
        application_id: 'app-other-uuid',
        status: 'SUCCESS_ATTACH_BATTERY',
      });
    });

    it('should filter devices for regular user (user sees only devices they created in default application)', () => {
      const result = service.getDeviceTestingList({
        username: 'tester1',
        isAdmin: false,
        applicationId: 'app-default-uuid',
      });

      assert.strictEqual(result.total, 1);
      assert.strictEqual(result.items[0].serial_number, 'SN-ATH-2026-001');
      assert.strictEqual(result.items[0].created_by, 'tester1');
    });

    it('should allow Admin to see all devices in default application regardless of creator', () => {
      const result = service.getDeviceTestingList({
        username: 'admin',
        isAdmin: true,
        applicationId: 'app-default-uuid',
      });

      assert.strictEqual(result.total, 2);
      const serials = result.items.map((i) => i.serial_number);
      assert.ok(serials.includes('SN-ATH-2026-001'));
      assert.ok(serials.includes('SN-ATH-2026-002'));
    });

    it('should support search by serial, dev_eui, item_code', () => {
      const result = service.getDeviceTestingList({
        isAdmin: true,
        search: 'SN-ATH-2026-002',
      });
      assert.strictEqual(result.total, 1);
      assert.strictEqual(result.items[0].serial_number, 'SN-ATH-2026-002');
    });

    it('should prevent regular user from deleting device created by another user', () => {
      assert.throws(
        () => {
          service.deleteDeviceTestingItem({
            id: 'test-dev-02', // created by tester2
            user: {
              username: 'tester1',
              isAdmin: false,
            },
          });
        },
        /Bạn không có quyền xóa thiết bị do người dùng khác tạo/
      );
    });

    it('should allow regular user to delete their own device', () => {
      const del = service.deleteDeviceTestingItem({
        id: 'test-dev-01',
        user: {
          username: 'tester1',
          isAdmin: false,
        },
      });
      assert.strictEqual(del.success, true);

      // Verify it no longer appears
      const after = service.getDeviceTestingList({
        username: 'tester1',
        isAdmin: false,
        applicationId: 'app-default-uuid',
      });
      assert.strictEqual(after.total, 0);
    });

    it('should allow Admin to delete any device', () => {
      const del = service.deleteDeviceTestingItem({
        id: 'test-dev-02',
        user: {
          username: 'admin',
          isAdmin: true,
        },
      });
      assert.strictEqual(del.success, true);
    });

    it('should handle controller endpoints for list and delete', async () => {
      // Re-add an item for controller testing
      service.addDeviceTestingItem({
        id: 'test-ctrl-01',
        serial_number: 'SN-CTRL-001',
        item_code: '5F0820',
        dev_eui: '0004A30B001F0099',
        created_by: 'tester1',
        application_id: 'app-default-uuid',
      });

      const listRes = await controller.getDeviceTestingList({
        username: 'tester1',
        isAdmin: false,
        applicationId: 'app-default-uuid',
      });
      assert.strictEqual(listRes.success, true);
      assert.strictEqual(listRes.data.length, 1);
      assert.strictEqual(listRes.data[0].serial_number, 'SN-CTRL-001');

      const delRes = await controller.deleteDeviceTesting({
        id: 'test-ctrl-01',
        user: { username: 'tester1', isAdmin: false },
      });
      assert.strictEqual(delRes.success, true);
    });
  });

  describe('8. Test Batch & Create Test Batch Workflow', () => {
    let createdBatchId = '';

    it('should create a Test Batch with ITEM-CODE, LONG_FW, Simulation Flow and AutoCheck criteria', () => {
      const batch = service.createTestBatch({
        name: 'Batch Testing 5F0820 Flow A',
        item_code: '5F0820',
        fw_version: 'v1.0.0-PROD',
        simulation_flow_id: 'flow-sim-01',
        simulation_flow_name: 'Flow AS923 Uplink 60s',
        simulation_duration_seconds: 60,
        autocheck_criteria_id: 'rule-autocheck-01',
        max_devices: 5,
        description: 'Batch kiểm thử 5 thiết bị đồng thời',
      });

      assert.ok(batch.id);
      assert.strictEqual(batch.item_code, '5F0820');
      assert.strictEqual(batch.fw_version, 'v1.0.0-PROD');
      assert.strictEqual(batch.max_devices, 5);
      assert.strictEqual(batch.status, 'READY');
      createdBatchId = batch.id;
    });

    it('should reject creating Test Batch when required fields are missing', () => {
      assert.throws(
        () =>
          service.createTestBatch({
            name: 'Invalid',
            item_code: '',
            fw_version: 'v1.0',
            simulation_flow_id: 'f1',
            max_devices: 5,
          }),
        /ITEM-CODE là bắt buộc/
      );
      assert.throws(
        () =>
          service.createTestBatch({
            name: 'Invalid',
            item_code: '5F0820',
            fw_version: '',
            simulation_flow_id: 'f1',
            max_devices: 5,
          }),
        /LONG_FW \(FW_VERSION\) là bắt buộc/
      );
      assert.throws(
        () =>
          service.createTestBatch({
            name: 'Invalid',
            item_code: '5F0820',
            fw_version: 'v1.0',
            simulation_flow_id: '',
            max_devices: 5,
          }),
        /Simulation Flow là bắt buộc/
      );
    });

    it('should retrieve seeded reference devices for pairing', () => {
      const refs = service.getReferenceDevices({ item_code: '5F0820' });
      assert.strictEqual(refs.length >= 5, true);
      assert.strictEqual(refs[0].status, 'CALIBRATED');
      assert.ok(refs[0].baseline_metrics);
    });

    it('should filter available devices by matching item_code and fw_version', () => {
      service.addDeviceTestingItem({
        id: 'dev-batch-01',
        serial_number: 'SN-BATCH-01',
        item_code: '5F0820',
        fw_version: 'v1.0.0-PROD',
        dev_eui: '70B3D57ED0001001',
      });
      service.addDeviceTestingItem({
        id: 'dev-batch-02',
        serial_number: 'SN-BATCH-02',
        item_code: '5F0820',
        fw_version: 'v1.0.0-PROD',
        dev_eui: '70B3D57ED0001002',
      });
      service.addDeviceTestingItem({
        id: 'dev-other-01',
        serial_number: 'SN-OTHER-01',
        item_code: 'DIFFERENT_ITEM',
        fw_version: 'v1.0.0-PROD',
        dev_eui: '70B3D57ED0001099',
      });

      const matched = service.getAvailableDevicesForBatch({
        item_code: '5F0820',
        fw_version: 'v1.0.0-PROD',
      });
      assert.strictEqual(
        matched.some((d) => d.id === 'dev-batch-01'),
        true
      );
      assert.strictEqual(
        matched.some((d) => d.id === 'dev-batch-02'),
        true
      );
      assert.strictEqual(
        matched.some((d) => d.id === 'dev-other-01'),
        false
      );
    });

    it('should start test batch execution with 1-to-1 reference device pairing', () => {
      const refs = service.getReferenceDevices({ item_code: '5F0820' });
      const exec = service.startTestBatchExecution({
        batch_id: createdBatchId,
        device_mappings: [
          {
            test_device_id: 'dev-batch-01',
            test_device_serial: 'SN-BATCH-01',
            reference_device_id: refs[0].id,
            reference_device_serial: refs[0].serial_number,
          },
          {
            test_device_id: 'dev-batch-02',
            test_device_serial: 'SN-BATCH-02',
            reference_device_id: refs[1].id,
            reference_device_serial: refs[1].serial_number,
          },
        ],
      });

      assert.strictEqual(exec.status, 'RUNNING');
      assert.strictEqual(exec.total_devices, 2);
      assert.strictEqual(exec.remaining_seconds, 60);
      assert.strictEqual(exec.devices[0].reference_device_id, refs[0].id);
      assert.strictEqual(exec.devices[1].reference_device_id, refs[1].id);
    });

    it('should reject execution when assigning the same reference device to multiple test devices', () => {
      const refs = service.getReferenceDevices({ item_code: '5F0820' });
      assert.throws(
        () =>
          service.startTestBatchExecution({
            batch_id: createdBatchId,
            device_mappings: [
              { test_device_id: 'dev-batch-01', reference_device_id: refs[0].id },
              { test_device_id: 'dev-batch-02', reference_device_id: refs[0].id },
            ],
          }),
        /bị gán trùng lặp cho nhiều thiết bị test/
      );
    });

    it('should reject execution when exceeding batch max_devices limit', () => {
      assert.throws(
        () =>
          service.startTestBatchExecution({
            batch_id: createdBatchId,
            device_mappings: [
              { test_device_id: 'd1', reference_device_id: 'r1' },
              { test_device_id: 'd2', reference_device_id: 'r2' },
              { test_device_id: 'd3', reference_device_id: 'r3' },
              { test_device_id: 'd4', reference_device_id: 'r4' },
              { test_device_id: 'd5', reference_device_id: 'r5' },
              { test_device_id: 'd6', reference_device_id: 'r6' },
            ],
          }),
        /vượt quá giới hạn cho phép của batch/
      );
    });

    it('should update countdown progress and complete execution with auto check against reference device', () => {
      const batches = service.getTestBatches();
      const batch = batches[0];
      const refs = service.getReferenceDevices();
      const exec = service.startTestBatchExecution({
        batch_id: batch.id,
        duration_seconds: 30,
        device_mappings: [
          { test_device_id: 'dev-batch-01', reference_device_id: refs[0].id },
        ],
      });

      // Advance timer halfway
      const runningExec = service.updateTestBatchExecutionProgress(
        exec.execution_id,
        15,
        'RUNNING'
      );
      assert.strictEqual(runningExec.status, 'RUNNING');
      assert.strictEqual(runningExec.elapsed_seconds, 15);
      assert.strictEqual(runningExec.remaining_seconds, 15);

      // Finish timer
      const completedExec = service.updateTestBatchExecutionProgress(exec.execution_id, 30);
      assert.strictEqual(completedExec.status, 'COMPLETED');
      assert.strictEqual(completedExec.remaining_seconds, 0);
      assert.strictEqual(completedExec.passed_devices, 1);
      assert.strictEqual(completedExec.devices[0].status, 'PASSED');
      assert.strictEqual(completedExec.devices[0].auto_check_passed, true);
    });

    it('should test controller endpoints for test batches and executions', async () => {
      const createRes = await controller.createTestBatch({
        name: 'Controller Batch Test',
        item_code: '5F0820',
        fw_version: 'v1.0.0-PROD',
        simulation_flow_id: 'flow-01',
        max_devices: 4,
      });
      assert.strictEqual(createRes.success, true);
      assert.ok(createRes.data.id);

      const listRes = await controller.listTestBatches({ item_code: '5F0820' });
      assert.strictEqual(listRes.success, true);
      assert.strictEqual(listRes.data.length >= 1, true);

      const getRes = await controller.getTestBatch(createRes.data.id);
      assert.strictEqual(getRes.success, true);
      assert.strictEqual(getRes.data.item_code, '5F0820');

      const availRes = await controller.getAvailableDevicesForBatch({ item_code: '5F0820' });
      assert.strictEqual(availRes.success, true);

      const refRes = await controller.getReferenceDevices({ item_code: '5F0820' });
      assert.strictEqual(refRes.success, true);
      assert.strictEqual(refRes.data.length >= 1, true);
    });
  });
});


