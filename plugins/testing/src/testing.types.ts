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
  | 'CHECKAVG_PERIOD'
  | 'MEASUREMENT_WINDOW'
  | 'CALC_AVERAGE';

export interface AutoCheckFunctionRule {
  function_name: AutoCheckFunctionName;
  target?: 'dut' | 'reference' | 'simulator' | 'both';
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
  // Extensions for Measurement Window and Average
  measurement_window_id?: string;
  metric?: string;
  average_mode?: AverageFunctionMode;
  sample_count?: number;
}

export interface AutoCheckFieldRule {
  field: string;
  count: number;
  min?: number;
  max?: number;
  equals?: string | number | boolean | null;
}

export interface ReferenceDeviceCriteria {
  reference_id?: string;
  reference_name?: string;
  serial_number?: string;
  dev_eui?: string;
  item_code: string;
  fw_version: string;
  fields?: string[];
  rules?: AutoCheckFieldRule[];
  function_rules?: AutoCheckFunctionRule[];
}

export interface MeasurementWindowConfig {
  window_id: string;
  name?: string;
  device_target?: 'dut' | 'reference' | 'simulator';
  device_identity?: string;
  counter_field: string;
  start_seconds?: number;
  end_seconds?: number;
  duration_seconds?: number;
  min_packet_count?: number;
  max_packet_count?: number;
}

export interface MeasurementWindowResult {
  window_id: string;
  name?: string;
  device_target: 'dut' | 'reference' | 'simulator';
  device_identity?: string;
  counter_field: string;
  start_counter: number;
  end_counter: number;
  window_packet_count: number;
  actual_packet_count: number;
  counter_reset_detected: boolean;
  passed: boolean;
  message?: string;
}

export type AverageFunctionMode = 'SAMPLE_COUNT' | 'TIME_WINDOW' | 'MEASUREMENT_WINDOW';

export interface AverageFunctionConfig {
  rule_id: string;
  name?: string;
  target: 'dut' | 'reference' | 'simulator';
  device_identity?: string;
  metric: string;
  mode: AverageFunctionMode;
  sample_count?: number;
  start_seconds?: number;
  end_seconds?: number;
  duration_seconds?: number;
  measurement_window_id?: string;
  min_samples_required?: number;
  timeout_seconds?: number;
  deduplicate_uplinks?: boolean;
  low_threshold?: number;
  high_threshold?: number;
}

export interface AverageFunctionResult {
  rule_id?: string;
  value: number | null;
  sample_count: number;
  device_identity: string;
  device_role: 'dut' | 'reference' | 'simulator';
  metric: string;
  measurement_ref?: string;
  status: 'SUCCESS' | 'NO_DATA' | 'INSUFFICIENT_SAMPLES' | 'TIMEOUT' | 'INVALID_DATA';
  passed: boolean;
  message?: string;
}

export interface UnifiedTestProfile {
  id?: string;
  name: string;
  simu_id?: string;
  autocheck_id?: string;
  description?: string;
  item_code?: string;
  fw_version?: string;
  dut_fields?: string[];
  reference_devices?: ReferenceDeviceCriteria[];
  flow_blocks?: any[];
  flow_duration_seconds?: number;
  auto_check_criteria?: AutoCheckCriteria;
  created_by?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
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
  simulator_packets?: DevicePacketDTO[];
  multi_reference_packets?: Record<string, DevicePacketDTO[]>;
  test_start_time?: string | Date | number;
  test_end_time?: string | Date | number;
}

export interface AutoCheckCriteria {
  dut?: AutoCheckDeviceCriteria;
  reference?: AutoCheckDeviceCriteria;
  references?: ReferenceDeviceCriteria[];
  simulator?: {
    device_id?: string;
    serial_number?: string;
    dev_eui?: string;
    item_code?: string;
    fw_version?: string;
  };
  comparisons?: { dut_field: string; reference_field: string; tolerance: number; reference_id?: string }[];
  function_rules?: AutoCheckFunctionRule[];
  measurement_windows?: MeasurementWindowConfig[];
  average_rules?: AverageFunctionConfig[];
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
  measurement_windows?: MeasurementWindowResult[];
  average_results?: AverageFunctionResult[];
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

// ============================================================================
// SIMULATION FLOW FUNCTION BLOCKS (3 Standard Functions: Downlink, Clear, Delay)
// ============================================================================

export type SimulationFunctionType =
  | 'downlink'
  | 'clear_downlink'
  | 'delay'
  | 'wait_until_offset'
  | 'start_measurement'
  | 'stop_measurement'
  | 'average'
  | 'calculate_linear'
  | 'convert_to_hex'
  | 'device_auto_check';

export type SimulationTargetDevice = 'DUT' | 'REF' | 'SIMULATOR' | string;

export interface BaseSimulationBlock {
  id?: string;
  step?: number;
  name?: string;
  functionType: SimulationFunctionType;
}

export interface DownlinkSimulationBlock extends BaseSimulationBlock {
  functionType: 'downlink';
  targetDevice: SimulationTargetDevice;
  fPort: number; // default 1
  payloadHex: string; // supports hex literal or variable template {{var}}
  isConfirmed?: boolean;
}

export interface ClearDownlinkSimulationBlock extends BaseSimulationBlock {
  functionType: 'clear_downlink'; // FlushQueue on ChirpStack
  targetDevice: SimulationTargetDevice;
}

export interface DelaySimulationBlock extends BaseSimulationBlock {
  functionType: 'delay';
  delaySeconds: number; // Duration of delay in seconds
}

export interface WaitUntilOffsetSimulationBlock extends BaseSimulationBlock {
  functionType: 'wait_until_offset';
  targetOffsetSeconds: number; // Mốc thời gian tương đối tính từ Simulation Start
}

export interface StartMeasurementSimulationBlock extends BaseSimulationBlock {
  functionType: 'start_measurement';
  windowId: string;
  targetDevice?: SimulationTargetDevice;
  metric?: string;
  counterField?: string;
}

export interface StopMeasurementSimulationBlock extends BaseSimulationBlock {
  functionType: 'stop_measurement';
  windowId: string;
}

export interface AverageSimulationBlock extends BaseSimulationBlock {
  functionType: 'average';
  windowId: string;
  targetDevice?: SimulationTargetDevice;
  metric: string;
  outputVar: string;
  minSamples?: number;
  deduplicate?: boolean;
}

export interface CalculateLinearSimulationBlock extends BaseSimulationBlock {
  functionType: 'calculate_linear';
  point1: { x: string | number; y: number };
  point2: { x: string | number; y: number };
  outputVarA?: string;
  outputVarB?: string;
  outputPayloadVar?: string;
  encoding?: 'float32_be' | 'float32_le' | 'int16' | 'raw_hex';
  minDeltaX?: number;
}

export interface ConvertToHexSimulationBlock extends BaseSimulationBlock {
  functionType: 'convert_to_hex';
  sourceVar: string;
  dataType?: 'float32_be' | 'float32_le' | 'int16' | 'int32' | 'uint16' | 'uint32' | 'raw_hex';
  outputVar: string;
}

export interface DeviceAutoCheckSimulationBlock extends BaseSimulationBlock {
  functionType: 'device_auto_check';
  criteriaId?: string;
}

export type SimulationFlowBlock =
  | DownlinkSimulationBlock
  | ClearDownlinkSimulationBlock
  | DelaySimulationBlock
  | WaitUntilOffsetSimulationBlock
  | StartMeasurementSimulationBlock
  | StopMeasurementSimulationBlock
  | AverageSimulationBlock
  | CalculateLinearSimulationBlock
  | ConvertToHexSimulationBlock
  | DeviceAutoCheckSimulationBlock;

/**
 * Calculates linear calibration coefficients:
 * y = a*x + b
 * a = (y2 - y1) / (x2 - x1)
 * b = y1 - a*x1
 */
export function calculateLinearCoefficients(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  minDeltaX = 0.0001
): { a: number; b: number; aHex: string; bHex: string; valid: boolean; error?: string } {
  const deltaX = p2.x - p1.x;
  if (Math.abs(deltaX) < minDeltaX) {
    return {
      a: 0,
      b: 0,
      aHex: '00000000',
      bHex: '00000000',
      valid: false,
      error: `Chênh lệch giá trị raw deltaX=${deltaX} quá nhỏ (< ${minDeltaX}), không thể chia cho 0`,
    };
  }
  const a = +((p2.y - p1.y) / deltaX).toFixed(6);
  const b = +(p1.y - a * p1.x).toFixed(6);

  const bufA = Buffer.alloc(4);
  bufA.writeFloatBE(a);
  const aHex = bufA.toString('hex').toUpperCase();

  const bufB = Buffer.alloc(4);
  bufB.writeFloatBE(b);
  const bHex = bufB.toString('hex').toUpperCase();

  return { a, b, aHex, bHex, valid: true };
}

/**
 * Calculates total duration of a flow simulation in seconds.
 * Rules:
 * - Total duration equals sum of all 'delay' blocks or max 'wait_until_offset'.
 * - 'downlink' and 'clear_downlink' blocks take 0 seconds of delay.
 */
export function calculateFlowDurationSeconds(blocks: (SimulationFlowBlock | any)[]): number {
  if (!Array.isArray(blocks)) return 0;
  let totalDelay = 0;
  let maxOffset = 0;
  blocks.forEach((b) => {
    if (!b) return;
    const fType = b.functionType || b.function_type;
    if (fType === 'delay') {
      const delay = Number(b.delaySeconds ?? b.delay_seconds ?? b.duration ?? 0);
      totalDelay += isNaN(delay) || delay < 0 ? 0 : Math.round(delay);
    } else if (fType === 'wait_until_offset') {
      const offset = Number(b.targetOffsetSeconds ?? b.target_offset_seconds ?? 0);
      if (!isNaN(offset) && offset > maxOffset) {
        maxOffset = Math.round(offset);
      }
    }
  });
  return Math.max(totalDelay, maxOffset);
}

/**
 * Determines whether a flow simulation requires a reference device (REF).
 * If any block targets 'REF', the flow requires a golden reference device in Test Batch.
 */
export function flowRequiresReferenceDevice(blocks: (SimulationFlowBlock | any)[]): boolean {
  if (!Array.isArray(blocks)) return false;
  return blocks.some((b) => {
    if (!b) return false;
    const target = (b.targetDevice || b.target_device || '').toUpperCase();
    return target === 'REF' || target === 'REFERENCE';
  });
}

/**
 * Validates function blocks according to specification:
 */
export function validateSimulationFlowBlocks(blocks: (SimulationFlowBlock | any)[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!Array.isArray(blocks)) {
    return { valid: false, errors: ['Blocks phải là một mảng'] };
  }
  if (blocks.length === 0) {
    return { valid: false, errors: ['Flow simulation phải có ít nhất 1 function block'] };
  }

  const validTypes = [
    'downlink',
    'clear_downlink',
    'delay',
    'wait_until_offset',
    'start_measurement',
    'stop_measurement',
    'average',
    'calculate_linear',
    'convert_to_hex',
    'device_auto_check',
  ];

  blocks.forEach((b, index) => {
    const step = index + 1;
    if (!b || typeof b !== 'object') {
      errors.push(`Block #${step}: Dữ liệu block không hợp lệ`);
      return;
    }
    const fType = b.functionType || b.function_type;
    if (!fType || !validTypes.includes(fType)) {
      errors.push(`Block #${step}: Function type '${fType}' không hợp lệ (chấp nhận: ${validTypes.join(', ')})`);
      return;
    }

    if (fType === 'downlink') {
      const target = (b.targetDevice || b.target_device || '').toString().trim();
      if (!target) {
        errors.push(`Block #${step} (Downlink): Thiết bị mục tiêu / Tên thiết bị không được để trống`);
      }
      const port = Number(b.fPort ?? b.f_port ?? 1);
      if (isNaN(port) || port < 1 || port > 223) {
        errors.push(`Block #${step} (Downlink): fPort phải nằm trong khoảng 1..223 (nhận được: ${port})`);
      }
      const hex = (b.payloadHex || b.payload_hex || '').trim();
      if (!hex) {
        errors.push(`Block #${step} (Downlink): Payload Hex không được để trống`);
      } else if (!hex.includes('{{') && (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0)) {
        errors.push(`Block #${step} (Downlink): Payload Hex '${hex}' không đúng định dạng hex chẵn byte hoặc template binding`);
      }
    } else if (fType === 'clear_downlink') {
      const target = (b.targetDevice || b.target_device || '').toString().trim();
      if (!target) {
        errors.push(`Block #${step} (Clear Downlink): Thiết bị mục tiêu / Tên thiết bị không được để trống`);
      }
    } else if (fType === 'delay') {
      const delay = Number(b.delaySeconds ?? b.delay_seconds ?? 0);
      if (isNaN(delay) || delay <= 0) {
        errors.push(`Block #${step} (Delay): Thời gian delay phải lớn hơn 0 giây (nhận được: ${delay})`);
      }
    } else if (fType === 'wait_until_offset') {
      const offset = Number(b.targetOffsetSeconds ?? b.target_offset_seconds ?? 0);
      if (isNaN(offset) || offset < 0) {
        errors.push(`Block #${step} (Wait Until Offset): Target offset seconds phải >= 0`);
      }
    } else if (fType === 'start_measurement' || fType === 'stop_measurement') {
      const windowId = (b.windowId || b.window_id || '').trim();
      if (!windowId) {
        errors.push(`Block #${step} (${fType}): windowId không được để trống`);
      }
    } else if (fType === 'average') {
      const windowId = (b.windowId || b.window_id || '').trim();
      if (!windowId) {
        errors.push(`Block #${step} (Average): windowId không được để trống`);
      }
      const metric = (b.metric || '').trim();
      if (!metric) {
        errors.push(`Block #${step} (Average): metric không được để trống`);
      }
      const outputVar = (b.outputVar || b.output_var || '').trim();
      if (!outputVar) {
        errors.push(`Block #${step} (Average): outputVar không được để trống`);
      }
    } else if (fType === 'calculate_linear') {
      const values = [
        b.point1?.x ?? b.point1X ?? b.x1,
        b.point1?.y ?? b.point1Y ?? b.y1,
        b.point2?.x ?? b.point2X ?? b.x2,
        b.point2?.y ?? b.point2Y ?? b.y2,
      ];
      if (values.some((value) => value === undefined || value === null || value === '' ||
        (typeof value === 'string' && !value.trim()) ||
        (typeof value === 'number' && !Number.isFinite(value)))) {
        errors.push(`Block #${step} (Calculate Linear): Cần khai báo đủ x1, y1, x2, y2`);
      }
    } else if (fType === 'convert_to_hex') {
      const src = (b.sourceVar || b.source_var || '').trim();
      const out = (b.outputVar || b.output_var || '').trim();
      if (!src) {
        errors.push(`Block #${step} (Convert To Hex): Biến nguồn (sourceVar) không được để trống`);
      }
      if (!out) {
        errors.push(`Block #${step} (Convert To Hex): Biến đầu ra (outputVar) không được để trống`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}




