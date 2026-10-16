import {
  IPluginLifecycle,
  IPluginContext,
} from '@iot-platform/plugin-sdk';
import * as vm from 'vm';

export interface DeviceProfile {
  id: string;
  name: string;
  protocolType: string;
  manufacturer?: string;
  model?: string;
  registers: Array<{
    address: number;
    name: string;
    type: 'coil' | 'discrete' | 'input' | 'holding';
    dataType: string;
    scale?: number;
    offset?: number;
    unit?: string;
  }>;
  decoderScript?: string;
}

export class DeviceProfileManagerService {
  private readonly profiles = new Map<string, DeviceProfile>();

  saveProfile(profile: DeviceProfile): DeviceProfile {
    this.profiles.set(profile.id, { ...profile });
    return profile;
  }

  getProfile(id: string): DeviceProfile | undefined {
    return this.profiles.get(id);
  }

  listProfiles(protocolType?: string): DeviceProfile[] {
    const list = Array.from(this.profiles.values());
    if (protocolType) return list.filter((p) => p.protocolType === protocolType);
    return list;
  }

  executeDecoderSandbox(script: string, payloadHex: string, fPort: number = 1): any {
    const bytes = Buffer.from(payloadHex.replace(/\s+/g, ''), 'hex');
    const sandbox = {
      bytes: Array.from(bytes),
      fPort,
      Buffer,
      result: null,
      console: { log: () => {} },
    };

    const wrapped = `
      try {
        ${script}
        if (typeof Decode === 'function') {
          result = Decode(fPort, bytes);
        } else if (typeof decodeUplink === 'function') {
          result = decodeUplink({ bytes, fPort });
        }
      } catch (e) {
        result = { error: e.message };
      }
    `;

    const context = vm.createContext(sandbox);
    vm.runInContext(wrapped, context, { timeout: 1500 });
    return sandbox.result;
  }
}

export default class DeviceProfileManagerPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new DeviceProfileManagerService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`Initialized ${context.manifest.name}`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('Device Profile Manager Application Plugin started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('Device Profile Manager Application Plugin stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('Device Profile Manager Application Plugin destroyed.');
  }
}
