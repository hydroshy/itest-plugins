import {
  DeviceFilterQuery,
  DeviceItem,
  DeviceRegistrationDTO,
  DeviceStatus,
  DeviceStatusUpdateDTO,
  TraceabilityLookupItemCode,
  TraceabilityLookupSO,
  TraceabilityLookupWA,
} from './device.types';
import { DefaultTraceabilityBridge, ITraceabilityBridge } from './device-traceability.bridge';

export class DeviceService {
  private devices: Map<string, DeviceItem> = new Map();
  private traceabilityBridge: ITraceabilityBridge;

  constructor(traceabilityBridge?: ITraceabilityBridge) {
    this.traceabilityBridge = traceabilityBridge || new DefaultTraceabilityBridge();
  }

  // --- TRACEABILITY DROPDOWNS ---

  async getAvailableSOs(): Promise<TraceabilityLookupSO[]> {
    return await this.traceabilityBridge.fetchSOs();
  }

  async getAvailableWAs(soNumber: string): Promise<TraceabilityLookupWA[]> {
    if (!soNumber) {
      throw new Error('soNumber is required to lookup Work Orders (WA)');
    }
    return await this.traceabilityBridge.fetchWAsBySO(soNumber);
  }

  async getAvailableItemCodes(soNumber?: string, waNumber?: string): Promise<TraceabilityLookupItemCode[]> {
    return await this.traceabilityBridge.fetchItemCodes(soNumber, waNumber);
  }

  // --- DEVICE CRUD & LIFECYCLE ---

  async registerDevice(dto: DeviceRegistrationDTO): Promise<DeviceItem> {
    const soStr = dto.so_number || dto.so;
    const waStr = dto.wa_number || dto.wa;

    if (!dto.serial_number?.trim()) {
      throw new Error('serial_number is required');
    }
    if (!soStr?.trim()) {
      throw new Error('so_number is required for traceability linkage');
    }

    const cleanSerial = dto.serial_number.trim().toUpperCase();
    const existing = Array.from(this.devices.values()).find(
      (d) => d.serial_number.toUpperCase() === cleanSerial
    );
    if (existing) {
      throw new Error(`Device with serial_number "${cleanSerial}" is already registered (id: ${existing.id})`);
    }

    const id = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const device: DeviceItem = {
      id,
      serial_number: cleanSerial,
      dev_eui: dto.dev_eui?.trim() || cleanSerial,
      network_id: dto.network_id || 'chirpstack-default',
      device_name: dto.device_name || `DEV-${cleanSerial}`,
      device_type: dto.device_type || 'LORA_NODE',
      plugin_id: dto.plugin_id || 'decoder',
      so_id: dto.so_id,
      so_number: soStr.trim(),
      wa_id: dto.wa_id,
      wa_number: waStr ? waStr.trim() : undefined,
      item_code: dto.item_code?.trim(),
      status: DeviceStatus.PENDING,
      metadata: dto.metadata || {},
      created_at: now,
      updated_at: now,
    };

    this.devices.set(id, device);
    return device;
  }

  async getDevices(query?: DeviceFilterQuery): Promise<{ items: DeviceItem[]; total: number }> {
    let list = Array.from(this.devices.values());

    if (query?.so_number) {
      const qSo = query.so_number.toLowerCase();
      list = list.filter((d) => d.so_number?.toLowerCase().includes(qSo));
    }
    if (query?.wa_number) {
      const qWa = query.wa_number.toLowerCase();
      list = list.filter((d) => d.wa_number?.toLowerCase().includes(qWa));
    }
    if (query?.item_code) {
      const qItem = query.item_code.toLowerCase();
      list = list.filter((d) => d.item_code?.toLowerCase().includes(qItem));
    }
    if (query?.status) {
      list = list.filter((d) => d.status === query.status);
    }
    if (query?.search) {
      const s = query.search.toLowerCase();
      list = list.filter(
        (d) =>
          d.serial_number.toLowerCase().includes(s) ||
          d.dev_eui?.toLowerCase().includes(s) ||
          d.device_name?.toLowerCase().includes(s) ||
          d.so_number?.toLowerCase().includes(s)
      );
    }

    const total = list.length;
    const offset = query?.offset || 0;
    const limit = query?.limit || 50;
    const paginated = list.slice(offset, offset + limit);

    return { items: paginated, total };
  }

  async getDeviceById(id: string): Promise<DeviceItem | null> {
    return this.devices.get(id) || null;
  }

  async getDeviceBySerial(serialNumber: string): Promise<DeviceItem | null> {
    const cleanSerial = serialNumber.trim().toUpperCase();
    return Array.from(this.devices.values()).find(
      (d) => d.serial_number.toUpperCase() === cleanSerial || d.dev_eui?.toUpperCase() === cleanSerial
    ) || null;
  }

  async updateDeviceStatus(id: string, dto: DeviceStatusUpdateDTO): Promise<DeviceItem> {
    const device = this.devices.get(id);
    if (!device) {
      throw new Error(`Device ${id} not found`);
    }

    device.status = dto.status;
    device.updated_at = new Date().toISOString();
    if (dto.metadata) {
      device.metadata = { ...(device.metadata || {}), ...dto.metadata };
    }

    this.devices.set(id, device);
    return device;
  }

  async deleteDevice(id: string): Promise<boolean> {
    return this.devices.delete(id);
  }

  // Seed initial test data
  seedInitialDevices(initial: DeviceItem[]): void {
    for (const d of initial) {
      this.devices.set(d.id, d);
    }
  }
}
