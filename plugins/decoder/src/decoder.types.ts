export type DecoderProtocol = 'lorawan' | 'custom';
export type PayloadInputFormat = 'hex' | 'base64';

export interface DecoderScript {
  id: string;
  name: string;
  sku: string;
  long_fw: string;
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
  sku: string;
  long_fw: string;
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
  sku: string;
  long_fw: string;
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
  scriptName?: string;
  scriptId?: string;
  data?: Record<string, any>;
  errors?: string[];
  executionTimeMs: number;
  logs?: string[];
}

export interface MemmapProfileSummary {
  id: string;
  name: string;
  sku: string;
  long_fw: string;
  short_fw?: string;
  has_decoder?: boolean;
  decoder_id?: string;
  decoder_name?: string;
}

export interface DecoderQueryFilter {
  sku?: string;
  long_fw?: string;
  is_active?: boolean;
  protocol?: string;
  search?: string;
}
