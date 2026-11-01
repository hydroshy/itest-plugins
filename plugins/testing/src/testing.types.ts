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

export interface DeviceSimulationProfile {
  id?: string;
  name?: string;
  dev_eui: string;
  app_eui?: string;
  app_key?: string;
  serial_number?: string;
  so_number?: string;
  wa_number?: string;
  item_code?: string;
  region?: string;
  class_type?: 'A' | 'B' | 'C';
  packet_type?: PacketType;
  f_port?: number;
  f_cnt?: number;
  payload_hex?: string;
  decoded_payload?: Record<string, any>;
  interval_ms?: number;
  burst_count?: number;
  rf_info?: {
    rssi?: number;
    snr?: number;
    frequency?: number;
    gateway_id?: string;
    channel?: number;
    sf?: number;
    bw?: number;
  };
}

export interface DeviceSimulationResult {
  simulation_id: string;
  dev_eui: string;
  serial_number?: string;
  status: 'completed' | 'running' | 'stopped';
  packets_generated: DevicePacketDTO[];
  started_at: Date | string;
  completed_at?: Date | string;
}

export interface AutoCheckCriteria {
  min_rssi?: number;
  max_rssi?: number;
  min_snr?: number;
  expected_f_port?: number;
  required_fields?: string[];
  field_rules?: Record<string, { min?: number; max?: number; equals?: any }>;
}

export interface AutoCheckRuleResult {
  rule: string;
  passed: boolean;
  actual: any;
  expected: any;
  message?: string;
}

export interface AutoCheckEvaluation {
  evaluation_id: string;
  serial_number?: string;
  network_id?: string;
  verdict: 'PASS' | 'FAIL';
  total_rules: number;
  passed_rules: number;
  failed_rules: number;
  rule_results: AutoCheckRuleResult[];
  evaluated_at: Date | string;
  packet_summary?: {
    raw_payload?: string;
    f_port?: number;
    f_cnt?: number;
    rssi?: number;
    snr?: number;
    decoded?: Record<string, any>;
  };
}

export type DeviceTestSessionStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'EVALUATING'
  | 'PASSED'
  | 'FAILED'
  | 'CANCELLED';

export interface DeviceTestSession {
  id: string;
  session_name: string;
  device_id?: string;
  serial_number: string;
  network_id?: string;
  connectivity?: 'LoRaWAN' | 'Sigfox' | string;
  item_code?: string;
  sku?: string;
  profile_id?: string;
  flow_blocks?: any[];
  auto_check_criteria?: AutoCheckCriteria;
  status: DeviceTestSessionStatus;
  verdict?: 'PASS' | 'FAIL' | 'PENDING';
  total_packets_sent?: number;
  last_packet_at?: Date | string;
  evaluation?: AutoCheckEvaluation;
  metadata?: Record<string, any>;
  started_at?: Date | string;
  completed_at?: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateDeviceTestDTO {
  session_name?: string;
  sessionName?: string;
  device_id?: string;
  deviceId?: string;
  serial_number: string;
  serialNumber?: string;
  network_id?: string;
  networkId?: string;
  connectivity?: 'LoRaWAN' | 'Sigfox' | string;
  item_code?: string;
  itemCode?: string;
  sku?: string;
  profile_id?: string;
  profileId?: string;
  flow_blocks?: any[];
  flowBlocks?: any[];
  auto_check_criteria?: AutoCheckCriteria;
  autoCheckCriteria?: AutoCheckCriteria;
  metadata?: Record<string, any>;
}


