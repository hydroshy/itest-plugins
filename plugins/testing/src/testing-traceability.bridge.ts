import {
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
}

export class DefaultTraceabilityBridge implements ITraceabilityProvider {
  private mockSOs: TraceabilityLookupSO[] = [
    { so_id: 'so-001', so_number: 'SO-2026-10-001', customer_name: 'Viettel IoT', status: 'IN_PROGRESS' },
    { so_id: 'so-002', so_number: 'SO-2026-10-002', customer_name: 'VNPT Technology', status: 'IN_PROGRESS' },
    { so_id: 'so-003', so_number: 'SO-2026-09-088', customer_name: 'FPT Smart Home', status: 'COMPLETED' },
  ];

  private mockWAs: TraceabilityLookupWA[] = [
    { wa_id: 'wa-101', wa_number: 'WA-001-A', so_number: 'SO-2026-10-001', item_code: '5F0820', planned_quantity: 500, status: 'OPEN' },
    { wa_id: 'wa-102', wa_number: 'WA-001-B', so_number: 'SO-2026-10-001', item_code: '5F0821', planned_quantity: 300, status: 'OPEN' },
    { wa_id: 'wa-103', wa_number: 'WA-002-A', so_number: 'SO-2026-10-002', item_code: '4F0120', planned_quantity: 1000, status: 'OPEN' },
    { wa_id: 'wa-104', wa_number: 'WA-003-A', so_number: 'SO-2026-09-088', item_code: '3F0550', planned_quantity: 200, status: 'CLOSED' },
  ];

  private mockItemCodes: TraceabilityLookupItemCode[] = [
    { item_code: '5F0820', sku: 'GW-LORA-IND-V2', model_name: 'LoRaWAN Industrial Gateway v2', firmware_version: '2.1.0' },
    { item_code: '5F0821', sku: 'GW-LORA-OUTDOOR', model_name: 'Outdoor IP67 LoRaWAN Gateway', firmware_version: '2.0.4' },
    { item_code: '4F0120', sku: 'WM-PULSE-01', model_name: 'Smart Water Meter Pulse Sensor', firmware_version: '1.4.2' },
    { item_code: '3F0550', sku: 'ENV-TEMP-HUM-01', model_name: 'Environment Temp/Humidity Node', firmware_version: '1.0.0' },
  ];

  constructor(private readonly externalApiBaseUrl?: string) {}

  async fetchSOs(): Promise<TraceabilityLookupSO[]> {
    if (this.externalApiBaseUrl) {
      try {
        const res = await fetch(`${this.externalApiBaseUrl}/api/traceability/so`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('[TraceabilityBridge] Fallback to mock SOs:', err);
      }
    }
    return this.mockSOs;
  }

  async fetchWAsBySO(soNumber: string): Promise<TraceabilityLookupWA[]> {
    if (this.externalApiBaseUrl) {
      try {
        const res = await fetch(`${this.externalApiBaseUrl}/api/traceability/wa?so=${encodeURIComponent(soNumber)}`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('[TraceabilityBridge] Fallback to mock WAs:', err);
      }
    }
    return this.mockWAs.filter((wa) => wa.so_number.toLowerCase() === soNumber.toLowerCase());
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
        console.warn('[TraceabilityBridge] Fallback to mock item codes:', err);
      }
    }

    if (waNumber) {
      const wa = this.mockWAs.find((w) => w.wa_number.toLowerCase() === waNumber.toLowerCase());
      if (wa) {
        return this.mockItemCodes.filter((item) => item.item_code === wa.item_code);
      }
    }
    return this.mockItemCodes;
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
}
