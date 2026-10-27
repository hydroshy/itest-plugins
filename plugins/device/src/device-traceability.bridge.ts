import {
  TraceabilityLookupItemCode,
  TraceabilityLookupSO,
  TraceabilityLookupWA,
} from './device.types';

export interface ITraceabilityBridge {
  fetchSOs(): Promise<TraceabilityLookupSO[]>;
  fetchWAsBySO(soNumber: string): Promise<TraceabilityLookupWA[]>;
  fetchItemCodes(soNumber?: string, waNumber?: string): Promise<TraceabilityLookupItemCode[]>;
}

export class DefaultTraceabilityBridge implements ITraceabilityBridge {
  private baseApiUrl: string;

  constructor(baseApiUrl?: string) {
    this.baseApiUrl = baseApiUrl || process.env.SYSTEM_API_URL || 'http://localhost:3000/api/v1';
  }

  async fetchSOs(): Promise<TraceabilityLookupSO[]> {
    try {
      const response = await fetch(`${this.baseApiUrl}/traceability/sales-orders?limit=100`);
      if (!response.ok) {
        return this.getMockSOs();
      }
      const data: any = await response.json();
      return (data.items || data || []).map((so: any) => ({
        id: so.id,
        so_number: so.so_number || so.soNumber || so.code,
        customer_name: so.customer_name || so.customerName,
        status: so.status || 'ACTIVE',
      }));
    } catch {
      return this.getMockSOs();
    }
  }

  async fetchWAsBySO(soNumber: string): Promise<TraceabilityLookupWA[]> {
    try {
      const response = await fetch(`${this.baseApiUrl}/traceability/work-authorizations?soNumber=${encodeURIComponent(soNumber)}`);
      if (!response.ok) {
        return this.getMockWAs(soNumber);
      }
      const data: any = await response.json();
      return (data.items || data || []).map((wa: any) => ({
        id: wa.id,
        wa_number: wa.wa_number || wa.waNumber || wa.code,
        so_number: soNumber,
        product_code: wa.product_code || wa.productCode || wa.item_code,
        quantity: wa.quantity || 0,
      }));
    } catch {
      return this.getMockWAs(soNumber);
    }
  }

  async fetchItemCodes(soNumber?: string, waNumber?: string): Promise<TraceabilityLookupItemCode[]> {
    try {
      const params = new URLSearchParams();
      if (soNumber) params.append('soNumber', soNumber);
      if (waNumber) params.append('waNumber', waNumber);

      const response = await fetch(`${this.baseApiUrl}/traceability/item-codes?${params.toString()}`);
      if (!response.ok) {
        return this.getMockItemCodes();
      }
      const data: any = await response.json();
      return (data.items || data || []).map((item: any) => ({
        item_code: item.item_code || item.itemCode || item.code,
        item_name: item.item_name || item.itemName || item.name,
        description: item.description,
      }));
    } catch {
      return this.getMockItemCodes();
    }
  }

  private getMockSOs(): TraceabilityLookupSO[] {
    return [
      { id: 'so-uuid-001', so_number: 'SO-2026-001', customer_name: 'Viettel Telecom', status: 'ACTIVE' },
      { id: 'so-uuid-002', so_number: 'SO-2026-002', customer_name: 'VNPT Technology', status: 'ACTIVE' },
      { id: 'so-uuid-003', so_number: 'SO-2026-003', customer_name: 'MobiFone Global', status: 'COMPLETED' },
    ];
  }

  private getMockWAs(soNumber: string): TraceabilityLookupWA[] {
    return [
      { id: 'wa-uuid-001', wa_number: `${soNumber}-WA01`, so_number: soNumber, product_code: 'LORA-NODE-TH01', quantity: 500 },
      { id: 'wa-uuid-002', wa_number: `${soNumber}-WA02`, so_number: soNumber, product_code: 'SMART-METER-WM02', quantity: 200 },
    ];
  }

  private getMockItemCodes(): TraceabilityLookupItemCode[] {
    return [
      { item_code: 'LORA-NODE-TH01', item_name: 'LoRaWAN Temp & Humidity Sensor', description: 'Cảm biến nhiệt ẩm chuẩn IP67' },
      { item_code: 'SMART-METER-WM02', item_name: 'Smart Water Meter Ultrasonic', description: 'Đồng hồ nước thông minh siêu âm' },
      { item_code: 'GATEWAY-OUTDOOR-GW08', item_name: 'Outdoor LoRaWAN Gateway 8-CH', description: 'Gateway 8 kênh SX1302 ngoài trời' },
    ];
  }
}
