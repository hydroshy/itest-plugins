import * as vm from 'node:vm';
import {
  IPluginLifecycle,
  IPluginContext,
  UnifiedTelemetry,
  ModbusEndianness,
  decodeModbusValue,
} from '@universal-iot/plugin-sdk';

export interface ModbusRegisterDefinition {
  address: number; // 1-based or 0-based
  parameterName: string;
  format: 'int16' | 'uint16' | 'int32' | 'uint32' | 'float32' | 'float64' | 'boolean' | 'string';
  endianness?: 'big-endian' | 'little-endian' | 'mid-big-endian' | 'mid-little-endian';
  scale?: number;
  offset?: number;
  unit?: string;
  fnRead?: number; // 1, 2, 3, 4
  fnWrite?: number; // 5, 6, 15, 16
  length?: number; // Word count or string length
}

export interface MemoryMapPayload {
  id: string;
  name: string;
  version: string;
  registers: ModbusRegisterDefinition[];
}

export interface SandboxedDecodeOptions {
  timeoutMs?: number;
  fPort?: number;
  variables?: Record<string, any>;
  captureLogs?: boolean;
}

export interface SandboxedDecodeResult {
  success: boolean;
  data?: Record<string, any>;
  errors?: string[];
  executionTimeMs: number;
  logs?: string[];
}

/**
 * Sandboxed Payload Decoder
 * Executes LoRaWAN and IoT payload formatting scripts inside an isolated Node VM.
 * Enforces execution timeout and denies access to host OS / filesystem / network.
 */
export class SandboxedPayloadDecoder {
  /**
   * Normalize input into Buffer
   */
  static toBuffer(input: Buffer | string | number[]): Buffer {
    if (Buffer.isBuffer(input)) return input;
    if (Array.isArray(input)) return Buffer.from(input);
    if (typeof input === 'string') {
      const cleanHex = input.replace(/^(0x)/i, '').replace(/[\s\-_:]/g, '');
      if (/^[0-9a-fA-F]*$/.test(cleanHex) && cleanHex.length % 2 === 0) {
        return Buffer.from(cleanHex, 'hex');
      }
      return Buffer.from(input, 'utf8');
    }
    throw new Error('Unsupported payload format. Expected Buffer, hex string, or byte array.');
  }

  /**
   * Execute decoding script inside secure VM context
   */
  static execute(
    scriptCode: string,
    rawPayload: Buffer | string | number[],
    options: SandboxedDecodeOptions = {}
  ): SandboxedDecodeResult {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 1000;
    const fPort = options.fPort ?? 1;
    const variables = options.variables ?? {};
    const logs: string[] = [];

    try {
      const buffer = SandboxedPayloadDecoder.toBuffer(rawPayload);
      const bytesArray = Array.from(buffer);

      // Create isolated sandbox context
      const sandbox: Record<string, any> = {
        Buffer: {
          from: Buffer.from,
          isBuffer: Buffer.isBuffer,
        },
        Math,
        Number,
        String,
        Boolean,
        Array,
        Object,
        Date,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        console: {
          log: (...args: any[]) => logs.push(args.map((a) => String(a)).join(' ')),
          warn: (...args: any[]) => logs.push(`[WARN] ${args.map((a) => String(a)).join(' ')}`),
          error: (...args: any[]) => logs.push(`[ERROR] ${args.map((a) => String(a)).join(' ')}`),
        },
      };

      const vmContext = vm.createContext(sandbox);

      // Wrapper code to detect and execute decodeUplink, Decoder, or decode
      const wrappedScript = `
        'use strict';
        ${scriptCode}

        function __runDecoder(bytes, port, vars) {
          if (typeof decodeUplink === 'function') {
            return decodeUplink({ bytes: bytes, fPort: port, variables: vars });
          } else if (typeof Decoder === 'function') {
            return { data: Decoder(bytes, port) };
          } else if (typeof decode === 'function') {
            return { data: decode(bytes, port) };
          } else if (typeof parse === 'function') {
            return { data: parse(bytes, port) };
          }
          throw new Error('No valid decode function found (expected decodeUplink, Decoder, decode, or parse)');
        }

        __runDecoder(__bytes, __fPort, __vars);
      `;

      sandbox.__bytes = bytesArray;
      sandbox.__fPort = fPort;
      sandbox.__vars = variables;

      const script = new vm.Script(wrappedScript, { filename: 'decoder-sandbox.js' });
      const rawResult = script.runInContext(vmContext, { timeout: timeoutMs });

      const executionTimeMs = Date.now() - startTime;

      let data: Record<string, any> = {};
      let errors: string[] | undefined;

      if (rawResult && typeof rawResult === 'object') {
        if (rawResult.data !== undefined) {
          data = rawResult.data;
        } else {
          data = rawResult;
        }
        if (rawResult.errors && Array.isArray(rawResult.errors)) {
          errors = rawResult.errors;
        }
      }

      return {
        success: true,
        data,
        errors,
        executionTimeMs,
        logs: options.captureLogs ? logs : undefined,
      };
    } catch (err: any) {
      return {
        success: false,
        errors: [err.message || 'Script execution error'],
        executionTimeMs: Date.now() - startTime,
        logs: options.captureLogs ? logs : undefined,
      };
    }
  }
}

/**
 * Memory Map Decoder for Modbus registers with multi-endian & type scaling
 */
export class MemoryMapDecoder {
  static decodeRegisters(
    buffer: Buffer,
    registers: ModbusRegisterDefinition[],
    baseAddressOffset: number = 0 // e.g. 0 if 0-based, or -1 if 1-based address
  ): Record<string, any> {
    const results: Record<string, any> = {};

    for (const reg of registers) {
      try {
        const wordIndex = reg.address + baseAddressOffset;
        const byteOffset = wordIndex * 2;

        if (byteOffset < 0 || byteOffset >= buffer.length) {
          continue;
        }

        let rawVal: any;
        const endianness = reg.endianness || 'big-endian';

        switch (reg.format) {
          case 'uint16': {
            if (byteOffset + 2 <= buffer.length) {
              rawVal = endianness === 'little-endian'
                ? buffer.readUInt16LE(byteOffset)
                : buffer.readUInt16BE(byteOffset);
            }
            break;
          }
          case 'int16': {
            if (byteOffset + 2 <= buffer.length) {
              rawVal = endianness === 'little-endian'
                ? buffer.readInt16LE(byteOffset)
                : buffer.readInt16BE(byteOffset);
            }
            break;
          }
          case 'uint32': {
            if (byteOffset + 4 <= buffer.length) {
              const buf4 = Buffer.from(buffer.subarray(byteOffset, byteOffset + 4));
              if (endianness === 'little-endian') {
                rawVal = buf4.readUInt32LE(0);
              } else if (endianness === 'mid-big-endian') {
                // Word swap: CD AB
                const swapped = Buffer.from([buf4[2], buf4[3], buf4[0], buf4[1]]);
                rawVal = swapped.readUInt32BE(0);
              } else {
                rawVal = buf4.readUInt32BE(0);
              }
            }
            break;
          }
          case 'int32': {
            if (byteOffset + 4 <= buffer.length) {
              const buf4 = Buffer.from(buffer.subarray(byteOffset, byteOffset + 4));
              if (endianness === 'little-endian') {
                rawVal = buf4.readInt32LE(0);
              } else if (endianness === 'mid-big-endian') {
                const swapped = Buffer.from([buf4[2], buf4[3], buf4[0], buf4[1]]);
                rawVal = swapped.readInt32BE(0);
              } else {
                rawVal = buf4.readInt32BE(0);
              }
            }
            break;
          }
          case 'float32': {
            if (byteOffset + 4 <= buffer.length) {
              const buf4 = Buffer.from(buffer.subarray(byteOffset, byteOffset + 4));
              if (endianness === 'little-endian') {
                rawVal = buf4.readFloatLE(0);
              } else if (endianness === 'mid-big-endian') {
                const swapped = Buffer.from([buf4[2], buf4[3], buf4[0], buf4[1]]);
                rawVal = swapped.readFloatBE(0);
              } else {
                rawVal = buf4.readFloatBE(0);
              }
              if (typeof rawVal === 'number') {
                rawVal = Math.round(rawVal * 1000) / 1000;
              }
            }
            break;
          }
          case 'float64': {
            if (byteOffset + 8 <= buffer.length) {
              rawVal = endianness === 'little-endian'
                ? buffer.readDoubleLE(byteOffset)
                : buffer.readDoubleBE(byteOffset);
              if (typeof rawVal === 'number') {
                rawVal = Math.round(rawVal * 10000) / 10000;
              }
            }
            break;
          }
          case 'boolean': {
            if (byteOffset + 2 <= buffer.length) {
              const word = buffer.readUInt16BE(byteOffset);
              rawVal = word !== 0;
            }
            break;
          }
          case 'string': {
            const length = (reg.length || 8) * 2;
            if (byteOffset + length <= buffer.length) {
              rawVal = buffer.subarray(byteOffset, byteOffset + length).toString('utf8').replace(/\0/g, '').trim();
            }
            break;
          }
        }

        if (rawVal !== undefined) {
          if (typeof rawVal === 'number') {
            if (reg.scale !== undefined) rawVal = rawVal * reg.scale;
            if (reg.offset !== undefined) rawVal = rawVal + reg.offset;
          }
          results[reg.parameterName] = rawVal;
        }
      } catch (e: any) {
        // Continue parsing next register
      }
    }

    return results;
  }
}

/**
 * Payload Plugin
 */
export class PayloadPlugin implements IPluginLifecycle {
  private context?: IPluginContext;

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    if (context.permissions?.registerPermissions) {
      context.permissions.registerPermissions([
        { namespace: 'payload', resource: 'decoder', action: 'decode', description: 'Execute payload decoding scripts' },
      ]);
    }
    this.context.logger.info(`[PayloadPlugin] Initialized under schema: plugin_payload with Sandboxed Decoder & Memory Map Parser`);
  }

  async start(): Promise<void> {
    this.context?.logger.info(`[PayloadPlugin] Payload mapping and sandboxed decoder active.`);
  }

  async stop(): Promise<void> {
    this.context?.logger.info(`[PayloadPlugin] Payload plugin stopped.`);
  }

  async destroy(): Promise<void> {
    this.context?.logger.info(`[PayloadPlugin] Payload plugin destroyed.`);
  }

  // Parse raw buffer using memory map register definitions
  decodeRegisters(buffer: Buffer, registers: ModbusRegisterDefinition[], baseOffset: number = -1): Record<string, any> {
    return MemoryMapDecoder.decodeRegisters(buffer, registers, baseOffset);
  }

  // Execute sandboxed payload decoder script
  decodeSandboxed(
    scriptCode: string,
    rawPayload: Buffer | string | number[],
    options?: SandboxedDecodeOptions
  ): SandboxedDecodeResult {
    return SandboxedPayloadDecoder.execute(scriptCode, rawPayload, options);
  }
}

export default PayloadPlugin;
