import {
  IPluginLifecycle,
  IPluginContext,
  UnifiedDevice,
} from '@iot-platform/plugin-sdk';
import { IDeviceRegistry, globalDeviceRegistry } from '@iot-platform/device-registry';

export class DeviceManagerService {
  constructor(private readonly registry: IDeviceRegistry = globalDeviceRegistry) {}

  async provisionDevice(deviceData: Omit<UnifiedDevice, 'status'>): Promise<UnifiedDevice> {
    const device: UnifiedDevice = {
      ...deviceData,
      status: 'offline',
    };
    return await this.registry.registerDevice(device);
  }

  async getFleetOverview(tenantId?: string) {
    const devices = await this.registry.listDevices(tenantId ? { tenantId } : undefined);
    const total = devices.length;
    const online = devices.filter((d) => d.status === 'online').length;
    const offline = devices.filter((d) => d.status === 'offline').length;
    const error = devices.filter((d) => d.status === 'error').length;

    const byProtocol = devices.reduce<Record<string, number>>((acc, d) => {
      acc[d.protocolType] = (acc[d.protocolType] || 0) + 1;
      return acc;
    }, {});

    return {
      total,
      online,
      offline,
      error,
      byProtocol,
      devices,
    };
  }

  async updateStatus(deviceId: string, status: UnifiedDevice['status']): Promise<UnifiedDevice | null> {
    return await this.registry.updateDevice(deviceId, { status, lastSeen: new Date() });
  }
}

export default class DeviceManagerPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new DeviceManagerService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`Initialized ${context.manifest.name}`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('Device Manager Application Plugin started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('Device Manager Application Plugin stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('Device Manager Application Plugin destroyed.');
  }
}
