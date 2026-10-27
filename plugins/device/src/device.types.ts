export enum DeviceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  TESTING = 'TESTING',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  PROVISIONED = 'PROVISIONED',
  PENDING = 'PENDING',
}

export interface DeviceItem {
  id: string;
  serial_number: string;
  dev_eui?: string;
  network_id?: string;
  device_name?: string;
  device_type?: string;
  plugin_id?: string;
  so_id?: string;
  so_number?: string;
  wa_id?: string;
  wa_number?: string;
  item_code?: string;
  status: DeviceStatus | string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DeviceRegistrationDTO {
  serial_number: string;
  dev_eui?: string;
  network_id?: string;
  device_name?: string;
  device_type?: string;
  plugin_id?: string;
  so?: string;
  so_number?: string;
  so_id?: string;
  wa?: string;
  wa_number?: string;
  wa_id?: string;
  item_code?: string;
  metadata?: Record<string, any>;
}

export interface DeviceFilterQuery {
  so_number?: string;
  wa_number?: string;
  item_code?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DeviceStatusUpdateDTO {
  status: DeviceStatus | string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface TraceabilityLookupSO {
  id: string;
  so_number: string;
  customer_name?: string;
  status: string;
}

export interface TraceabilityLookupWA {
  id: string;
  wa_number: string;
  so_number: string;
  product_code?: string;
  quantity?: number;
}

export interface TraceabilityLookupItemCode {
  item_code: string;
  item_name?: string;
  description?: string;
}
