export type TestingDeviceType =
  | 'lorawan_node'
  | 'lorawan_gateway'
  | 'modbus_rtu'
  | 'modbus_tcp'
  | 'serial'
  | 'other';

export type TestingDeviceStatus =
  | 'REGISTERED'
  | 'IN_TEST'
  | 'PASSED'
  | 'FAILED'
  | 'REJECTED';

export type PacketDirection = 'uplink' | 'downlink';

export type PacketType =
  | 'JOIN_REQUEST'
  | 'JOIN_ACCEPT'
  | 'UNCONFIRMED_DATA_UP'
  | 'CONFIRMED_DATA_UP'
  | 'DATA_DOWN'
  | 'RAW_FRAME';

export interface TestingDevice {
  id: string;
  serial_number: string;
  device_name: string;
  device_type: TestingDeviceType;
  network_type: string;
  network_id: string;
  plugin_id?: string;
  so: string;
  so_number?: string;
  so_id?: string;
  wa: string;
  wa_number?: string;
  wa_id?: string;
  item_code: string;
  status: TestingDeviceStatus;
  network_config?: Record<string, any>;
  metadata?: Record<string, any>;
  last_seen_at?: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface DeviceRegistrationDTO {
  serial_number: string;
  so: string; // Số SO hoặc tương đương so_number
  so_number?: string;
  so_id?: string;
  wa: string; // Số WA hoặc tương đương wa_number
  wa_number?: string;
  wa_id?: string;
  item_code: string;
  device_name?: string;
  device_type: TestingDeviceType;
  network_type?: string;
  network_id: string;
  plugin_id?: string;
  network_config?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface DevicePacketDTO {
  id?: string;
  device_id?: string;
  network_id: string;
  raw_payload: string;
  decoded_payload?: Record<string, any>;
  rf_info?: {
    rssi?: number;
    snr?: number;
    frequency?: number;
    gateway_id?: string;
    channel?: number;
    sf?: number;
    bw?: number;
  };
  f_cnt?: number;
  f_port?: number;
  direction: PacketDirection;
  packet_type?: PacketType;
  received_at?: Date | string;
}

export interface TraceabilityLookupSO {
  so_id: string;
  so_number: string;
  customer_name?: string;
  order_date?: string;
  status?: string;
}

export interface TraceabilityLookupWA {
  wa_id: string;
  wa_number: string;
  so_number: string;
  item_code: string;
  planned_quantity?: number;
  status?: string;
}

export interface TraceabilityLookupItemCode {
  item_code: string;
  sku?: string;
  model_name?: string;
  description?: string;
  firmware_version?: string;
}

export interface DeviceFilterQuery {
  so?: string;
  wa?: string;
  item_code?: string;
  status?: TestingDeviceStatus;
  device_type?: TestingDeviceType;
  network_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export type InternetTestType = 'ethernet' | 'lte_4g' | 'Ethernet test' | '4G Test';

export interface GatewayRawConfigInfo {
  serial_number: string;
  item_code: string;
  sku: string;
  gateway_notes?: string;
  lte_module_imei?: string;
  lte_module_serial_number?: string;
  ethernet_is_enable?: string;
  ethernet_metric?: number | string;
  lte_is_enable?: string;
  lte_metric?: number | string;
  wifi_is_enable?: string;
  hardware_version?: string;
  firmware_version?: string;
  mechanical_version?: string;
  eui: string;
  wifi_mac_address?: string;
  lorawan_frequency_plan?: string;
  eth_mac_address?: string;
  network_server_host?: string;
  ns_uplink_port?: string;
  ns_downlink_port?: string;
  gps_tty_device_path?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  time_zone?: string;
  [key: string]: any;
}

export interface GatewayConfigInfoResponse {
  status: number;
  message: string;
  'gateway-config-info': GatewayRawConfigInfo;
}

export interface ChangeGatewayConfigBody {
  ethernet_metric: string;
  lte_metric: string;
  wifi_metric: string;
  is_reboot: string;
  lorawan_frequency_plan: string;
  network_server_host: string;
  ns_uplink_port: string;
  ns_downlink_port: string;
  [key: string]: any;
}

export interface ChangeGatewayConfigRequest {
  gatewayConfig: ChangeGatewayConfigBody;
}

export interface GatewayRegistrationSessionDTO {
  so: string;
  wa: string;
  network_server_id: string;
  network_server_host?: string;
  gateway_ip: string;
  internet_test_type: InternetTestType;
  region_test: string;
  confirmed_serial_number: string;
  gateway_info?: GatewayRawConfigInfo;
  metadata?: Record<string, any>;
}

export interface GatewayTestSession {
  id: string;
  session_code: string;
  gateway_ip: string;
  serial_number: string;
  eui: string;
  item_code: string;
  sku: string;
  firmware_version?: string;
  hardware_version?: string;
  mechanical_version?: string;
  lte_module_serial_number?: string;
  lte_module_imei?: string;
  so: string;
  wa: string;
  network_server_id: string;
  internet_test_type: string;
  region_test: string;
  status: 'CONFIGURING' | 'REGISTERED' | 'IN_TEST' | 'PASSED' | 'FAILED';
  gateway_config?: GatewayRawConfigInfo;
  packet_forwarder_config?: ChangeGatewayConfigBody;
  created_at: Date | string;
  updated_at: Date | string;
}

