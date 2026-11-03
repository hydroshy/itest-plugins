import { TestingService } from './testing.service';
import {
  AutoCheckCriteria,
  AutoCheckTarget,
  CreateDeviceTestDTO,
  DeviceFilterQuery,
  DeviceRegistrationDTO,
  DeviceSimulationProfile,
  DeviceTestSessionStatus,
  GatewayRegistrationSessionDTO,
  DeviceTestingListItem,
  DeviceTestingListFilter,
  DeleteDeviceTestingDTO,
  CreateTestBatchDTO,
  StartTestBatchExecutionDTO,
  AvailableDevicesForBatchFilter,
  ChirpStackHttpIntegrationSetupDTO,
  ChirpStackHttpUplinkDTO,
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
    target: AutoCheckTarget;
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

  // 7. Create Device Testing Sessions
  async createDeviceTestSession(dto: CreateDeviceTestDTO) {
    try {
      const session = await this.service.createDeviceTestSession(dto);
      return {
        success: true,
        message: 'Tạo phiên kiểm thử thiết bị thành công',
        data: session,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Không thể tạo phiên kiểm thử thiết bị',
        statusCode: 400,
      };
    }
  }

  async listDeviceTestSessions() {
    const sessions = await this.service.getDeviceTestSessions();
    return {
      success: true,
      data: sessions,
      total: sessions.length,
    };
  }

  async getDeviceTestSession(id: string) {
    const session = await this.service.getDeviceTestSessionById(id);
    if (!session) {
      return {
        success: false,
        message: 'Phiên kiểm thử thiết bị không tồn tại',
        statusCode: 404,
      };
    }
    return {
      success: true,
      data: session,
    };
  }

  async updateDeviceTestSessionStatus(id: string, status: DeviceTestSessionStatus) {
    const updated = await this.service.updateDeviceTestSessionStatus(id, status);
    if (!updated) {
      return {
        success: false,
        message: 'Không tìm thấy phiên kiểm thử để cập nhật',
        statusCode: 404,
      };
    }
    return {
      success: true,
      message: `Cập nhật trạng thái phiên test thành công: ${status}`,
      data: updated,
    };
  }

  // 7. Device Testing List & Management
  async getDeviceTestingList(filter: DeviceTestingListFilter) {
    const result = this.service.getDeviceTestingList(filter);
    return {
      success: true,
      data: result.items,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  }

  async deleteDeviceTesting(dto: DeleteDeviceTestingDTO) {
    try {
      const result = this.service.deleteDeviceTestingItem(dto);
      return {
        success: result.success,
        data: result,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Lỗi khi xóa thiết bị kiểm thử',
      };
    }
  }

  // 8. Test Batch & Device Test Batch Management
  async createTestBatch(dto: CreateTestBatchDTO) {
    try {
      const batch = this.service.createTestBatch(dto);
      return {
        success: true,
        message: 'Tạo Test Batch thành công',
        data: batch,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Lỗi khi tạo Test Batch',
      };
    }
  }

  async listTestBatches(filter?: { item_code?: string; fw_version?: string }) {
    const list = this.service.getTestBatches(filter);
    return {
      success: true,
      data: list,
      total: list.length,
    };
  }

  async getTestBatch(id: string) {
    const batch = this.service.getTestBatchById(id);
    if (!batch) {
      return {
        success: false,
        message: `Không tìm thấy Test Batch với ID '${id}'`,
      };
    }
    return {
      success: true,
      data: batch,
    };
  }

  async deleteTestBatch(id: string) {
    const deleted = this.service.deleteTestBatch(id);
    return {
      success: deleted,
      message: deleted ? 'Đã xóa Test Batch' : 'Không tìm thấy Test Batch để xóa',
    };
  }

  async getAvailableDevicesForBatch(filter: AvailableDevicesForBatchFilter) {
    const items = this.service.getAvailableDevicesForBatch(filter);
    return {
      success: true,
      data: items,
      total: items.length,
    };
  }

  async getReferenceDevices(filter?: { item_code?: string }) {
    const refs = this.service.getReferenceDevices(filter);
    return {
      success: true,
      data: refs,
      total: refs.length,
    };
  }

  async startTestBatchExecution(dto: StartTestBatchExecutionDTO) {
    try {
      const exec = this.service.startTestBatchExecution(dto);
      return {
        success: true,
        message: 'Bắt đầu chạy Test Batch thành công',
        data: exec,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Lỗi khi khởi chạy Test Batch',
      };
    }
  }

  async getTestBatchExecution(executionId: string) {
    const exec = this.service.getTestBatchExecution(executionId);
    if (!exec) {
      return {
        success: false,
        message: `Không tìm thấy Execution với ID '${executionId}'`,
      };
    }
    return {
      success: true,
      data: exec,
    };
  }

  async getActiveTestBatchExecution(batchId: string) {
    const exec = this.service.getActiveBatchExecution(batchId);
    if (!exec) {
      return {
        success: false,
        message: `Không có Execution nào đang chạy cho Batch '${batchId}'`,
      };
    }
    return {
      success: true,
      data: exec,
    };
  }

  async updateTestBatchExecutionProgress(
    executionId: string,
    elapsedSeconds: number,
    status?: 'RUNNING' | 'COMPLETED' | 'FAILED'
  ) {
    try {
      const updated = this.service.updateTestBatchExecutionProgress(
        executionId,
        elapsedSeconds,
        status
      );
      return {
        success: true,
        data: updated,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Lỗi cập nhật tiến độ Test Batch',
      };
    }
  }

  // 10. ChirpStack HTTP Integration & Live Device Payload Endpoints
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
  ) {
    try {
      const processed = await this.service.handleChirpStackUplink(payload, decoderBridge);
      return {
        success: true,
        data: processed,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Lỗi xử lý ChirpStack Uplink',
      };
    }
  }

  async getLiveDevicePayloads(query?: { dev_eui?: string; limit?: number }) {
    const list = this.service.getLiveDevicePayloads(query);
    return {
      success: true,
      count: list.length,
      data: list,
    };
  }

  async configureChirpStackHttpIntegration(config: ChirpStackHttpIntegrationSetupDTO) {
    try {
      const result = await this.service.configureChirpStackHttpIntegration(config);
      return {
        success: result.success,
        message: result.message,
        data: result.integration,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Lỗi cấu hình ChirpStack HTTP Integration',
      };
    }
  }
}


