export interface LinkedBatchItem {
  linkId?: string;
  batchId: string;
  id?: string;
  batchCode: string;
  batchName: string;
  itemCode: string;
  longFw?: string;
  fwVersion?: string;
  status: string;
  verdict: string;
  deviceCount: number;
  linkedAt?: string;
  linkedBy?: string;
}

export interface SoWithBatchesItem {
  id: string;
  soNumber: string;
  customerName: string;
  customerEmail?: string;
  partnerEmail?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  testBatches: LinkedBatchItem[];
  testBatchCount: number;
}

export interface AvailableBatchItem {
  id: string;
  batchCode: string;
  batchName: string;
  itemCode: string;
  longFw?: string;
  fwVersion?: string;
  status: string;
  verdict: string;
  deviceCount: number;
  maxDevices?: number;
  createdAt: string;
}

export interface LinkBatchToSoDTO {
  soId?: string;
  soNumber?: string;
  batchId: string;
  batchCode?: string;
  notes?: string;
  createdBy?: string;
}

export interface UnlinkBatchFromSoDTO {
  soId?: string;
  soNumber?: string;
  batchId?: string;
  linkId?: string;
}

export interface SoFilterQuery {
  search?: string;
  status?: 'ALL' | 'HAS_BATCH' | 'NO_BATCH';
  limit?: number;
  offset?: number;
}

export interface ISoTestBatchDatabase {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
}
