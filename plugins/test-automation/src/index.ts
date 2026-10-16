import {
  IPluginLifecycle,
  IPluginContext,
} from '@iot-platform/plugin-sdk';

export interface TestScript {
  id: string;
  name: string;
  description?: string;
  targetProtocol: 'mqtt' | 'modbus' | 'lorawan' | 'webhook';
  steps: Array<{
    stepNumber: number;
    action: 'publish' | 'poll' | 'assert_payload' | 'wait';
    params: Record<string, any>;
  }>;
}

export interface TestExecutionResult {
  id: string;
  scriptId: string;
  startedAt: Date;
  finishedAt: Date;
  passed: boolean;
  logs: string[];
}

export class TestAutomationService {
  private readonly scripts = new Map<string, TestScript>();
  private readonly history: TestExecutionResult[] = [];

  registerScript(script: TestScript): void {
    this.scripts.set(script.id, script);
  }

  getScript(id: string): TestScript | undefined {
    return this.scripts.get(id);
  }

  listScripts(): TestScript[] {
    return Array.from(this.scripts.values());
  }

  recordExecution(result: TestExecutionResult): void {
    this.history.unshift(result);
  }

  getExecutionHistory(scriptId?: string): TestExecutionResult[] {
    if (!scriptId) return this.history;
    return this.history.filter((h) => h.scriptId === scriptId);
  }
}

export default class TestAutomationPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new TestAutomationService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`Initialized ${context.manifest.name}`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('Test Automation Plugin started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('Test Automation Plugin stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('Test Automation Plugin destroyed.');
  }
}
