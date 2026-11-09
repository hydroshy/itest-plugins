export interface TestBatchSummaryItem {
  id: string;
  batch_code: string;
  name: string;
  item_code: string;
  fw_version: string;
  long_fw?: string;
  status: 'PENDING' | 'CONFIGURING' | 'READY' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  verdict?: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  max_devices: number;
  device_count: number;
  simulation_flow_id?: string;
  simulation_flow_name?: string;
  duration_seconds: number;
  created_at: string;
  updated_at?: string;
  created_by?: string;
}

export interface ListTestBatchFilterQuery {
  search?: string;
  item_code?: string;
  fw_version?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface IListTestBatchDatabase {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
}
