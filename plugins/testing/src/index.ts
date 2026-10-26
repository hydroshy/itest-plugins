import { TestingService } from './testing.service';
import { TestingController } from './testing.controller';
import { DefaultTraceabilityBridge } from './testing-traceability.bridge';

export * from './testing.types';
export * from './testing-traceability.bridge';
export * from './packet-processor';
export * from './testing.service';
export * from './testing.controller';

export class TestingPlugin {
  private service: TestingService;
  private controller: TestingController;

  constructor() {
    this.service = new TestingService(new DefaultTraceabilityBridge());
    this.controller = new TestingController(this.service);
  }

  getService(): TestingService {
    return this.service;
  }

  getController(): TestingController {
    return this.controller;
  }
}

export default TestingPlugin;
