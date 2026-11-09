import {
  IListTestBatchDatabase,
  ListTestBatchFilterQuery,
  TestBatchSummaryItem,
} from './list-test-batch.types';

export class ListTestBatchService {
  constructor(private readonly db: IListTestBatchDatabase) {}

  async getTestBatches(filter: ListTestBatchFilterQuery = {}): Promise<TestBatchSummaryItem[]> {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (filter.search && filter.search.trim()) {
      params.push(`%${filter.search.trim()}%`);
      conditions.push(`(b.batch_code ILIKE $${params.length} OR b.name ILIKE $${params.length})`);
    }

    if (filter.item_code && filter.item_code.trim()) {
      params.push(filter.item_code.trim());
      conditions.push(`b.item_code = $${params.length}`);
    }

    if (filter.fw_version && filter.fw_version.trim()) {
      params.push(filter.fw_version.trim());
      conditions.push(`(b.fw_version = $${params.length} OR b.long_fw = $${params.length})`);
    }

    if (filter.status && filter.status.trim() && filter.status !== 'ALL') {
      params.push(filter.status.trim());
      conditions.push(`b.status = $${params.length}`);
    }

    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
    const offset = filter.offset && filter.offset >= 0 ? filter.offset : 0;

    params.push(limit);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const sql = `
      SELECT 
        b.id,
        b.batch_code,
        b.name,
        b.item_code,
        b.fw_version,
        b.long_fw,
        b.status,
        b.verdict,
        COALESCE(b.max_devices, 10) as max_devices,
        COALESCE((
          SELECT COUNT(*) 
          FROM system_schema.device_test_batch_devices d 
          WHERE d.batch_id = b.id
        ), 0)::int as device_count,
        b.simulation_flow_id,
        sf.name as simulation_flow_name,
        COALESCE(b.duration_seconds, 0) as duration_seconds,
        b.created_at,
        b.updated_at,
        b.created_by
      FROM system_schema.device_test_batches b
      LEFT JOIN system_schema.simulation_flows sf ON sf.id = b.simulation_flow_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY b.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    return await this.db.query<TestBatchSummaryItem>(sql, params);
  }

  async getBatchById(batchId: string): Promise<TestBatchSummaryItem | null> {
    const sql = `
      SELECT 
        b.id,
        b.batch_code,
        b.name,
        b.item_code,
        b.fw_version,
        b.long_fw,
        b.status,
        b.verdict,
        COALESCE(b.max_devices, 10) as max_devices,
        COALESCE((
          SELECT COUNT(*) 
          FROM system_schema.device_test_batch_devices d 
          WHERE d.batch_id = b.id
        ), 0)::int as device_count,
        b.simulation_flow_id,
        sf.name as simulation_flow_name,
        COALESCE(b.duration_seconds, 0) as duration_seconds,
        b.created_at,
        b.updated_at,
        b.created_by
      FROM system_schema.device_test_batches b
      LEFT JOIN system_schema.simulation_flows sf ON sf.id = b.simulation_flow_id
      WHERE b.id = $1
    `;

    const rows = await this.db.query<TestBatchSummaryItem>(sql, [batchId]);
    return rows.length > 0 ? rows[0] : null;
  }

  async deleteBatch(batchId: string): Promise<{ success: boolean; message: string }> {
    const batch = await this.getBatchById(batchId);
    if (!batch) {
      return { success: false, message: 'Test Batch không tồn tại' };
    }

    if (batch.status === 'RUNNING') {
      return { success: false, message: 'Không thể xóa Test Batch đang trong trạng thái RUNNING' };
    }

    await this.db.query(
      `DELETE FROM system_schema.device_test_batch_devices WHERE batch_id = $1`,
      [batchId]
    );

    await this.db.query(
      `DELETE FROM system_schema.device_test_batches WHERE id = $1`,
      [batchId]
    );

    return { success: true, message: 'Đã xóa Test Batch thành công' };
  }
}
