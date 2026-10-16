import { UnifiedDevice, DeviceDriver } from '@iot-platform/plugin-sdk';
import { IEventBus, globalEventBus } from '@iot-platform/event-bus';

export interface IDeviceRegistry {
  registerDevice(device: UnifiedDevice): Promise<UnifiedDevice>;
  updateDevice(id: string, updates: Partial<UnifiedDevice>): Promise<UnifiedDevice | null>;
  getDevice(id: string): Promise<UnifiedDevice | null>;
  listDevices(filter?: { tenantId?: string; protocolType?: string; status?: string }): Promise<UnifiedDevice[]>;
  deleteDevice(id: string): Promise<boolean>;
  registerDriver(driver: DeviceDriver): void;
  getDriver(protocolType: string, model?: string): DeviceDriver | undefined;
}

export class InMemoryDeviceRegistry implements IDeviceRegistry {
  private readonly devices = new Map<string, UnifiedDevice>();
  private readonly drivers: DeviceDriver[] = [];

  constructor(private readonly eventBus: IEventBus = globalEventBus) {}

  async registerDevice(device: UnifiedDevice): Promise<UnifiedDevice> {
    this.devices.set(device.id, { ...device });
    this.eventBus.emit('device:registered', device);
    return device;
  }

  async updateDevice(id: string, updates: Partial<UnifiedDevice>): Promise<UnifiedDevice | null> {
    const existing = this.devices.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.devices.set(id, updated);
    this.eventBus.emit('device:updated', updated);
    return updated;
  }

  async getDevice(id: string): Promise<UnifiedDevice | null> {
    return this.devices.get(id) || null;
  }

  async listDevices(filter?: { tenantId?: string; protocolType?: string; status?: string }): Promise<UnifiedDevice[]> {
    let list = Array.from(this.devices.values());
    if (filter?.tenantId) {
      list = list.filter((d) => d.tenantId === filter.tenantId);
    }
    if (filter?.protocolType) {
      list = list.filter((d) => d.protocolType === filter.protocolType);
    }
    if (filter?.status) {
      list = list.filter((d) => d.status === filter.status);
    }
    return list;
  }

  async deleteDevice(id: string): Promise<boolean> {
    const dev = this.devices.get(id);
    if (!dev) return false;
    this.devices.delete(id);
    this.eventBus.emit('device:deleted', { id, tenantId: dev.tenantId });
    return true;
  }

  registerDriver(driver: DeviceDriver): void {
    const idx = this.drivers.findIndex((d) => d.driverId === driver.driverId);
    if (idx >= 0) {
      this.drivers[idx] = driver;
    } else {
      this.drivers.push(driver);
    }
    this.eventBus.emit('driver:registered', { driverId: driver.driverId, protocol: driver.protocolType });
  }

  getDriver(protocolType: string, model?: string): DeviceDriver | undefined {
    return this.drivers.find((d) => {
      if (d.protocolType !== protocolType) return false;
      if (model && d.supportedModels && d.supportedModels.length > 0) {
        return d.supportedModels.includes(model) || d.supportedModels.includes('*');
      }
      return true;
    });
  }
}

export const globalDeviceRegistry = new InMemoryDeviceRegistry();
