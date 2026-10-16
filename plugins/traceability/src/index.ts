import { IPluginLifecycle, IPluginContext } from '@universal-iot/plugin-sdk';

export interface FinalConfigPreset {
  id: string;
  so: string;
  item_code: string;
  sku: string;
  firmware_version: string;
  short_fw: number;
  name: string;
  description?: string;
  total_regs: number;
}

export interface TestSessionRecord {
  id: string;
  tenant_id: string;
  name: string;
  operator_id?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
  started_at: Date;
  completed_at?: Date;
}

export class TraceabilityPlugin implements IPluginLifecycle {
  private context?: IPluginContext;

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    this.context.logger.info(`[TraceabilityPlugin] Initialized under schema: plugin_traceability`);
  }

  async start(): Promise<void> {
    this.context?.logger.info(`[TraceabilityPlugin] Traceability & Final Config services started.`);
  }

  async stop(): Promise<void> {
    this.context?.logger.info(`[TraceabilityPlugin] Traceability services stopped.`);
  }

  async destroy(): Promise<void> {
    this.context?.logger.info(`[TraceabilityPlugin] Traceability plugin destroyed.`);
  }

  // Business capabilities
  createFinalConfigPreset(preset: Omit<FinalConfigPreset, 'id'>): Promise<FinalConfigPreset> {
    this.context?.logger.info(`Creating final config preset for SO: ${preset.so}, Item: ${preset.item_code}`);
    return Promise.resolve({ id: 'gen-' + Date.now(), ...preset });
  }

  recordTestSession(session: Omit<TestSessionRecord, 'id' | 'started_at'>): Promise<TestSessionRecord> {
    this.context?.logger.info(`Recording test session: ${session.name}`);
    return Promise.resolve({ id: 'session-' + Date.now(), started_at: new Date(), ...session });
  }
}

export default TraceabilityPlugin;
