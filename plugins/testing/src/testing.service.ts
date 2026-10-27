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
} from './testing.types';
import { ITraceabilityProvider, DefaultTraceabilityBridge } from './testing-traceability.bridge';
import { PacketProcessor } from './packet-processor';

export class TestingService {
  private devices: Map<string, TestingDevice> = new Map();
  private packets: DevicePacketDTO[] = [];
  private gatewaySessions: Map<string, GatewayTestSession> = new Map();
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
}
