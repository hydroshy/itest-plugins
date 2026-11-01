import { TestingService } from './testing.service';
import {
  AutoCheckCriteria,
  DeviceFilterQuery,
  DeviceRegistrationDTO,
  DeviceSimulationProfile,
  GatewayRegistrationSessionDTO,
} from './testing.types';

export class TestingController {
  constructor(private readonly service: TestingService) {}

  // 1. Lookup Endpoints cho Form Đăng ký thiết bị
  async getTraceabilitySOs() {
    return {
      success: true,
      data: await this.service.getAvailableSOs(),
    };
  }

  async getTraceabilityWAs(soNumber: string) {
    return {
      success: true,
      data: await this.service.getAvailableWAs(soNumber),
    };
  }

  async getTraceabilityItemCodes(soNumber?: string, waNumber?: string) {
    return {
      success: true,
      data: await this.service.getAvailableItemCodes(soNumber, waNumber),
    };
  }

  // 2. Gateway Testing Sessions & Helpers
  validateGatewayIp(ip: string) {
    const isValid = TestingService.validateGatewayIp(ip);
    return {
      success: true,
      data: {
        ip,
        isValid,
      },
    };
  }

  validateSerialConfirmation(actualSerial: string, confirmedSerial: string) {
    const isMatched = TestingService.validateSerialConfirmation(actualSerial, confirmedSerial);
    return {
      success: true,
      data: {
        isMatched,
      },
    };
  }

  buildChangeGatewayConfig(dto: GatewayRegistrationSessionDTO, host?: string) {
    const config = TestingService.buildChangeGatewayConfig(dto, host);
    return {
      success: true,
      data: config,
    };
  }

  async createGatewayTestSession(dto: GatewayRegistrationSessionDTO) {
    const session = await this.service.createGatewayTestSession(dto);
    return {
      success: true,
      message: 'Khởi tạo phiên kiểm thử Gateway thành công',
      data: session,
    };
  }

  async listGatewayTestSessions() {
    const sessions = await this.service.getGatewayTestSessions();
    return {
      success: true,
      data: sessions,
      total: sessions.length,
    };
  }

  async getGatewayTestSession(id: string) {
    const session = await this.service.getGatewayTestSessionById(id);
    if (!session) {
      return { success: false, message: 'Phiên kiểm thử Gateway không tồn tại', statusCode: 404 };
    }
    return { success: true, data: session };
  }

  // 3. Thiết bị kiểm thử (Devices)
  async registerDevice(dto: DeviceRegistrationDTO) {
    const device = await this.service.registerDevice(dto);
    return {
      success: true,
      message: 'Thiết bị đã đăng ký thành công và liên kết sang Traceability',
      data: device,
    };
  }

  async listDevices(query?: DeviceFilterQuery) {
    const result = await this.service.listDevices(query);
    return {
      success: true,
      data: result.items,
      total: result.total,
    };
  }

  async getDevice(id: string) {
    const device = await this.service.getDeviceById(id);
    if (!device) {
      return { success: false, message: 'Thiết bị không tồn tại', statusCode: 404 };
    }
    return { success: true, data: device };
  }

  // 4. Gói tin (Packets)
  async recordPacket(packetInput: {
    network_id: string;
    raw_payload: string;
    f_port?: number;
    f_cnt?: number;
    direction?: 'uplink' | 'downlink';
    rf_info?: any;
  }) {
    const packet = await this.service.recordPacket(packetInput);
    return {
      success: true,
      data: packet,
    };
  }

  async getPackets(query?: { device_id?: string; network_id?: string; limit?: number; offset?: number }) {
    const result = await this.service.getPackets(query);
    return {
      success: true,
      data: result.items,
      total: result.total,
    };
  }

  // 5. Device Simulation
  async saveSimulationProfile(profile: DeviceSimulationProfile) {
    const saved = await this.service.saveSimulationProfile(profile);
    return {
      success: true,
      message: 'Cấu hình giả lập thiết bị đã được lưu',
      data: saved,
    };
  }

  async listSimulationProfiles() {
    const profiles = await this.service.getSimulationProfiles();
    return {
      success: true,
      data: profiles,
      total: profiles.length,
    };
  }

  async runSimulation(profile: DeviceSimulationProfile) {
    const result = await this.service.simulateDeviceUplink(profile);
    return {
      success: true,
      message: 'Quá trình giả lập uplink hoàn tất',
      data: result,
    };
  }

  async listSimulationResults() {
    const results = await this.service.getSimulationResults();
    return {
      success: true,
      data: results,
      total: results.length,
    };
  }

  // 6. Device Auto Check
  getAutoCheckRules() {
    return {
      success: true,
      data: this.service.getDefaultAutoCheckRules(),
    };
  }

  async evaluateAutoCheck(payload: {
    target: { packet?: any; packet_id?: string; dev_eui?: string; serial_number?: string };
    criteria?: AutoCheckCriteria;
  }) {
    const result = await this.service.evaluateAutoCheck(payload.target, payload.criteria);
    return {
      success: true,
      message: `Đánh giá Auto Check hoàn tất với kết quả: ${result.verdict}`,
      data: result,
    };
  }

  async listAutoCheckEvaluations() {
    const evaluations = await this.service.getAutoCheckEvaluations();
    return {
      success: true,
      data: evaluations,
      total: evaluations.length,
    };
  }
}

