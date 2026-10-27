import { DeviceService } from './device.service';
import { DeviceFilterQuery, DeviceRegistrationDTO, DeviceStatusUpdateDTO } from './device.types';

export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  async getSOs() {
    try {
      const data = await this.deviceService.getAvailableSOs();
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getWAs(soNumber: string) {
    try {
      const data = await this.deviceService.getAvailableWAs(soNumber);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getItemCodes(soNumber?: string, waNumber?: string) {
    try {
      const data = await this.deviceService.getAvailableItemCodes(soNumber, waNumber);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async registerDevice(dto: DeviceRegistrationDTO) {
    try {
      const device = await this.deviceService.registerDevice(dto);
      return { success: true, data: device, message: 'Device registered successfully' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getDevices(query?: DeviceFilterQuery) {
    try {
      const result = await this.deviceService.getDevices(query);
      return { success: true, data: result.items, total: result.total };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getDeviceById(id: string) {
    try {
      const device = await this.deviceService.getDeviceById(id);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }
      return { success: true, data: device };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getDeviceBySerial(serialNumber: string) {
    try {
      const device = await this.deviceService.getDeviceBySerial(serialNumber);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }
      return { success: true, data: device };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async updateDeviceStatus(id: string, dto: DeviceStatusUpdateDTO) {
    try {
      const device = await this.deviceService.updateDeviceStatus(id, dto);
      return { success: true, data: device, message: 'Status updated successfully' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async deleteDevice(id: string) {
    try {
      const deleted = await this.deviceService.deleteDevice(id);
      return { success: deleted, message: deleted ? 'Deleted' : 'Not found' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
