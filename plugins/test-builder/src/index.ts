import { IPluginLifecycle, IPluginContext } from '@iot-platform/plugin-sdk';

export interface TestBuilderConfig {
  enabled: boolean;
  options?: Record<string, any>;
}

export class TestBuilderService {
  private config: TestBuilderConfig = { enabled: true };

  configure(cfg: Partial<TestBuilderConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  getStatus(): { plugin: string; name: string; enabled: boolean; timestamp: string } {
    return {
      plugin: 'test-builder',
      name: 'Test Builder Studio',
      enabled: this.config.enabled,
      timestamp: new Date().toISOString()
    };
  }
}

export default class TestBuilderPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new TestBuilderService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`[${context.manifest.name}] Initialized`);
  }

  async start(): Promise<void> {
    this.context?.logger.info(`[${this.context?.manifest.name}] Started`);
  }

  async stop(): Promise<void> {
    this.context?.logger.info(`[${this.context?.manifest.name}] Stopped`);
  }

  async destroy(): Promise<void> {
    this.context?.logger.info(`[${this.context?.manifest.name}] Destroyed`);
  }
}
