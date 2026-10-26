import { TestingService } from './testing.service';
import { DeviceFilterQuery, DeviceRegistrationDTO } from './testing.types';

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

  // 2. Thiết bị kiểm thử (Devices)
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

  // 3. Gói tin (Packets)
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
}
