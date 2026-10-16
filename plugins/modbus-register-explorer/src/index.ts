import {
  IPluginLifecycle,
  IPluginContext,
} from '@iot-platform/plugin-sdk';

export interface ModbusRegisterDefinition {
  address: number;
  name: string;
  type: 'coil' | 'discrete' | 'input' | 'holding';
  dataType: 'boolean' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'float32' | 'string';
  scale?: number;
  offset?: number;
  unit?: string;
  description?: string;
}

export interface ModbusPreset {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  registers: ModbusRegisterDefinition[];
}

export class ModbusRegisterExplorerService {
  private readonly presets = new Map<string, ModbusPreset>();

  registerPreset(preset: ModbusPreset): void {
    this.presets.set(preset.id, preset);
  }

  getPreset(id: string): ModbusPreset | undefined {
    return this.presets.get(id);
  }

  listPresets(): ModbusPreset[] {
    return Array.from(this.presets.values());
  }

  calculateActualOffset(notationAddress: number, type: 'coil' | 'discrete' | 'input' | 'holding'): number {
    // Handling 40001 notation vs 0-based offset
    if (type === 'holding' && notationAddress >= 40001 && notationAddress <= 49999) {
      return notationAddress - 40001;
    }
    if (type === 'input' && notationAddress >= 30001 && notationAddress <= 39999) {
      return notationAddress - 30001;
    }
    if (type === 'discrete' && notationAddress >= 10001 && notationAddress <= 19999) {
      return notationAddress - 10001;
    }
    if (type === 'coil' && notationAddress >= 1 && notationAddress <= 9999) {
      return notationAddress - 1;
    }
    return notationAddress;
  }
}

export default class ModbusRegisterExplorerPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new ModbusRegisterExplorerService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`Initialized ${context.manifest.name}`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('Modbus Register Explorer Plugin started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('Modbus Register Explorer Plugin stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('Modbus Register Explorer Plugin destroyed.');
  }
}
