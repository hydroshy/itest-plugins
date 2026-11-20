import type {
  IPluginLifecycle,
  IPluginContext,
} from '@iot-platform/plugin-sdk';
import {
  createContiguousChunks,
  calculateModbusCrc16,
  type PreconfigRegisterItem,
  type ModbusChunk,
} from './modbus-chunker';
import {
  verifyReadBackValues,
  type VerificationTarget,
  type VerificationResult,
  type VerificationMismatch,
} from './read-back-verifier';

export {
  createContiguousChunks,
  calculateModbusCrc16,
  verifyReadBackValues,
  type PreconfigRegisterItem,
  type ModbusChunk,
  type VerificationTarget,
  type VerificationResult,
  type VerificationMismatch,
};

export interface PreconfigPluginConfig {
  maxRegistersPerChunk: number;
  readBackDelayMs: number;
  retryAttempts: number;
}

export class PreconfigManagerService {
  private config: PreconfigPluginConfig = {
    maxRegistersPerChunk: 32,
    readBackDelayMs: 200,
    retryAttempts: 3,
  };

  getConfig(): PreconfigPluginConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<PreconfigPluginConfig>): PreconfigPluginConfig {
    this.config = {
      ...this.config,
      ...updates,
    };
    return this.config;
  }

  prepareWriteChunks(registers: PreconfigRegisterItem[]): ModbusChunk[] {
    return createContiguousChunks(registers, this.config.maxRegistersPerChunk);
  }

  verifyReadBack(
    targets: VerificationTarget[],
    actualMemory: Map<number, number | [number, number]>,
  ): VerificationResult {
    return verifyReadBackValues(targets, actualMemory);
  }
}

export default class PreconfigManagerPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new PreconfigManagerService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`Initialized ${context.manifest.name}`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('Preconfig Manager Application Plugin started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('Preconfig Manager Application Plugin stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('Preconfig Manager Application Plugin destroyed.');
  }
}
