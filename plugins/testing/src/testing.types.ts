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

export type AutoCheckFunctionName =
  | 'CHECKVALUE'
  | 'CHECKAVG'
  | 'CHECKCOUNT'
  | 'FUNC_AVG'
  | 'FUNC_OFFSET_AVGZERO'
  | 'CHECKVALUE_PERIOD'
  | 'CHECKAVG_PERIOD';

export interface AutoCheckFunctionRule {
  function_name: AutoCheckFunctionName;
  target?: 'dut' | 'reference' | 'both';
  parameter_name: string;
  low_threshold?: number;
  high_threshold?: number;
  min_count?: number;
  max_count?: number;
  start_time?: string | number;
  duration?: number;
  standard_zero?: number;
  start_offset_time?: number;
  duration_offset_time?: number;
  period_start_offset_time?: number;
  period_duration_time?: number;
  constant_a?: number;
}

export interface AutoCheckFieldRule {
  field: string;
  count: number;
  min?: number;
  max?: number;
  equals?: string | number | boolean | null;
}

export interface AutoCheckDeviceCriteria {
  item_code: string;
  fw_version: string;
  rules: AutoCheckFieldRule[];
  function_rules?: AutoCheckFunctionRule[];
}

export interface AutoCheckTarget {
  packet?: DevicePacketDTO;
  packet_id?: string;
  dev_eui?: string;
  serial_number?: string;
  packets?: DevicePacketDTO[];
  reference_packets?: DevicePacketDTO[];
  test_start_time?: string | Date | number;
  test_end_time?: string | Date | number;
}

export interface AutoCheckCriteria {
  dut?: AutoCheckDeviceCriteria;
  reference?: AutoCheckDeviceCriteria;
  comparisons?: { dut_field: string; reference_field: string; tolerance: number }[];
  function_rules?: AutoCheckFunctionRule[];
  min_rssi?: number;
  max_rssi?: number;
  min_snr?: number;
  expected_f_port?: number;
  required_fields?: string[];
  field_rules?: Record<string, { min?: number; max?: number; equals?: any }>;
}

export interface AutoCheckRuleResult {
  rule: string;
  function_name?: AutoCheckFunctionName;
  passed: boolean;
  actual: any;
  expected: any;
  message?: string;
  calculated_value?: number | string;
  hex_output?: string;
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
  network_server_id?: string;
  networkServerId?: string;
  application_id?: string;
  applicationId?: string;
  device_profile_id?: string;
  deviceProfileId?: string;
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

export interface DeviceTestingListItem {
  id: string;
  registration_code?: string;
  serial_number: string;
  item_code: string;
  fw_version?: string;
  long_fw?: string;
  hw_version?: string;
  fw_code?: string;
  me_version?: string;
  dev_eui: string;
  app_eui?: string;
  app_key?: string;
  class_mode?: string;
  class?: string;
  region_code?: string;
  region?: string;
  sensor_type?: string;
  created_by?: string;
  application_id?: string;
  device_profile_id?: string;
  network_server_id?: string;
  network_server_name?: string;
  network_server_url?: string;
  connectivity?: string;
  so_number?: string;
  wa_number?: string;
  status?: string;
  message?: string;
  error_detail?: string;
  last_seen_at?: Date | string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface DeviceTestingListFilter {
  userId?: string;
  username?: string;
  isAdmin?: boolean;
  applicationId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface DeleteDeviceTestingDTO {
  id: string;
  dev_eui?: string;
  application_id?: string;
  network_server_id?: string;
  delete_from_chirpstack?: boolean;
  user?: {
    id?: string;
    username?: string;
    isAdmin?: boolean;
  };
}

// --- TEST BATCH TYPES ---

export type TestBatchStatus = 'DRAFT' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface TestBatch {
  id: string;
  batch_code: string;
  name: string;
  item_code: string;
  fw_version: string; // Long FW version / LONG_FW
  long_fw?: string;
  simulation_flow_id: string;
  simulation_flow_name?: string;
  simulation_duration_seconds?: number;
  autocheck_criteria_id?: string;
  autocheck_criteria_name?: string;
  max_devices: number;
  description?: string;
  created_by?: string;
  status: TestBatchStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateTestBatchDTO {
  batch_code?: string;
  batchCode?: string;
  name: string;
  item_code: string;
  itemCode?: string;
  fw_version: string;
  fwVersion?: string;
  long_fw?: string;
  longFw?: string;
  simulation_flow_id: string;
  simulationFlowId?: string;
  simulation_flow_name?: string;
  simulationFlowName?: string;
  simulation_duration_seconds?: number;
  simulationDurationSeconds?: number;
  autocheck_criteria_id?: string;
  autocheckCriteriaId?: string;
  autocheck_criteria_name?: string;
  autocheckCriteriaName?: string;
  max_devices: number;
  maxDevices?: number;
  description?: string;
  created_by?: string;
  createdBy?: string;
}

export interface ReferenceDeviceItem {
  id: string;
  serial_number: string;
  dev_eui: string;
  item_code: string;
  fw_version?: string;
  name?: string;
  description?: string;
  status?: 'ACTIVE' | 'CALIBRATED' | 'STANDBY';
  baseline_metrics?: {
    rssi?: number;
    snr?: number;
    payload_sample?: string;
    decoded_sample?: Record<string, any>;
  };
}

export interface TestBatchDeviceMappingItem {
  test_device_id: string;
  test_device_serial?: string;
  test_device_eui?: string;
  reference_device_id?: string;
  reference_device_serial?: string;
  reference_device_eui?: string;
  so_number?: string;
  wa_number?: string;
}

export interface StartTestBatchExecutionDTO {
  batch_id: string;
  batchId?: string;
  device_mappings?: TestBatchDeviceMappingItem[];
  deviceMappings?: TestBatchDeviceMappingItem[];
  simulation_flow_id?: string;
  simulationFlowId?: string;
  duration_seconds?: number;
  timeout_seconds?: number;
  started_by?: string;
  tested_by?: string;
  testedBy?: string;
  requires_reference_device?: boolean;
  requiresReferenceDevice?: boolean;
}

export interface DeviceTestHistoryRecord {
  serial_number: string;
  dev_eui?: string;
  item_code: string;
  fw_version: string;
  batch_id: string;
  reference_device_id?: string;
  status: 'PASSED' | 'FAILED';
  started_at: string;
  completed_at: string;
  duration_seconds?: number;
  so_number?: string;
  wa_number?: string;
  tested_by?: string;
  test_person?: string;
  metrics?: Record<string, any>;
  notes?: string;
}

export interface TestBatchDeviceResult {
  test_device_id: string;
  test_device_serial: string;
  test_device_eui: string;
  reference_device_id?: string;
  reference_device_serial?: string;
  reference_device_eui?: string;
  so_number?: string;
  wa_number?: string;
  tested_by?: string;
  status: 'PENDING' | 'TESTING' | 'PASSED' | 'FAILED';
  score?: number;
  auto_check_passed?: boolean;
  started_at?: string;
  completed_at?: string;
  uplink_log_count?: number;
  trace_synced?: boolean;
  trace_record_id?: string;
  comparison_metrics?: {
    rssi_diff?: number;
    snr_diff?: number;
    payload_match?: boolean;
    packet_loss_rate?: number;
  };
  log?: string[];
  message?: string;
}

export interface TestBatchExecution {
  execution_id: string;
  batch_id: string;
  batch_name?: string;
  item_code: string;
  fw_version: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  current_step?: string;
  elapsed_seconds: number;
  total_duration_seconds: number;
  remaining_seconds: number;
  total_devices: number;
  passed_devices: number;
  failed_devices: number;
  devices: TestBatchDeviceResult[];
  started_at: string;
  completed_at?: string;
  reference_start_timestamp?: number;
  trace_sync_status?: 'PENDING' | 'SYNCED' | 'FAILED';
}

export interface AvailableDevicesForBatchFilter {
  item_code: string;
  itemCode?: string;
  fw_version?: string;
  fwVersion?: string;
  long_fw?: string;
  longFw?: string;
  search?: string;
  limit?: number;
}

export interface ChirpStackHttpUplinkDTO {
  deduplicationId?: string;
  time?: string;
  deviceInfo?: {
    tenantId?: string;
    tenantName?: string;
    applicationId?: string;
    applicationName?: string;
    deviceProfileId?: string;
    deviceProfileName?: string;
    deviceName?: string;
    devEui?: string;
    tags?: Record<string, any>;
  };
  devAddr?: string;
  adr?: boolean;
  dr?: number;
  fCnt?: number;
  fPort?: number;
  confirmed?: boolean;
  data?: string; // base64
  rxInfo?: Array<{
    gatewayId?: string;
    uplinkId?: number;
    gwTime?: string;
    nsTime?: string;
    rssi?: number;
    snr?: number;
    loRaSNR?: number;
    channel?: number;
    location?: Record<string, any>;
    context?: string;
  }>;
  txInfo?: {
    frequency?: number;
    modulation?: {
      lora?: {
        bandwidth?: number;
        spreadingFactor?: number;
        codeRate?: string;
      };
    };
    dataRate?: {
      spreadFactor?: number;
      bandwidth?: number;
    };
  };
  [key: string]: any;
}

export interface StandardDevicePayloadDTO {
  dev_eui: string;
  device_name?: string;
  application_id?: string;
  f_cnt: number;
  f_port: number;
  rssi: number;
  snr: number;
  sf: number;
  frequency: number;
  raw_payload: string; // Uppercase Hex string
  raw_payload_base64?: string;
  decoded_payload: Record<string, any>;
  received_at: Date | string;
  item_code?: string;
  fw_code?: string;
  fw_version?: string;
  long_fw?: string;
}

export interface ChirpStackHttpIntegrationSetupDTO {
  application_id: string;
  network_server_url: string;
  api_token: string;
  webhook_endpoint_url: string;
  headers?: Record<string, string>;
}




