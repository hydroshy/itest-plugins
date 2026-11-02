import {
  ChangeGatewayConfigRequest,
  DeviceFilterQuery,
  DevicePacketDTO,
  DeviceRegistrationDTO,
  GatewayRegistrationSessionDTO,
  GatewayTestSession,
  TestingDevice,
  TestingDeviceStatus,
  TraceabilityLookupItemCode,
  TraceabilityLookupSO,
  TraceabilityLookupWA,
  DeviceSimulationProfile,
  DeviceSimulationResult,
  AutoCheckCriteria,
  AutoCheckRuleResult,
  AutoCheckEvaluation,
  DeviceTestSession,
  DeviceTestSessionStatus,
  CreateDeviceTestDTO,
} from './testing.types';
import { ITraceabilityProvider, DefaultTraceabilityBridge } from './testing-traceability.bridge';
import { PacketProcessor } from './packet-processor';

export class TestingService {
  private devices: Map<string, TestingDevice> = new Map();
  private packets: DevicePacketDTO[] = [];
  private gatewaySessions: Map<string, GatewayTestSession> = new Map();
  private simulationProfiles: Map<string, DeviceSimulationProfile> = new Map();
  private simulationResults: Map<string, DeviceSimulationResult> = new Map();
  private autoCheckEvaluations: Map<string, AutoCheckEvaluation> = new Map();
  private deviceTestSessions: Map<string, DeviceTestSession> = new Map();
  private traceabilityProvider: ITraceabilityProvider;

  constructor(traceabilityProvider?: ITraceabilityProvider) {
    this.traceabilityProvider = traceabilityProvider || new DefaultTraceabilityBridge();
  }

  // --- GATEWAY CONFIG & VALIDATION HELPERS ---

  static validateGatewayIp(ip: string): boolean {
    if (!ip || typeof ip !== 'string') return false;
    const trimmed = ip.trim();
    const ipv4Regex =
      /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(trimmed);
  }

  static validateSerialConfirmation(actualSerial: string, confirmedSerial: string): boolean {
    if (!actualSerial || !confirmedSerial) return false;
    return actualSerial.trim() === confirmedSerial.trim();
  }

  static buildChangeGatewayConfig(
    dto: GatewayRegistrationSessionDTO,
    networkServerHost?: string
  ): ChangeGatewayConfigRequest {
    const is4G =
      dto.internet_test_type === 'lte_4g' ||
      dto.internet_test_type === '4G Test';

    const normalizedRegion = (dto.region_test || 'EU868').toLowerCase();

    return {
      gatewayConfig: {
        ethernet_metric: is4G ? '102' : '100',
        lte_metric: is4G ? '100' : '102',
        wifi_metric: '101',
        is_reboot: 'false',
        lorawan_frequency_plan: normalizedRegion,
        network_server_host: networkServerHost || dto.network_server_host || 'localhost',
        ns_uplink_port: '1700',
        ns_downlink_port: '1700',
      },
    };
  }

  // --- TRACEABILITY DROPDOWN LOOKUP ---

  async getAvailableSOs(): Promise<TraceabilityLookupSO[]> {
    return await this.traceabilityProvider.fetchSOs();
  }

  async getAvailableWAs(soNumber: string): Promise<TraceabilityLookupWA[]> {
    if (!soNumber) {
      throw new Error('soNumber is required to lookup Work Orders (WA)');
    }
    return await this.traceabilityProvider.fetchWAsBySO(soNumber);
  }

  async getAvailableItemCodes(soNumber?: string, waNumber?: string): Promise<TraceabilityLookupItemCode[]> {
    return await this.traceabilityProvider.fetchItemCodes(soNumber, waNumber);
  }

  // --- DEVICE REGISTRATION & MANAGEMENT ---

  async registerDevice(dto: DeviceRegistrationDTO): Promise<TestingDevice> {
    const soStr = dto.so_number || dto.so;
    const waStr = dto.wa_number || dto.wa;

    // 1. Validation cơ bản
    if (!dto.serial_number?.trim()) {
      throw new Error('serial_number is required');
    }
    if (!soStr?.trim()) {
      throw new Error('Sales Order (so / so_number) must be selected');
    }
    if (!waStr?.trim()) {
      throw new Error('Work Order (wa / wa_number) must be selected');
    }
    if (!dto.item_code?.trim()) {
      throw new Error('item_code must be selected');
    }
    if (!dto.network_id?.trim()) {
      throw new Error('network_id (e.g. DevEUI/GatewayEUI/IP) is required');
    }

    const normalizedSerial = dto.serial_number.trim();
    const normalizedNetId = dto.network_id.trim().toUpperCase();

    // 2. Kiểm tra trùng lặp
    for (const d of this.devices.values()) {
      if (d.serial_number.toLowerCase() === normalizedSerial.toLowerCase()) {
        throw new Error(`Device with serial_number "${normalizedSerial}" already registered.`);
      }
      if (d.network_id.toUpperCase() === normalizedNetId) {
        throw new Error(`Device with network_id "${normalizedNetId}" already registered.`);
      }
    }

    // 3. Khởi tạo TestingDevice
    const now = new Date();
    const newDevice: TestingDevice = {
      id: `dev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      serial_number: normalizedSerial,
      device_name: dto.device_name?.trim() || `${dto.device_type.toUpperCase()}-${normalizedSerial}`,
      device_type: dto.device_type,
      network_type: dto.network_type || (dto.device_type.includes('lorawan') ? 'lorawan' : 'modbus'),
      network_id: normalizedNetId,
      plugin_id: dto.plugin_id || 'testing',
      so: soStr.trim(),
      so_number: soStr.trim(),
      so_id: dto.so_id,
      wa: waStr.trim(),
      wa_number: waStr.trim(),
      wa_id: dto.wa_id,
      item_code: dto.item_code.trim(),
      status: 'REGISTERED',
      network_config: dto.network_config || {},
      metadata: dto.metadata || {},
      created_at: now,
      updated_at: now,
    };

    // 4. Lưu vào memory/storage
    this.devices.set(newDevice.id, newDevice);

    // 5. Liên kết tự động sang Traceability
    await this.traceabilityProvider.linkTestingDevice({
      serial_number: newDevice.serial_number,
      so: newDevice.so,
      wa: newDevice.wa,
      item_code: newDevice.item_code,
      device_type: newDevice.device_type,
      network_id: newDevice.network_id,
      status: newDevice.status,
    });

    return newDevice;
  }

  async listDevices(query?: DeviceFilterQuery): Promise<{ total: number; items: TestingDevice[] }> {
    let result = Array.from(this.devices.values());

    if (query?.so) {
      result = result.filter((d) => d.so.toLowerCase() === query.so!.toLowerCase());
    }
    if (query?.wa) {
      result = result.filter((d) => d.wa.toLowerCase() === query.wa!.toLowerCase());
    }
    if (query?.item_code) {
      result = result.filter((d) => d.item_code.toLowerCase() === query.item_code!.toLowerCase());
    }
    if (query?.status) {
      result = result.filter((d) => d.status === query.status);
    }
    if (query?.device_type) {
      result = result.filter((d) => d.device_type === query.device_type);
    }
    if (query?.network_id) {
      result = result.filter((d) => d.network_id.includes(query.network_id!.toUpperCase()));
    }
    if (query?.search) {
      const s = query.search.toLowerCase();
      result = result.filter(
        (d) =>
          d.serial_number.toLowerCase().includes(s) ||
          d.device_name.toLowerCase().includes(s) ||
          d.network_id.toLowerCase().includes(s)
      );
    }

    const total = result.length;
    const offset = query?.offset || 0;
    const limit = query?.limit || 50;
    const paginated = result.slice(offset, offset + limit);

    return { total, items: paginated };
  }

  async getDeviceById(id: string): Promise<TestingDevice | null> {
    return this.devices.get(id) || null;
  }

  async getDeviceByNetworkId(networkId: string): Promise<TestingDevice | null> {
    const netUpper = networkId.trim().toUpperCase();
    for (const d of this.devices.values()) {
      if (d.network_id.toUpperCase() === netUpper) {
        return d;
      }
    }
    return null;
  }

  async updateDeviceStatus(id: string, status: TestingDeviceStatus): Promise<TestingDevice> {
    const device = this.devices.get(id);
    if (!device) {
      throw new Error(`Device with ID "${id}" not found.`);
    }
    device.status = status;
    device.updated_at = new Date();
    this.devices.set(id, device);
    return device;
  }

  // --- PACKET INGESTION & MONITORING ---

  async recordPacket(packetInput: {
    network_id: string;
    raw_payload: string;
    f_port?: number;
    f_cnt?: number;
    direction?: 'uplink' | 'downlink';
    rf_info?: {
      rssi?: number;
      snr?: number;
      frequency?: number;
      gateway_id?: string;
    };
    custom_decoder?: (buf: Buffer, port?: number) => Record<string, any>;
  }): Promise<DevicePacketDTO> {
    const targetDevice = await this.getDeviceByNetworkId(packetInput.network_id);

    const packet = PacketProcessor.processIncomingPacket({
      device_id: targetDevice?.id,
      network_id: packetInput.network_id,
      raw_payload: packetInput.raw_payload,
      f_port: packetInput.f_port,
      f_cnt: packetInput.f_cnt,
      direction: packetInput.direction,
      rf_info: packetInput.rf_info,
      custom_decoder: packetInput.custom_decoder,
    });

    packet.id = `pkt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    this.packets.unshift(packet);

    // Cập nhật last_seen_at cho thiết bị nếu có
    if (targetDevice) {
      targetDevice.last_seen_at = packet.received_at;
      if (targetDevice.status === 'REGISTERED') {
        targetDevice.status = 'IN_TEST';
      }
      this.devices.set(targetDevice.id, targetDevice);
    }

    // Giữ bounded size cho in-memory buffer
    if (this.packets.length > 5000) {
      this.packets.length = 5000;
    }

    return packet;
  }

  async getPackets(query?: {
    device_id?: string;
    network_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; items: DevicePacketDTO[] }> {
    let result = this.packets;

    if (query?.device_id) {
      result = result.filter((p) => p.device_id === query.device_id);
    }
    if (query?.network_id) {
      const net = query.network_id.toUpperCase();
      result = result.filter((p) => p.network_id.toUpperCase() === net);
    }

    const total = result.length;
    const offset = query?.offset || 0;
    const limit = query?.limit || 50;

    return { total, items: result.slice(offset, offset + limit) };
  }

  // --- GATEWAY TEST SESSIONS MANAGEMENT ---

  async createGatewayTestSession(dto: GatewayRegistrationSessionDTO): Promise<GatewayTestSession> {
    if (!dto.so?.trim()) {
      throw new Error('SO is required for Gateway Test Session');
    }
    if (!dto.wa?.trim()) {
      throw new Error('WA is required for Gateway Test Session');
    }
    if (!dto.gateway_ip?.trim() || !TestingService.validateGatewayIp(dto.gateway_ip)) {
      throw new Error(`Invalid Gateway IP format: "${dto.gateway_ip}". Expected IPv4 format (x.x.x.x)`);
    }
    if (!dto.network_server_id?.trim()) {
      throw new Error('network_server_id is required');
    }

    const info = dto.gateway_info;
    const serial = info?.serial_number || dto.confirmed_serial_number;

    if (!serial) {
      throw new Error('Serial number is missing from gateway info');
    }

    if (!TestingService.validateSerialConfirmation(serial, dto.confirmed_serial_number)) {
      throw new Error(`Confirmed serial "${dto.confirmed_serial_number}" does not match actual serial "${serial}"`);
    }

    const sessionId = `gw-sess-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const sessionCode = `GW-${serial.toUpperCase()}-${Date.now().toString().slice(-6)}`;
    const eui = info?.eui || `eui-${serial}`;
    const itemCode = info?.item_code || 'UNKNOWN_ITEM';
    const sku = info?.sku || 'UNKNOWN_SKU';

    const forwarderConfig = TestingService.buildChangeGatewayConfig(dto, dto.network_server_host);

    const session: GatewayTestSession = {
      id: sessionId,
      session_code: sessionCode,
      gateway_ip: dto.gateway_ip.trim(),
      serial_number: serial,
      eui,
      item_code: itemCode,
      sku,
      firmware_version: info?.firmware_version,
      hardware_version: info?.hardware_version,
      mechanical_version: info?.mechanical_version,
      lte_module_serial_number: info?.lte_module_serial_number,
      lte_module_imei: info?.lte_module_imei,
      so: dto.so.trim(),
      wa: dto.wa.trim(),
      network_server_id: dto.network_server_id.trim(),
      internet_test_type: dto.internet_test_type,
      region_test: dto.region_test,
      status: 'REGISTERED',
      gateway_config: info,
      packet_forwarder_config: forwarderConfig.gatewayConfig,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.gatewaySessions.set(session.id, session);

    // Đồng thời đồng bộ sang TestingDevice để phục vụ màn hình danh sách thiết bị
    const existingDev = Array.from(this.devices.values()).find(
      (d) => d.serial_number === serial || d.network_id === eui
    );

    const deviceRecord: TestingDevice = {
      id: existingDev?.id || `dev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      serial_number: serial,
      device_name: `Gateway ${sku} (${serial})`,
      device_type: 'lorawan_gateway',
      network_type: 'lorawan_gateway',
      network_id: eui,
      so: dto.so.trim(),
      wa: dto.wa.trim(),
      item_code: itemCode,
      status: 'REGISTERED',
      metadata: {
        sku,
        firmware_version: info?.firmware_version,
        hardware_version: info?.hardware_version,
        mechanical_version: info?.mechanical_version,
        lte_module_serial_number: info?.lte_module_serial_number,
        lte_module_imei: info?.lte_module_imei,
        gateway_ip: dto.gateway_ip.trim(),
        internet_test_type: dto.internet_test_type,
        region_test: dto.region_test,
        last_session_id: session.id,
      },
      created_at: existingDev?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.devices.set(deviceRecord.id, deviceRecord);

    return session;
  }

  async getGatewayTestSessions(): Promise<GatewayTestSession[]> {
    return Array.from(this.gatewaySessions.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  async getGatewayTestSessionById(id: string): Promise<GatewayTestSession | null> {
    return this.gatewaySessions.get(id) || null;
  }

  // --- DEVICE SIMULATION FLOW ---

  async saveSimulationProfile(profile: DeviceSimulationProfile): Promise<DeviceSimulationProfile> {
    const id = profile.id || `sim-prof-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const saved: DeviceSimulationProfile = {
      ...profile,
      id,
      dev_eui: profile.dev_eui.trim().toUpperCase(),
    };
    this.simulationProfiles.set(id, saved);
    return saved;
  }

  async getSimulationProfiles(): Promise<DeviceSimulationProfile[]> {
    return Array.from(this.simulationProfiles.values());
  }

  async getSimulationProfileById(id: string): Promise<DeviceSimulationProfile | null> {
    return this.simulationProfiles.get(id) || null;
  }

  async simulateDeviceUplink(profile: DeviceSimulationProfile): Promise<DeviceSimulationResult> {
    const simulationId = `sim-run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const startedAt = new Date().toISOString();
    const burstCount = Math.max(1, Math.min(profile.burst_count || 1, 100));
    const generatedPackets: DevicePacketDTO[] = [];

    const devEui = profile.dev_eui.trim().toUpperCase();
    let existingDev = await this.getDeviceByNetworkId(devEui);
    if (!existingDev && profile.serial_number && (profile.so_number || profile.wa_number)) {
      try {
        existingDev = await this.registerDevice({
          serial_number: profile.serial_number,
          device_name: profile.name || `Simulated-${devEui.substring(devEui.length - 4)}`,
          device_type: 'lorawan_node',
          network_type: 'lorawan',
          network_id: devEui,
          so: profile.so_number || 'SO-SIM-DEFAULT',
          wa: profile.wa_number || 'WA-SIM-DEFAULT',
          item_code: profile.item_code || 'ITEM-SIM',
        });
      } catch (e) {
        // Ignored if already registered
      }
    }

    let currentFCnt = profile.f_cnt ?? 1;

    for (let i = 0; i < burstCount; i++) {
      let rawHex = profile.payload_hex || '01020304';
      if (!profile.payload_hex && profile.decoded_payload) {
        rawHex = Buffer.from(JSON.stringify(profile.decoded_payload)).toString('hex');
      }

      const baseRssi = profile.rf_info?.rssi ?? -75;
      const baseSnr = profile.rf_info?.snr ?? 9;
      const rssi = Math.round(baseRssi + (Math.random() * 4 - 2));
      const snr = parseFloat((baseSnr + (Math.random() * 2 - 1)).toFixed(1));

      const packet = await this.recordPacket({
        network_id: devEui,
        raw_payload: rawHex,
        f_port: profile.f_port ?? 1,
        f_cnt: currentFCnt++,
        direction: 'uplink',
        rf_info: {
          rssi,
          snr,
          frequency: profile.rf_info?.frequency ?? 868100000,
          gateway_id: profile.rf_info?.gateway_id ?? 'gw-sim-01',
        },
      });

      if (profile.decoded_payload && Object.keys(profile.decoded_payload).length > 0) {
        packet.decoded_payload = { ...packet.decoded_payload, ...profile.decoded_payload };
      }

      generatedPackets.push(packet);
    }

    const result: DeviceSimulationResult = {
      simulation_id: simulationId,
      dev_eui: devEui,
      serial_number: profile.serial_number,
      status: 'completed',
      packets_generated: generatedPackets,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };

    this.simulationResults.set(simulationId, result);
    return result;
  }

  async getSimulationResults(): Promise<DeviceSimulationResult[]> {
    return Array.from(this.simulationResults.values()).sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
  }

  async getSimulationResultById(id: string): Promise<DeviceSimulationResult | null> {
    return this.simulationResults.get(id) || null;
  }

  // --- DEVICE AUTO CHECK FLOW ---

  getDefaultAutoCheckRules(): AutoCheckCriteria {
    return {
      min_rssi: -120,
      max_rssi: -30,
      min_snr: -15,
      expected_f_port: 1,
      required_fields: ['dev_eui', 'payload', 'f_port'],
      field_rules: {},
    };
  }

  async evaluateAutoCheck(
    target: {
      packet?: DevicePacketDTO;
      packet_id?: string;
      dev_eui?: string;
      serial_number?: string;
    },
    criteria?: AutoCheckCriteria
  ): Promise<AutoCheckEvaluation> {
    const rules = { ...this.getDefaultAutoCheckRules(), ...(criteria || {}) };
    let packet: DevicePacketDTO | undefined = target.packet;

    if (!packet && target.packet_id) {
      packet = this.packets.find((p) => p.id === target.packet_id);
    }

    if (!packet && (target.dev_eui || target.serial_number)) {
      let deviceId: string | undefined;
      if (target.serial_number) {
        for (const d of this.devices.values()) {
          if (d.serial_number.toLowerCase() === target.serial_number.toLowerCase()) {
            deviceId = d.id;
            break;
          }
        }
      }
      const list = await this.getPackets({
        network_id: target.dev_eui,
        device_id: deviceId,
        limit: 1,
      });
      if (list.items.length > 0) {
        packet = list.items[0];
      }
    }

    if (!packet) {
      throw new Error('No packet found matching the target criteria for Auto Check evaluation.');
    }

    const ruleResults: AutoCheckRuleResult[] = [];

    // Rule 1: RSSI Signal Range
    const rssi = packet.rf_info?.rssi;
    if (rules.min_rssi !== undefined || rules.max_rssi !== undefined) {
      const min = rules.min_rssi ?? -140;
      const max = rules.max_rssi ?? 0;
      const passed = rssi !== undefined && rssi >= min && rssi <= max;
      ruleResults.push({
        rule: 'RSSI_RANGE_CHECK',
        passed,
        actual: rssi,
        expected: `Between ${min} dBm and ${max} dBm`,
        message: passed ? `RSSI ${rssi} dBm is within valid range` : `RSSI ${rssi} dBm out of range [${min}, ${max}]`,
      });
    }

    // Rule 2: SNR Signal Quality
    const snr = packet.rf_info?.snr;
    if (rules.min_snr !== undefined) {
      const passed = snr !== undefined && snr >= rules.min_snr;
      ruleResults.push({
        rule: 'SNR_MIN_CHECK',
        passed,
        actual: snr,
        expected: `>= ${rules.min_snr} dB`,
        message: passed ? `SNR ${snr} dB meets requirement` : `SNR ${snr} dB is below threshold ${rules.min_snr} dB`,
      });
    }

    // Rule 3: fPort Check
    if (rules.expected_f_port !== undefined) {
      const passed = packet.f_port === rules.expected_f_port;
      ruleResults.push({
        rule: 'FPORT_MATCH_CHECK',
        passed,
        actual: packet.f_port,
        expected: rules.expected_f_port,
        message: passed ? `fPort ${packet.f_port} matched` : `Expected fPort ${rules.expected_f_port}, got ${packet.f_port}`,
      });
    }

    // Rule 4: Required Fields in Packet / Decoded Payload
    if (rules.required_fields && rules.required_fields.length > 0) {
      for (const field of rules.required_fields) {
        let actualVal: any;
        if (field === 'dev_eui' || field === 'network_id') actualVal = packet.network_id;
        else if (field === 'payload' || field === 'raw_payload') actualVal = packet.raw_payload;
        else if (field === 'f_port') actualVal = packet.f_port;
        else if (field === 'f_cnt') actualVal = packet.f_cnt;
        else actualVal = packet.decoded_payload?.[field];

        const passed = actualVal !== undefined && actualVal !== null && actualVal !== '';
        ruleResults.push({
          rule: `FIELD_REQUIRED_${field.toUpperCase()}`,
          passed,
          actual: actualVal ?? null,
          expected: 'Non-empty value',
          message: passed ? `Field '${field}' present` : `Missing required field '${field}'`,
        });
      }
    }

    // Rule 5: Specific Field Rules
    if (rules.field_rules && typeof rules.field_rules === 'object') {
      for (const [field, rule] of Object.entries(rules.field_rules)) {
        const actualVal = packet.decoded_payload?.[field];
        let passed = true;
        let failReason = '';

        if (actualVal === undefined || actualVal === null) {
          passed = false;
          failReason = `Field '${field}' missing from decoded payload`;
        } else {
          if (rule.equals !== undefined && actualVal !== rule.equals) {
            passed = false;
            failReason = `Expected ${rule.equals}, got ${actualVal}`;
          }
          if (rule.min !== undefined && (typeof actualVal !== 'number' || actualVal < rule.min)) {
            passed = false;
            failReason = `Expected >= ${rule.min}, got ${actualVal}`;
          }
          if (rule.max !== undefined && (typeof actualVal !== 'number' || actualVal > rule.max)) {
            passed = false;
            failReason = `Expected <= ${rule.max}, got ${actualVal}`;
          }
        }

        ruleResults.push({
          rule: `FIELD_VALUE_RULE_${field.toUpperCase()}`,
          passed,
          actual: actualVal,
          expected: rule,
          message: passed ? `Rule for '${field}' passed` : failReason,
        });
      }
    }

    const passedCount = ruleResults.filter((r) => r.passed).length;
    const failedCount = ruleResults.length - passedCount;
    const verdict = failedCount === 0 ? 'PASS' : 'FAIL';

    let serialNumber = target.serial_number;
    if (!serialNumber && packet.device_id) {
      const dev = await this.getDeviceById(packet.device_id);
      serialNumber = dev?.serial_number;
    }

    const evaluation: AutoCheckEvaluation = {
      evaluation_id: `chk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      serial_number: serialNumber,
      network_id: packet.network_id,
      verdict,
      total_rules: ruleResults.length,
      passed_rules: passedCount,
      failed_rules: failedCount,
      rule_results: ruleResults,
      evaluated_at: new Date().toISOString(),
      packet_summary: {
        raw_payload: packet.raw_payload,
        f_port: packet.f_port,
        f_cnt: packet.f_cnt,
        rssi: packet.rf_info?.rssi,
        snr: packet.rf_info?.snr,
        decoded: packet.decoded_payload,
      },
    };

    this.autoCheckEvaluations.set(evaluation.evaluation_id, evaluation);
    return evaluation;
  }

  async getAutoCheckEvaluations(): Promise<AutoCheckEvaluation[]> {
    return Array.from(this.autoCheckEvaluations.values()).sort(
      (a, b) => new Date(b.evaluated_at).getTime() - new Date(a.evaluated_at).getTime()
    );
  }

  async getAutoCheckEvaluationById(id: string): Promise<AutoCheckEvaluation | null> {
    return this.autoCheckEvaluations.get(id) || null;
  }

  // --- CREATE DEVICE TESTING SESSIONS ---

  async createDeviceTestSession(dto: CreateDeviceTestDTO): Promise<DeviceTestSession> {
    const serialNumber = (dto.serial_number || dto.serialNumber || '').trim();
    if (!serialNumber) {
      throw new Error('Số Serial (serial_number) là bắt buộc để tạo phiên kiểm thử thiết bị.');
    }

    const sessionId = `dev-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sessionName =
      dto.session_name ||
      dto.sessionName ||
      `Kiểm thử thiết bị ${serialNumber} - ${new Date().toLocaleTimeString('vi-VN')}`;

    const session: DeviceTestSession = {
      id: sessionId,
      session_name: sessionName,
      device_id: dto.device_id || dto.deviceId,
      serial_number: serialNumber,
      network_id: dto.network_id || dto.networkId,
      connectivity: (dto.connectivity as any) || 'LoRaWAN',
      item_code: dto.item_code || dto.itemCode,
      sku: dto.sku,
      profile_id: dto.profile_id || dto.profileId,
      flow_blocks: dto.flow_blocks || dto.flowBlocks || [],
      auto_check_criteria: dto.auto_check_criteria || dto.autoCheckCriteria,
      status: 'IDLE',
      verdict: 'PENDING',
      total_packets_sent: 0,
      metadata: {
        ...(dto.metadata || {}),
        ...(dto.network_server_id || dto.networkServerId ? { network_server_id: dto.network_server_id || dto.networkServerId } : {}),
        ...(dto.application_id || dto.applicationId ? { application_id: dto.application_id || dto.applicationId } : {}),
        ...(dto.device_profile_id || dto.deviceProfileId ? { device_profile_id: dto.device_profile_id || dto.deviceProfileId } : {}),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.deviceTestSessions.set(sessionId, session);
    return session;
  }

  async getDeviceTestSessions(): Promise<DeviceTestSession[]> {
    return Array.from(this.deviceTestSessions.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  async getDeviceTestSessionById(id: string): Promise<DeviceTestSession | null> {
    return this.deviceTestSessions.get(id) || null;
  }

  async updateDeviceTestSessionStatus(
    id: string,
    status: DeviceTestSessionStatus,
    evaluation?: AutoCheckEvaluation
  ): Promise<DeviceTestSession | null> {
    const session = this.deviceTestSessions.get(id);
    if (!session) return null;

    session.status = status;
    session.updated_at = new Date().toISOString();

    if (status === 'RUNNING' && !session.started_at) {
      session.started_at = new Date().toISOString();
    }

    if (evaluation) {
      session.evaluation = evaluation;
      session.verdict = evaluation.verdict;
    }

    if (status === 'PASSED' || status === 'FAILED' || status === 'CANCELLED') {
      session.completed_at = new Date().toISOString();
      if (!session.verdict || session.verdict === 'PENDING') {
        session.verdict = status === 'PASSED' ? 'PASS' : status === 'FAILED' ? 'FAIL' : 'PENDING';
      }
    }

    return session;
  }
}

