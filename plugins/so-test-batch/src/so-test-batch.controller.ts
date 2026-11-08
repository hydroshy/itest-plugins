import { SoTestBatchService } from './so-test-batch.service';
import { LinkBatchToSoDTO, SoFilterQuery, UnlinkBatchFromSoDTO } from './so-test-batch.types';

export class SoTestBatchController {
  constructor(private readonly service: SoTestBatchService) {}

  async getSos(query?: SoFilterQuery) {
    try {
      const data = await this.service.getSosWithBatches(query);
      return {
        success: true,
        data,
        total: data.length,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async getAvailableBatches() {
    try {
      const data = await this.service.getAvailableBatches();
      return {
        success: true,
        data,
        total: data.length,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async linkBatch(dto: LinkBatchToSoDTO) {
    try {
      const result = await this.service.linkBatchToSo(dto);
      return result;
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async unlinkBatch(dto: UnlinkBatchFromSoDTO) {
    try {
      const result = await this.service.unlinkBatchFromSo(dto);
      return result;
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }
}
