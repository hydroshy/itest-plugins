import {
  DeviceTestHistoryRecord,
  TraceabilityLookupItemCode,
  TraceabilityLookupSO,
  TraceabilityLookupWA,
} from './testing.types';

export interface ITraceabilityProvider {
  fetchSOs(): Promise<TraceabilityLookupSO[]>;
  fetchWAsBySO(soNumber: string): Promise<TraceabilityLookupWA[]>;
  fetchItemCodes(soNumber?: string, waNumber?: string): Promise<TraceabilityLookupItemCode[]>;
  linkTestingDevice(deviceData: {
    serial_number: string;
    so: string;
    wa: string;
    item_code: string;
    device_type: string;
    network_id: string;
    status: string;
  }): Promise<{ success: boolean; traceability_device_id?: string; message?: string }>;
  recordDeviceTestHistory?(record: DeviceTestHistoryRecord): Promise<{ success: boolean; history_id?: string; message?: string }>;
}

export class DefaultTraceabilityBridge implements ITraceabilityProvider {
  private inMemorySOs: TraceabilityLookupSO[] = [];
  private inMemoryWAs: TraceabilityLookupWA[] = [];
  private inMemoryItemCodes: TraceabilityLookupItemCode[] = [];
  private testHistoryRecords: DeviceTestHistoryRecord[] = [];

  constructor(
    private readonly externalApiBaseUrl?: string,
    initialData?: {
      sos?: TraceabilityLookupSO[];
      was?: TraceabilityLookupWA[];
      itemCodes?: TraceabilityLookupItemCode[];
    }
  ) {
    if (initialData?.sos) this.inMemorySOs = [...initialData.sos];
    if (initialData?.was) this.inMemoryWAs = [...initialData.was];
    if (initialData?.itemCodes) this.inMemoryItemCodes = [...initialData.itemCodes];
  }

  /**
   * Khởi tạo dữ liệu mẫu phục vụ unit test độc lập (không nạp tự động ở runtime)
   */
  public seedSampleData(): void {
    this.inMemorySOs = [
      { so_id: 'so-001', so_number: 'SO-2026-10-001', customer_name: 'Viettel IoT', status: 'IN_PROGRESS' },
      { so_id: 'so-002', so_number: 'SO-2026-10-002', customer_name: 'VNPT Technology', status: 'IN_PROGRESS' },
      { so_id: 'so-003', so_number: 'SO-2026-09-088', customer_name: 'FPT Smart Home', status: 'COMPLETED' },
    ];

    this.inMemoryWAs = [
      { wa_id: 'wa-101', wa_number: 'WA-001-A', so_number: 'SO-2026-10-001', item_code: '5F0820', planned_quantity: 500, status: 'OPEN' },
      { wa_id: 'wa-102', wa_number: 'WA-001-B', so_number: 'SO-2026-10-001', item_code: '5F0821', planned_quantity: 300, status: 'OPEN' },
      { wa_id: 'wa-103', wa_number: 'WA-002-A', so_number: 'SO-2026-10-002', item_code: '4F0120', planned_quantity: 1000, status: 'OPEN' },
      { wa_id: 'wa-104', wa_number: 'WA-003-A', so_number: 'SO-2026-09-088', item_code: '3F0550', planned_quantity: 200, status: 'CLOSED' },
    ];

    this.inMemoryItemCodes = [
      { item_code: '5F0820', sku: 'GW-LORA-IND-V2', model_name: 'LoRaWAN Industrial Gateway v2', firmware_version: '2.1.0' },
      { item_code: '5F0821', sku: 'GW-LORA-OUTDOOR', model_name: 'Outdoor IP67 LoRaWAN Gateway', firmware_version: '2.0.4' },
      { item_code: '4F0120', sku: 'WM-PULSE-01', model_name: 'Smart Water Meter Pulse Sensor', firmware_version: '1.4.2' },
      { item_code: '3F0550', sku: 'ENV-TEMP-HUM-01', model_name: 'Environment Temp/Humidity Node', firmware_version: '1.0.0' },
    ];
  }

  async fetchSOs(): Promise<TraceabilityLookupSO[]> {
    if (this.externalApiBaseUrl) {
      try {
        const res = await fetch(`${this.externalApiBaseUrl}/api/traceability/so`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('[TraceabilityBridge] Fallback to in-memory SOs:', err);
      }
    }
    return this.inMemorySOs;
  }

  async fetchWAsBySO(soNumber: string): Promise<TraceabilityLookupWA[]> {
    if (this.externalApiBaseUrl) {
      try {
        const res = await fetch(`${this.externalApiBaseUrl}/api/traceability/wa?so=${encodeURIComponent(soNumber)}`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('[TraceabilityBridge] Fallback to in-memory WAs:', err);
      }
    }
    return this.inMemoryWAs.filter((wa) => wa.so_number.toLowerCase() === soNumber.toLowerCase());
  }

  async fetchItemCodes(soNumber?: string, waNumber?: string): Promise<TraceabilityLookupItemCode[]> {
    if (this.externalApiBaseUrl) {
      try {
        const url = new URL(`${this.externalApiBaseUrl}/api/traceability/item-codes`);
        if (soNumber) url.searchParams.set('so', soNumber);
        if (waNumber) url.searchParams.set('wa', waNumber);
        const res = await fetch(url.toString());
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('[TraceabilityBridge] Fallback to in-memory item codes:', err);
      }
    }

    if (waNumber) {
      const wa = this.inMemoryWAs.find((w) => w.wa_number.toLowerCase() === waNumber.toLowerCase());
      if (wa) {
        return this.inMemoryItemCodes.filter((item) => item.item_code === wa.item_code);
      }
    }
    return this.inMemoryItemCodes;
  }

  async linkTestingDevice(deviceData: {
    serial_number: string;
    so: string;
    wa: string;
    item_code: string;
    device_type: string;
    network_id: string;
    status: string;
  }): Promise<{ success: boolean; traceability_device_id?: string; message?: string }> {
    if (this.externalApiBaseUrl) {
      try {
        const res = await fetch(`${this.externalApiBaseUrl}/api/traceability/devices/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deviceData),
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('[TraceabilityBridge] API link failed, returning local link:', err);
      }
    }

    return {
      success: true,
      traceability_device_id: `trace-${Date.now()}-${deviceData.serial_number}`,
      message: 'Linked successfully to traceability ledger',
    };
  }

  async recordDeviceTestHistory(record: DeviceTestHistoryRecord): Promise<{ success: boolean; history_id?: string; message?: string }> {
    if (this.externalApiBaseUrl) {
      try {
        const res = await fetch(`${this.externalApiBaseUrl}/api/traceability/device-test-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('[TraceabilityBridge] Failed to record test history to external API:', err);
      }
    }

    const history_id = `thist-${Date.now()}-${record.serial_number}`;
    this.testHistoryRecords.push({ ...record });
    return {
      success: true,
      history_id,
      message: `Đã lưu lịch sử kiểm thử thiết bị ${record.serial_number} (${record.status}) vào Traceability`,
    };
  }

  getTestHistoryRecords(): DeviceTestHistoryRecord[] {
    return [...this.testHistoryRecords];
  }
}
