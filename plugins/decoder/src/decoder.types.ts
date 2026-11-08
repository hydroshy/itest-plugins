export type DecoderProtocol = 'lorawan' | 'custom';
export type PayloadInputFormat = 'hex' | 'base64';

export interface DecoderScript {
  id: string;
  name: string;
  sku: string;
  long_fw: string;
  item_code?: string;
  fw_code?: string;
  fw_version?: string;
  script: string;
  protocol: DecoderProtocol;
  description?: string;
  input_format?: PayloadInputFormat;
  sample_payload?: string;
  sample_fport?: number;
  sample_decoded?: Record<string, any>;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at?: Date | string;
  updated_at?: Date | string;
  created_by?: string;
}

export interface CreateDecoderScriptDto {
  name: string;
  sku?: string;
  long_fw?: string;
  item_code?: string;
  fw_code?: string;
  fw_version?: string;
  script: string;
  protocol?: DecoderProtocol;
  description?: string;
  input_format?: PayloadInputFormat;
  sample_payload?: string;
  sample_fport?: number;
  sample_decoded?: Record<string, any>;
  is_active?: boolean;
  metadata?: Record<string, any>;
  created_by?: string;
}

export interface UpdateDecoderScriptDto {
  name?: string;
  sku?: string;
  long_fw?: string;
  item_code?: string;
  fw_code?: string;
  fw_version?: string;
  script?: string;
  protocol?: DecoderProtocol;
  description?: string;
  input_format?: PayloadInputFormat;
  sample_payload?: string;
  sample_fport?: number;
  sample_decoded?: Record<string, any>;
  is_active?: boolean;
  metadata?: Record<string, any>;
}

export interface DecodeTestRequest {
  script: string;
  payload: string | number[] | Buffer;
  fPort?: number;
  inputFormat?: PayloadInputFormat;
  variables?: Record<string, any>;
  timeoutMs?: number;
}

export interface DecodeTestResult {
  success: boolean;
  data?: Record<string, any>;
  errors?: string[];
  warnings?: string[];
  executionTimeMs: number;
  logs?: string[];
}

export interface DecodeExecuteRequest {
  sku?: string;
  long_fw?: string;
  item_code?: string;
  fw_code?: string;
  fw_version?: string;
  payload: string | number[] | Buffer;
  fPort?: number;
  inputFormat?: PayloadInputFormat;
  variables?: Record<string, any>;
  timeoutMs?: number;
}

export interface DecodeExecuteResult {
  success: boolean;
  matched: boolean;
  sku: string;
  long_fw: string;
  item_code?: string;
  fw_code?: string;
  scriptName?: string;
  scriptId?: string;
  matchTier?: string;
  data?: Record<string, any>;
  errors?: string[];
  warnings?: string[];
  executionTimeMs: number;
  logs?: string[];
}

export interface MemmapProfileSummary {
  id: string;
  name: string;
  sku: string;
  long_fw: string;
  short_fw?: string;
  item_code?: string;
  fw_version?: string;
  has_decoder?: boolean;
  decoder_id?: string;
  decoder_name?: string;
}

export interface DeviceTestingResolution {
  item_code?: string;
  fw_code?: string;
  fw_version?: string;
  long_fw?: string;
  sku?: string;
}

export interface DeviceTestingLinkItem {
  id: string;
  registration_code?: string;
  serial_number?: string;
  dev_eui?: string;
  item_code?: string;
  fw_code?: string;
  fw_version?: string;
  long_fw?: string;
  has_decoder: boolean;
  decoder_id?: string;
  decoder_name?: string;
  match_tier?: 'exact_full' | 'fw_code_fw_ver' | 'item_code_fw_ver' | 'sku_long_fw' | 'none';
}

export interface DecoderQueryFilter {
  sku?: string;
  long_fw?: string;
  item_code?: string;
  fw_code?: string;
  is_active?: boolean;
  protocol?: string;
  search?: string;
}
