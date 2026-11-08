import { SoTestBatchService } from './so-test-batch.service';
import { SoTestBatchController } from './so-test-batch.controller';
import { ISoTestBatchDatabase } from './so-test-batch.types';

export * from './so-test-batch.types';
export * from './so-test-batch.service';
export * from './so-test-batch.controller';

export class SoTestBatchPlugin {
  private service: SoTestBatchService;
  private controller: SoTestBatchController;

  constructor(db: ISoTestBatchDatabase) {
    this.service = new SoTestBatchService(db);
    this.controller = new SoTestBatchController(this.service);
  }

  getService(): SoTestBatchService {
    return this.service;
  }

  getController(): SoTestBatchController {
    return this.controller;
  }
}

export default SoTestBatchPlugin;
