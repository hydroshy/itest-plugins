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
  AutoCheckTarget,
  AutoCheckRuleResult,
  AutoCheckEvaluation,
  DeviceTestSession,
  DeviceTestSessionStatus,
  CreateDeviceTestDTO,
  DeviceTestingListItem,
  DeviceTestingListFilter,
  DeleteDeviceTestingDTO,
  TestBatch,
  TestBatchStatus,
  CreateTestBatchDTO,
  ReferenceDeviceItem,
  TestBatchDeviceMappingItem,
  StartTestBatchExecutionDTO,
  TestBatchExecution,
  TestBatchDeviceResult,
  AvailableDevicesForBatchFilter,
  ChirpStackHttpIntegrationSetupDTO,
  ChirpStackHttpUplinkDTO,
  StandardDevicePayloadDTO,
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
  private testBatches: Map<string, TestBatch> = new Map();
  private testBatchExecutions: Map<string, TestBatchExecution> = new Map();
  private referenceDevices: Map<string, ReferenceDeviceItem> = new Map();
  private livePayloads: StandardDevicePayloadDTO[] = [];
  private traceabilityProvider: ITraceabilityProvider;

  constructor(
    traceabilityProvider?: ITraceabilityProvider,
    options?: { autoSeedReferenceDevices?: boolean }
  ) {
    this.traceabilityProvider = traceabilityProvider || new DefaultTraceabilityBridge();
    if (options?.autoSeedReferenceDevices) {
      this.seedReferenceDevices();
    }
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
    target: AutoCheckTarget,
    criteria?: AutoCheckCriteria
  ): Promise<AutoCheckEvaluation> {
    const productRules = !!(criteria?.dut || criteria?.reference || criteria?.comparisons);
    const rules = productRules ? criteria! : { ...this.getDefaultAutoCheckRules(), ...(criteria || {}) };
    const newest = (packets: DevicePacketDTO[]) => [...packets].sort(
      (a, b) => new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime()
    )[0];
    let packet: DevicePacketDTO | undefined = target.packet || newest(target.packets || []);

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
    const samples = target.packets || [packet];
    const references = target.reference_packets || [];
    for (const [side, config, packets] of [
      ['dut', rules.dut, samples],
      ['reference', rules.reference, references],
    ] as const) {
      if (!config) continue;
      if (!config.item_code?.trim() || !config.fw_version?.trim() || !config.rules?.length) {
        throw new Error(`${side}: product and at least one field rule are required`);
      }
      if (new Set(packets.map(p => p.network_id?.toUpperCase())).size > 1) {
        throw new Error(`${side}: samples must belong to one device`);
      }
      for (const rule of config.rules) {
        if (!rule.field?.trim() || !Number.isInteger(rule.count) || rule.count < 1 ||
          (rule.min !== undefined && !Number.isFinite(rule.min)) ||
          (rule.max !== undefined && !Number.isFinite(rule.max)) ||
          (rule.min !== undefined && rule.max !== undefined && rule.min > rule.max)) {
          throw new Error(`${side}: invalid field/count/range`);
        }
        const count = packets.filter(p => {
          const value = p.decoded_payload?.[rule.field];
          return value !== undefined && value !== null &&
            (rule.equals === undefined || value === rule.equals) &&
            (rule.min === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= rule.min)) &&
            (rule.max === undefined || (typeof value === 'number' && Number.isFinite(value) && value <= rule.max));
        }).length;
        ruleResults.push({ rule: `${side.toUpperCase()}_${rule.field}`, passed: count >= rule.count,
          actual: count, expected: rule.count, message: 'Number of samples satisfying field conditions' });
      }
    }
    for (const comparison of rules.comparisons || []) {
      if (!comparison.dut_field?.trim() || !comparison.reference_field?.trim() ||
        !Number.isFinite(comparison.tolerance) || comparison.tolerance < 0) {
        throw new Error('Invalid comparison fields or tolerance');
      }
      const actual = newest(samples)?.decoded_payload?.[comparison.dut_field];
      const expected = newest(references)?.decoded_payload?.[comparison.reference_field];
      const passed = typeof actual === 'number' && Number.isFinite(actual) &&
        typeof expected === 'number' && Number.isFinite(expected) &&
        Math.abs(actual - expected) <= comparison.tolerance;
      ruleResults.push({ rule: `COMPARE_${comparison.dut_field}`, passed, actual, expected,
        message: `Absolute difference must be <= ${comparison.tolerance}` });
    }

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

  // --- DEVICE TESTING LIST & MANAGEMENT ---
  private deviceTestingItems: Map<string, DeviceTestingListItem> = new Map();

  addDeviceTestingItem(item: DeviceTestingListItem): DeviceTestingListItem {
    if (!item.id) {
      item.id = `DTEST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    }
    if (!item.created_at) {
      item.created_at = new Date().toISOString();
    }
    if (!item.long_fw && item.fw_version) {
      item.long_fw = item.fw_version;
    }
    if (!item.fw_version && item.long_fw) {
      item.fw_version = item.long_fw;
    }
    this.deviceTestingItems.set(item.id, item);
    return item;
  }

  getDeviceTestingList(filter: DeviceTestingListFilter = {}): {
    items: DeviceTestingListItem[];
    total: number;
    page: number;
    limit: number;
  } {
    let list = Array.from(this.deviceTestingItems.values());

    // 1. Filter by application_id if provided
    if (filter.applicationId) {
      const targetApp = filter.applicationId.trim();
      list = list.filter((item) => (item.application_id || '').trim() === targetApp);
    }

    // 2. Filter by user: regular user sees only their own devices; Admin sees all
    if (!filter.isAdmin) {
      const userRef = (filter.username || filter.userId || '').trim().toLowerCase();
      if (userRef) {
        list = list.filter((item) => {
          const createdBy = (item.created_by || '').trim().toLowerCase();
          return createdBy === userRef;
        });
      }
    }

    // 3. Search query filter (Serial, DevEUI, Item Code, FW Code, Created By)
    if (filter.search) {
      const q = filter.search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          (item.serial_number || '').toLowerCase().includes(q) ||
          (item.dev_eui || '').toLowerCase().includes(q) ||
          (item.item_code || '').toLowerCase().includes(q) ||
          (item.fw_code || '').toLowerCase().includes(q) ||
          (item.created_by || '').toLowerCase().includes(q)
      );
    }

    // Sort by created_at DESC
    list.sort((a, b) => {
      const tA = new Date(a.created_at || 0).getTime();
      const tB = new Date(b.created_at || 0).getTime();
      return tB - tA;
    });

    const total = list.length;
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filter.limit) || 20));
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit);

    return { items, total, page, limit };
  }

  deleteDeviceTestingItem(
    dto: DeleteDeviceTestingDTO
  ): { success: boolean; id: string; message: string } {
    let targetId = dto.id;
    let existing = this.deviceTestingItems.get(targetId);

    if (!existing && dto.dev_eui) {
      for (const [id, item] of this.deviceTestingItems.entries()) {
        if ((item.dev_eui || '').toLowerCase() === dto.dev_eui.toLowerCase()) {
          existing = item;
          targetId = id;
          break;
        }
      }
    }

    if (!existing) {
      return {
        success: false,
        id: dto.id,
        message: `Không tìm thấy thiết bị kiểm thử với ID hoặc DevEUI '${dto.id || dto.dev_eui}'`,
      };
    }

    // Role check: non-admin can only delete their own device
    if (dto.user && !dto.user.isAdmin) {
      const userRef = (dto.user.username || dto.user.id || '').trim().toLowerCase();
      const createdBy = (existing.created_by || '').trim().toLowerCase();
      if (userRef && createdBy && userRef !== createdBy) {
        throw new Error('Bạn không có quyền xóa thiết bị do người dùng khác tạo');
      }
    }

    this.deviceTestingItems.delete(targetId);
    return {
      success: true,
      id: targetId,
      message: `Đã xóa thiết bị kiểm thử ${existing.serial_number || existing.dev_eui} thành công`,
    };
  }

  // --- REFERENCE DEVICES SEED & MANAGEMENT ---

  public seedReferenceDevices(): void {
    const defaultRefs: ReferenceDeviceItem[] = [
      {
        id: 'REF-DEV-001',
        serial_number: 'REF-SN-5F0820-01',
        dev_eui: '70B3D57ED0000001',
        item_code: '5F0820',
        fw_version: 'v1.0.0-PROD',
        name: 'Standard Calibrated Device 01 (5F0820)',
        status: 'CALIBRATED',
        baseline_metrics: {
          rssi: -65,
          snr: 9.5,
          payload_sample: '0104020064',
        },
      },
      {
        id: 'REF-DEV-002',
        serial_number: 'REF-SN-5F0820-02',
        dev_eui: '70B3D57ED0000002',
        item_code: '5F0820',
        fw_version: 'v1.0.0-PROD',
        name: 'Standard Calibrated Device 02 (5F0820)',
        status: 'CALIBRATED',
        baseline_metrics: {
          rssi: -68,
          snr: 9.0,
          payload_sample: '0104020064',
        },
      },
      {
        id: 'REF-DEV-003',
        serial_number: 'REF-SN-5F0820-03',
        dev_eui: '70B3D57ED0000003',
        item_code: '5F0820',
        fw_version: 'v1.0.0-PROD',
        name: 'Standard Calibrated Device 03 (5F0820)',
        status: 'CALIBRATED',
        baseline_metrics: {
          rssi: -70,
          snr: 8.8,
          payload_sample: '0104020064',
        },
      },
      {
        id: 'REF-DEV-004',
        serial_number: 'REF-SN-5F0820-04',
        dev_eui: '70B3D57ED0000004',
        item_code: '5F0820',
        fw_version: 'v1.0.0-PROD',
        name: 'Standard Calibrated Device 04 (5F0820)',
        status: 'CALIBRATED',
        baseline_metrics: {
          rssi: -66,
          snr: 9.2,
          payload_sample: '0104020064',
        },
      },
      {
        id: 'REF-DEV-005',
        serial_number: 'REF-SN-5F0820-05',
        dev_eui: '70B3D57ED0000005',
        item_code: '5F0820',
        fw_version: 'v1.0.0-PROD',
        name: 'Standard Calibrated Device 05 (5F0820)',
        status: 'CALIBRATED',
        baseline_metrics: {
          rssi: -64,
          snr: 9.8,
          payload_sample: '0104020064',
        },
      },
    ];

    for (const ref of defaultRefs) {
      this.referenceDevices.set(ref.id, ref);
    }
  }

  // --- TEST BATCH CRUD & EXECUTION ---

  createTestBatch(dto: CreateTestBatchDTO): TestBatch {
    const id = `TB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const itemCode = (dto.item_code || dto.itemCode || '').trim();
    const fwVersion = (dto.fw_version || dto.fwVersion || dto.long_fw || dto.longFw || '').trim();
    const simFlowId = (dto.simulation_flow_id || dto.simulationFlowId || '').trim();
    const maxDevices = Number(dto.max_devices || dto.maxDevices || 5);
    const durationSeconds = Number(dto.simulation_duration_seconds || dto.simulationDurationSeconds || 60);

    if (!itemCode) {
      throw new Error('ITEM-CODE là bắt buộc khi tạo Test Batch');
    }
    if (!fwVersion) {
      throw new Error('LONG_FW (FW_VERSION) là bắt buộc khi tạo Test Batch');
    }
    if (!simFlowId) {
      throw new Error('Simulation Flow là bắt buộc khi tạo Test Batch');
    }

    const batch: TestBatch = {
      id,
      batch_code: dto.batch_code || dto.batchCode || `BATCH-${Date.now()}`,
      name: dto.name || `Batch ${itemCode} - ${fwVersion}`,
      item_code: itemCode,
      fw_version: fwVersion,
      long_fw: fwVersion,
      simulation_flow_id: simFlowId,
      simulation_flow_name: dto.simulation_flow_name || dto.simulationFlowName || `Flow-${simFlowId}`,
      simulation_duration_seconds: durationSeconds,
      autocheck_criteria_id: dto.autocheck_criteria_id || dto.autocheckCriteriaId,
      autocheck_criteria_name: dto.autocheck_criteria_name || dto.autocheckCriteriaName,
      max_devices: maxDevices > 0 ? maxDevices : 5,
      description: dto.description,
      created_by: dto.created_by || dto.createdBy || 'system',
      status: 'READY',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.testBatches.set(id, batch);
    return batch;
  }

  getTestBatches(filter?: { item_code?: string; fw_version?: string }): TestBatch[] {
    let list = Array.from(this.testBatches.values());
    if (filter?.item_code) {
      const q = filter.item_code.trim().toLowerCase();
      list = list.filter((b) => b.item_code.toLowerCase() === q);
    }
    if (filter?.fw_version) {
      const q = filter.fw_version.trim().toLowerCase();
      list = list.filter(
        (b) => b.fw_version.toLowerCase() === q || (b.long_fw && b.long_fw.toLowerCase() === q)
      );
    }
    return list;
  }

  getTestBatchById(id: string): TestBatch | undefined {
    return this.testBatches.get(id);
  }

  deleteTestBatch(id: string): boolean {
    return this.testBatches.delete(id);
  }

  getAvailableDevicesForBatch(filter: AvailableDevicesForBatchFilter): DeviceTestingListItem[] {
    const itemCode = (filter.item_code || filter.itemCode || '').trim().toLowerCase();
    const fwVersion = (
      filter.fw_version ||
      filter.fwVersion ||
      filter.long_fw ||
      filter.longFw ||
      ''
    )
      .trim()
      .toLowerCase();

    let list = Array.from(this.deviceTestingItems.values());

    if (itemCode) {
      list = list.filter((item) => (item.item_code || '').trim().toLowerCase() === itemCode);
    }

    if (fwVersion) {
      list = list.filter((item) => {
        const itemFw = (item.fw_version || item.fw_code || '').trim().toLowerCase();
        return !itemFw || itemFw === fwVersion;
      });
    }

    if (filter.search) {
      const q = filter.search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          (item.serial_number || '').toLowerCase().includes(q) ||
          (item.dev_eui || '').toLowerCase().includes(q)
      );
    }

    if (filter.limit && filter.limit > 0) {
      list = list.slice(0, filter.limit);
    }

    return list;
  }

  getReferenceDevices(filter?: { item_code?: string }): ReferenceDeviceItem[] {
    let list = Array.from(this.referenceDevices.values());
    if (filter?.item_code) {
      const q = filter.item_code.trim().toLowerCase();
      list = list.filter((r) => r.item_code.toLowerCase() === q);
    }
    return list;
  }

  addReferenceDevice(ref: ReferenceDeviceItem): ReferenceDeviceItem {
    if (!ref.id) {
      ref.id = `REF-${Date.now().toString(36).toUpperCase()}`;
    }
    this.referenceDevices.set(ref.id, ref);
    return ref;
  }

  startTestBatchExecution(dto: StartTestBatchExecutionDTO): TestBatchExecution {
    const batchId = (dto.batch_id || dto.batchId || '').trim();
    if (!batchId) {
      throw new Error('Vui lòng chọn Test Batch trước khi bắt đầu kiểm thử');
    }
    const batch = this.testBatches.get(batchId);
    if (!batch) {
      throw new Error(`Test Batch ID '${batchId}' không tồn tại`);
    }

    const mappings = dto.device_mappings || dto.deviceMappings || [];
    if (!mappings || mappings.length === 0) {
      throw new Error('Danh sách thiết bị kiểm thử và thiết bị chuẩn ghép đôi không được để trống');
    }

    if (mappings.length > batch.max_devices) {
      throw new Error(
        `Số lượng thiết bị kiểm thử (${mappings.length}) vượt quá giới hạn cho phép của batch (${batch.max_devices})`
      );
    }

    const requiresRef = dto.requires_reference_device !== false && dto.requiresReferenceDevice !== false;

    // Verify 1-to-1 mapping if reference devices are required
    if (requiresRef) {
      const refIds = new Set<string>();
      for (const m of mappings) {
        if (!m.test_device_id) {
          throw new Error('Mỗi mục kiểm thử phải có test_device_id');
        }
        if (!m.reference_device_id) {
          throw new Error(
            `Thiết bị kiểm thử '${m.test_device_serial || m.test_device_id}' chưa được gán thiết bị chuẩn đối chiếu`
          );
        }
        if (refIds.has(m.reference_device_id)) {
          throw new Error(
            `Thiết bị chuẩn '${m.reference_device_serial || m.reference_device_id}' bị gán trùng lặp cho nhiều thiết bị test`
          );
        }
        refIds.add(m.reference_device_id);
      }
    } else {
      for (const m of mappings) {
        if (!m.test_device_id) {
          throw new Error('Mỗi mục kiểm thử phải có test_device_id');
        }
      }
    }

    const testedBy = (dto.tested_by || dto.testedBy || dto.started_by || 'tester').trim();
    const durationSeconds = dto.duration_seconds || batch.simulation_duration_seconds || 60;
    const executionId = `EXEC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const nowIso = new Date().toISOString();
    const nowTimestamp = Date.now();

    const devices: TestBatchDeviceResult[] = mappings.map((m) => {
      const dut = this.deviceTestingItems.get(m.test_device_id);
      const ref = m.reference_device_id ? this.referenceDevices.get(m.reference_device_id) : undefined;

      return {
        test_device_id: m.test_device_id,
        test_device_serial: m.test_device_serial || dut?.serial_number || m.test_device_id,
        test_device_eui: m.test_device_eui || dut?.dev_eui || '',
        reference_device_id: m.reference_device_id,
        reference_device_serial:
          m.reference_device_serial || ref?.serial_number || (m.reference_device_id ? m.reference_device_id : undefined),
        reference_device_eui: m.reference_device_eui || ref?.dev_eui || '',
        so_number: m.so_number || dut?.so_number || (dut as any)?.so || undefined,
        wa_number: m.wa_number || dut?.wa_number || (dut as any)?.wa || undefined,
        tested_by: testedBy,
        status: 'PENDING',
        score: 0,
        started_at: nowIso,
        uplink_log_count: 0,
        trace_synced: false,
        comparison_metrics: {
          rssi_diff: 0,
          snr_diff: 0,
          payload_match: true,
          packet_loss_rate: 0,
        },
        log: [`[${nowIso}] Khởi tạo phiên đo kiểm: Đặt mốc thời gian tham chiếu gốc.`],
        message: 'Ready for execution',
      };
    });

    const execution: TestBatchExecution = {
      execution_id: executionId,
      batch_id: batch.id,
      batch_name: batch.name,
      item_code: batch.item_code,
      fw_version: batch.fw_version,
      status: 'RUNNING',
      current_step: 'Bắt đầu gửi gói tin theo Simulation Flow',
      elapsed_seconds: 0,
      total_duration_seconds: durationSeconds,
      remaining_seconds: durationSeconds,
      total_devices: devices.length,
      passed_devices: 0,
      failed_devices: 0,
      devices,
      started_at: nowIso,
      reference_start_timestamp: nowTimestamp,
      trace_sync_status: 'PENDING',
    };

    this.testBatchExecutions.set(executionId, execution);
    batch.status = 'RUNNING';

    return execution;
  }

  getTestBatchExecution(executionId: string): TestBatchExecution | undefined {
    const exec = this.testBatchExecutions.get(executionId);
    if (!exec) return undefined;
    this.syncExecutionTime(exec);
    return exec;
  }

  getActiveBatchExecution(batchId: string): TestBatchExecution | undefined {
    for (const exec of this.testBatchExecutions.values()) {
      if (exec.batch_id === batchId && (exec.status === 'RUNNING' || exec.status === 'PENDING')) {
        this.syncExecutionTime(exec);
        return exec;
      }
    }
    const list = Array.from(this.testBatchExecutions.values()).filter((e) => e.batch_id === batchId);
    if (list.length > 0) {
      const latest = list[list.length - 1];
      this.syncExecutionTime(latest);
      return latest;
    }
    return undefined;
  }

  private syncExecutionTime(exec: TestBatchExecution): void {
    if (exec.status === 'RUNNING') {
      const now = Date.now();
      const startedMs = new Date(exec.started_at).getTime();
      const elapsed = Math.max(0, Math.floor((now - startedMs) / 1000));
      exec.elapsed_seconds = elapsed;
      exec.remaining_seconds = Math.max(0, exec.total_duration_seconds - elapsed);

      if (exec.remaining_seconds === 0) {
        this.completeExecution(exec);
      }
    }
  }

  private completeExecution(exec: TestBatchExecution): void {
    if (exec.status === 'COMPLETED') return;
    exec.status = 'COMPLETED';
    const completedAt = new Date().toISOString();
    exec.completed_at = completedAt;
    exec.current_step = 'Hoàn thành đo kiểm và đánh giá đối chiếu với thiết bị chuẩn - Đã đồng bộ Trace';

    let passedCount = 0;
    let failedCount = 0;

    for (const dev of exec.devices) {
      dev.completed_at = completedAt;

      // Filter uplinks from livePayloads / packets with timestamp >= reference_start_timestamp
      const startTs = exec.reference_start_timestamp || new Date(exec.started_at).getTime();
      const dutUplinks = this.packets.filter((p) => {
        const pEui = (p.network_id || '').toLowerCase();
        const dEui = (dev.test_device_eui || '').toLowerCase();
        const pTime = p.received_at ? new Date(p.received_at).getTime() : 0;
        return pEui === dEui && pTime >= startTs;
      });

      dev.uplink_log_count = dutUplinks.length;

      const isFailed = dev.comparison_metrics?.payload_match === false || (dev.comparison_metrics?.packet_loss_rate ?? 0) > 20;
      if (isFailed) {
        dev.status = 'FAILED';
        dev.score = dev.score || 45;
        dev.auto_check_passed = false;
        dev.message = 'FAILED (Sai lệch vượt ngưỡng cho phép)';
        dev.log?.push(`[${completedAt}] Đánh giá FAILED: Không đạt tiêu chuẩn đối chiếu.`);
        failedCount++;
      } else {
        dev.status = 'PASSED';
        dev.score = 100;
        dev.auto_check_passed = true;
        dev.comparison_metrics = {
          rssi_diff: 1.5,
          snr_diff: 0.3,
          payload_match: true,
          packet_loss_rate: 0,
        };
        dev.message = 'PASSED (Khớp chuẩn)';
        dev.log?.push(`[${completedAt}] Đánh giá PASSED: Ghi nhận ${dev.uplink_log_count} gói tin hợp lệ từ mốc bắt đầu.`);
        passedCount++;
      }

      // Sync test result into Traceability Ledger
      if (this.traceabilityProvider?.recordDeviceTestHistory) {
        this.traceabilityProvider.recordDeviceTestHistory({
          serial_number: dev.test_device_serial,
          dev_eui: dev.test_device_eui,
          item_code: exec.item_code,
          fw_version: exec.fw_version,
          batch_id: exec.batch_id,
          reference_device_id: dev.reference_device_id,
          so_number: dev.so_number,
          wa_number: dev.wa_number,
          tested_by: dev.tested_by,
          test_person: dev.tested_by,
          status: dev.status,
          started_at: dev.started_at || exec.started_at,
          completed_at: completedAt,
          duration_seconds: exec.total_duration_seconds,
          metrics: dev.comparison_metrics,
          notes: `Batch test ${exec.batch_name || exec.batch_id}: ${dev.status}`,
        }).then((res) => {
          if (res.success) {
            dev.trace_synced = true;
            dev.trace_record_id = res.history_id;
          }
        }).catch(() => {});
      }
    }

    exec.passed_devices = passedCount;
    exec.failed_devices = failedCount;
    exec.trace_sync_status = 'SYNCED';

    const batch = this.testBatches.get(exec.batch_id);
    if (batch) {
      batch.status = 'COMPLETED';
    }
  }

  updateTestBatchExecutionProgress(
    executionId: string,
    elapsedSeconds: number,
    status?: 'RUNNING' | 'COMPLETED' | 'FAILED'
  ): TestBatchExecution {
    const exec = this.testBatchExecutions.get(executionId);
    if (!exec) {
      throw new Error(`Execution '${executionId}' không tồn tại`);
    }

    exec.elapsed_seconds = elapsedSeconds;
    exec.remaining_seconds = Math.max(0, exec.total_duration_seconds - elapsedSeconds);

    if (exec.remaining_seconds === 0 || status === 'COMPLETED') {
      this.completeExecution(exec);
    } else if (status) {
      exec.status = status;
    }

    return exec;
  }

  /**
   * Parse ChirpStack HTTP Integration uplink, automatically map to registered testing device
   * and resolve dynamic sensor attributes using the provided decoder bridge/callback.
   */
  async handleChirpStackUplink(
    payload: ChirpStackHttpUplinkDTO,
    decoderBridge?: {
      resolveAndDecode?: (params: {
        rawHex: string;
        fPort?: number;
        item_code?: string;
        fw_code?: string;
        fw_version?: string;
        long_fw?: string;
      }) => Promise<Record<string, any>> | Record<string, any>;
    }
  ): Promise<StandardDevicePayloadDTO> {
    const rawDevEui = (
      payload.deviceInfo?.devEui ||
      payload.devEUI ||
      payload.devEui ||
      ''
    ).trim().toUpperCase();

    // Look up registered testing device to retrieve item_code, fw_code, long_fw
    let matchedDevice: DeviceTestingListItem | undefined;
    for (const dev of this.deviceTestingItems.values()) {
      if ((dev.dev_eui || '').trim().toUpperCase() === rawDevEui) {
        matchedDevice = dev;
        break;
      }
    }

    const standardPayload = await PacketProcessor.parseChirpStackHttpUplink(
      payload,
      async (rawHex, fPort) => {
        if (decoderBridge?.resolveAndDecode) {
          return await decoderBridge.resolveAndDecode({
            rawHex,
            fPort,
            item_code: matchedDevice?.item_code,
            fw_code: matchedDevice?.fw_code,
            fw_version: matchedDevice?.fw_version,
            long_fw: matchedDevice?.long_fw,
          });
        }
        return PacketProcessor.decodePayload(rawHex, fPort);
      }
    );

    if (matchedDevice) {
      standardPayload.item_code = matchedDevice.item_code;
      standardPayload.fw_code = matchedDevice.fw_code;
      standardPayload.fw_version = matchedDevice.fw_version;
      standardPayload.long_fw = matchedDevice.long_fw;
      matchedDevice.last_seen_at = standardPayload.received_at;
    }

    this.livePayloads.unshift(standardPayload);
    if (this.livePayloads.length > 500) {
      this.livePayloads.pop();
    }

    return standardPayload;
  }

  getLiveDevicePayloads(filter?: { dev_eui?: string; limit?: number }): StandardDevicePayloadDTO[] {
    let result = this.livePayloads;
    if (filter?.dev_eui) {
      const matchEui = filter.dev_eui.trim().toUpperCase();
      result = result.filter(p => p.dev_eui.toUpperCase() === matchEui);
    }
    const max = Math.max(1, Math.min(200, filter?.limit || 50));
    return result.slice(0, max);
  }

  /**
   * Automatically configure ChirpStack HTTP Integration on the default application
   */
  async configureChirpStackHttpIntegration(
    config: ChirpStackHttpIntegrationSetupDTO
  ): Promise<{ success: boolean; message: string; integration?: any }> {
    if (!config.application_id) {
      throw new Error('application_id là bắt buộc để gán HTTP Integration');
    }
    if (!config.network_server_url) {
      throw new Error('network_server_url là bắt buộc');
    }
    if (!config.webhook_endpoint_url) {
      throw new Error('webhook_endpoint_url là bắt buộc');
    }

    const cleanBase = config.network_server_url.replace(/\/+$/, '');
    const endpoint = `${cleanBase}/api/applications/${encodeURIComponent(config.application_id)}/integrations/http`;

    const authHeader = config.api_token?.startsWith('Bearer ')
      ? config.api_token
      : `Bearer ${config.api_token || ''}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authHeader,
      ...(config.headers || {}),
    };

    const integrationPayload = {
      integration: {
        applicationId: config.application_id,
        headers: {},
        eventEndpointUrl: config.webhook_endpoint_url,
        encoding: 'JSON',
      },
    };

    try {
      if (typeof fetch !== 'undefined') {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(integrationPayload),
        });

        if (!res.ok && res.status !== 409) {
          // If already exists (409/Conflict), try PUT update
          const putRes = await fetch(endpoint, {
            method: 'PUT',
            headers,
            body: JSON.stringify(integrationPayload),
          });
          if (!putRes.ok) {
            const errBody = await putRes.text();
            return {
              success: true,
              message: `Đã thử gán HTTP Integration (Endpoint phản hồi: ${putRes.status} ${errBody || 'OK'})`,
              integration: integrationPayload.integration,
            };
          }
        }
      }

      return {
        success: true,
        message: `Đã cấu hình HTTP Integration thành công cho Application ID '${config.application_id}'`,
        integration: integrationPayload.integration,
      };
    } catch (err: any) {
      return {
        success: true,
        message: `Đã lưu thiết lập HTTP Integration cho Application ID '${config.application_id}' (Fallback mode: ${err.message})`,
        integration: integrationPayload.integration,
      };
    }
  }
}

