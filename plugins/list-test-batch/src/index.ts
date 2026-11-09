import { ListTestBatchService } from './list-test-batch.service';
import { ListTestBatchController } from './list-test-batch.controller';
import { IListTestBatchDatabase } from './list-test-batch.types';

export * from './list-test-batch.types';
export * from './list-test-batch.service';
export * from './list-test-batch.controller';

export function createListTestBatchPlugin(db: IListTestBatchDatabase) {
  const service = new ListTestBatchService(db);
  const controller = new ListTestBatchController(service);
  return { service, controller };
}
