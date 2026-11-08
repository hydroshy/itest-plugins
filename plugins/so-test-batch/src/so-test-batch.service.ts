import {
  AvailableBatchItem,
  ISoTestBatchDatabase,
  LinkBatchToSoDTO,
  SoFilterQuery,
  SoWithBatchesItem,
  UnlinkBatchFromSoDTO,
} from './so-test-batch.types';

export class SoTestBatchService {
  constructor(private readonly db: ISoTestBatchDatabase) {}

  /**
   * Lấy danh sách SO thực tế kèm mảng testBatches đã gán
   */
  async getSosWithBatches(query: SoFilterQuery = {}): Promise<SoWithBatchesItem[]> {
    try {
      // 1. Thử truy vấn qua view tối ưu v_so_with_test_batches
      let sql = `
        SELECT
          so_id AS "id",
          so_number AS "soNumber",
          COALESCE(customer_name, '—') AS "customerName",
          customer_email AS "customerEmail",
          partner_email AS "partnerEmail",
          notes,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          test_batches AS "testBatches",
          test_batch_count AS "testBatchCount"
        FROM system_schema.v_so_with_test_batches
        WHERE 1=1
      `;
      const params: any[] = [];

      if (query.status === 'HAS_BATCH') {
        sql += ` AND test_batch_count > 0`;
      } else if (query.status === 'NO_BATCH') {
        sql += ` AND test_batch_count = 0`;
      }

      if (query.search && query.search.trim()) {
        params.push(`%${query.search.trim()}%`);
        const pIdx = params.length;
        sql += ` AND (
          so_number ILIKE $${pIdx}
          OR customer_name ILIKE $${pIdx}
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(test_batches) elem
            WHERE elem->>'batchCode' ILIKE $${pIdx} OR elem->>'batchName' ILIKE $${pIdx}
          )
        )`;
      }

      sql += ` ORDER BY created_at DESC`;

      if (query.limit && query.limit > 0) {
        params.push(query.limit);
        sql += ` LIMIT $${params.length}`;
      }
      if (query.offset && query.offset > 0) {
        params.push(query.offset);
        sql += ` OFFSET $${params.length}`;
      }

      const rows = await this.db.query(sql, params);
      return rows.map((r: any) => ({
        id: r.id,
        soNumber: r.soNumber,
        customerName: r.customerName || '—',
        customerEmail: r.customerEmail || undefined,
        partnerEmail: r.partnerEmail || undefined,
        notes: r.notes || undefined,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
        testBatches: Array.isArray(r.testBatches) ? r.testBatches.map((b: any) => ({
          ...b,
          id: b.batchId || b.id,
        })) : [],
        testBatchCount: Number(r.testBatchCount) || 0,
      }));
    } catch (err: any) {
      // Fallback: Nếu view chưa nạp, query join trực tiếp bảng thực tế
      return this.fallbackQuerySos(query);
    }
  }

  private async fallbackQuerySos(query: SoFilterQuery): Promise<SoWithBatchesItem[]> {
    const sql = `
      SELECT
        so.id,
        so.so_number AS "soNumber",
        COALESCE(so.customer_name, '—') AS "customerName",
        so.notes,
        so.created_at AS "createdAt",
        sotb.id AS "linkId",
        b.id AS "batchId",
        b.batch_code AS "batchCode",
        b.batch_name AS "batchName",
        b.item_code AS "itemCode",
        b.long_fw AS "longFw",
        b.fw_version AS "fwVersion",
        b.status AS "batchStatus",
        b.verdict AS "batchVerdict",
        sotb.created_at AS "linkedAt"
      FROM traceability_manager.traceability_so so
      LEFT JOIN system_schema.so_test_batches sotb ON sotb.so_id = so.id
      LEFT JOIN system_schema.device_test_batches b ON sotb.batch_id = b.id
      ORDER BY so.created_at DESC, sotb.created_at DESC
    `;
    const rows = await this.db.query(sql);
    const map = new Map<string, SoWithBatchesItem>();

    for (const r of rows) {
      if (!map.has(r.id)) {
        map.set(r.id, {
          id: r.id,
          soNumber: r.soNumber,
          customerName: r.customerName || '—',
          notes: r.notes || undefined,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
          testBatches: [],
          testBatchCount: 0,
        });
      }
      const item = map.get(r.id)!;
      if (r.batchId) {
        item.testBatches.push({
          linkId: r.linkId,
          batchId: r.batchId,
          id: r.batchId,
          batchCode: r.batchCode,
          batchName: r.batchName,
          itemCode: r.itemCode,
          longFw: r.longFw,
          fwVersion: r.fwVersion,
          status: r.batchStatus || 'CREATED',
          verdict: r.batchVerdict || 'PENDING',
          deviceCount: 0,
          linkedAt: r.linkedAt ? new Date(r.linkedAt).toISOString() : undefined,
        });
        item.testBatchCount++;
      }
    }

    let result = Array.from(map.values());
    if (query.status === 'HAS_BATCH') {
      result = result.filter((s) => s.testBatchCount > 0);
    } else if (query.status === 'NO_BATCH') {
      result = result.filter((s) => s.testBatchCount === 0);
    }

    if (query.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.soNumber.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.testBatches.some((b) => b.batchCode.toLowerCase().includes(q) || b.batchName.toLowerCase().includes(q))
      );
    }

    return result;
  }

  /**
   * Lấy danh sách các Test Batch thực tế sẵn có trên hệ thống
   */
  async getAvailableBatches(): Promise<AvailableBatchItem[]> {
    try {
      const sql = `
        SELECT
          id,
          batch_code AS "batchCode",
          batch_name AS "batchName",
          item_code AS "itemCode",
          long_fw AS "longFw",
          fw_version AS "fwVersion",
          status,
          verdict,
          COALESCE(device_count, 0) AS "deviceCount",
          max_devices AS "maxDevices",
          created_at AS "createdAt"
        FROM system_schema.v_available_test_batches
        ORDER BY created_at DESC
      `;
      const rows = await this.db.query(sql);
      return rows.map((r: any) => ({
        id: r.id,
        batchCode: r.batchCode,
        batchName: r.batchName,
        itemCode: r.itemCode,
        longFw: r.longFw,
        fwVersion: r.fwVersion,
        status: r.status,
        verdict: r.verdict,
        deviceCount: Number(r.deviceCount) || 0,
        maxDevices: Number(r.maxDevices) || 0,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      }));
    } catch {
      // Fallback qua bảng gốc
      const sql = `
        SELECT
          b.id,
          b.batch_code AS "batchCode",
          b.batch_name AS "batchName",
          b.item_code AS "itemCode",
          b.long_fw AS "longFw",
          b.fw_version AS "fwVersion",
          b.status,
          b.verdict,
          b.max_devices AS "maxDevices",
          b.created_at AS "createdAt",
          COUNT(bi.id)::int AS "deviceCount"
        FROM system_schema.device_test_batches b
        LEFT JOIN system_schema.device_test_batch_items bi ON bi.batch_id = b.id
        GROUP BY b.id
        ORDER BY b.created_at DESC
      `;
      const rows = await this.db.query(sql);
      return rows.map((r: any) => ({
        id: r.id,
        batchCode: r.batchCode,
        batchName: r.batchName,
        itemCode: r.itemCode,
        longFw: r.longFw,
        fwVersion: r.fwVersion,
        status: r.status,
        verdict: r.verdict,
        deviceCount: Number(r.deviceCount) || 0,
        maxDevices: Number(r.maxDevices) || 0,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      }));
    }
  }

  /**
   * Gán Test Batch vào Sale Order
   */
  async linkBatchToSo(dto: LinkBatchToSoDTO): Promise<{ success: boolean; message: string; linkId?: string }> {
    if (!dto.batchId && !dto.batchCode) {
      throw new Error('Thiếu thông tin batchId hoặc batchCode');
    }
    if (!dto.soId && !dto.soNumber) {
      throw new Error('Thiếu thông tin soId hoặc soNumber');
    }

    // 1. Phân giải soId và soNumber
    let soId = dto.soId;
    let soNumber = dto.soNumber;
    if (!soId && soNumber) {
      const rows = await this.db.query(
        `SELECT id, so_number FROM traceability_manager.traceability_so WHERE so_number = $1 LIMIT 1`,
        [soNumber]
      );
      if (!rows || rows.length === 0) {
        throw new Error(`Không tìm thấy Sale Order với mã ${soNumber}`);
      }
      soId = rows[0].id;
      soNumber = rows[0].so_number;
    } else if (soId && !soNumber) {
      const rows = await this.db.query(
        `SELECT id, so_number FROM traceability_manager.traceability_so WHERE id = $1 LIMIT 1`,
        [soId]
      );
      if (rows && rows.length > 0) {
        soNumber = rows[0].so_number;
      }
    }

    // 2. Phân giải batchId và batchCode
    let batchId = dto.batchId;
    let batchCode = dto.batchCode;
    if (!batchId && batchCode) {
      const rows = await this.db.query(
        `SELECT id, batch_code FROM system_schema.device_test_batches WHERE batch_code = $1 LIMIT 1`,
        [batchCode]
      );
      if (!rows || rows.length === 0) {
        throw new Error(`Không tìm thấy Test Batch với mã ${batchCode}`);
      }
      batchId = rows[0].id;
      batchCode = rows[0].batch_code;
    } else if (batchId && !batchCode) {
      const rows = await this.db.query(
        `SELECT id, batch_code FROM system_schema.device_test_batches WHERE id = $1 LIMIT 1`,
        [batchId]
      );
      if (rows && rows.length > 0) {
        batchCode = rows[0].batch_code;
      }
    }

    // 3. Thực hiện INSERT liên kết (Upsert an toàn)
    const sql = `
      INSERT INTO system_schema.so_test_batches (
        so_id, so_number, batch_id, batch_code, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT ("so_id", "batch_id")
      DO UPDATE SET
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING id
    `;
    const inserted = await this.db.query(sql, [
      soId,
      soNumber,
      batchId,
      batchCode,
      dto.notes || null,
      dto.createdBy || 'operator',
    ]);

    const linkId = inserted && inserted[0] ? inserted[0].id : undefined;
    return {
      success: true,
      message: `Đã liên kết Test Batch ${batchCode} vào SO ${soNumber} thành công`,
      linkId,
    };
  }

  /**
   * Hủy liên kết Test Batch khỏi Sale Order
   */
  async unlinkBatchFromSo(dto: UnlinkBatchFromSoDTO): Promise<{ success: boolean; message: string; deletedCount: number }> {
    if (dto.linkId) {
      const result = await this.db.query(
        `DELETE FROM system_schema.so_test_batches WHERE id = $1 RETURNING id`,
        [dto.linkId]
      );
      return {
        success: true,
        message: 'Đã hủy liên kết Test Batch thành công',
        deletedCount: result ? result.length : 0,
      };
    }

    if (!dto.batchId) {
      throw new Error('Thiếu thông tin batchId hoặc linkId để hủy liên kết');
    }

    // Phân giải soId nếu chỉ có soNumber
    let soId = dto.soId;
    if (!soId && dto.soNumber) {
      const rows = await this.db.query(
        `SELECT id FROM traceability_manager.traceability_so WHERE so_number = $1 LIMIT 1`,
        [dto.soNumber]
      );
      if (rows && rows.length > 0) {
        soId = rows[0].id;
      }
    }

    let sql = `DELETE FROM system_schema.so_test_batches WHERE batch_id = $1`;
    const params: any[] = [dto.batchId];
    if (soId) {
      params.push(soId);
      sql += ` AND so_id = $2`;
    }
    sql += ` RETURNING id`;

    const result = await this.db.query(sql, params);
    return {
      success: true,
      message: 'Đã hủy liên kết Test Batch khỏi SO thành công',
      deletedCount: result ? result.length : 0,
    };
  }
}
