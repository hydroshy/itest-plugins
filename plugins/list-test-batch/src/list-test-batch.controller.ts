import { ListTestBatchService } from './list-test-batch.service';
import { ListTestBatchFilterQuery } from './list-test-batch.types';

export class ListTestBatchController {
  constructor(private readonly service: ListTestBatchService) {}

  async listBatches(query: ListTestBatchFilterQuery) {
    try {
      const data = await this.service.getTestBatches(query);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getBatch(id: string) {
    try {
      const data = await this.service.getBatchById(id);
      if (!data) {
        return { success: false, error: 'Test Batch not found' };
      }
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async deleteBatch(id: string) {
    try {
      const result = await this.service.deleteBatch(id);
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
