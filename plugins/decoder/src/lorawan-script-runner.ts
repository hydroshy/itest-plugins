import * as vm from 'node:vm';
import { DecodeTestResult, PayloadInputFormat } from './decoder.types';

export interface RunnerOptions {
  timeoutMs?: number;
  fPort?: number;
  inputFormat?: PayloadInputFormat;
  variables?: Record<string, any>;
  captureLogs?: boolean;
}

export class LoRaWANScriptRunner {
  private static readonly DEFAULT_TIMEOUT_MS = 2000;

  /**
   * Convert any valid payload input (Buffer, byte array, hex, base64) to a Uint8Array / number array
   */
  static parsePayload(
    input: Buffer | string | number[],
    formatHint?: PayloadInputFormat
  ): { buffer: Buffer; bytes: number[] } {
    if (Buffer.isBuffer(input)) {
      return { buffer: input, bytes: Array.from(input) };
    }

    if (Array.isArray(input)) {
      const buf = Buffer.from(input);
      return { buffer: buf, bytes: input };
    }

    if (typeof input === 'string') {
      const trimmed = input.trim();

      // If explicitly marked as base64, or formatHint is base64
      if (formatHint === 'base64') {
        const buf = Buffer.from(trimmed, 'base64');
        return { buffer: buf, bytes: Array.from(buf) };
      }

      // Check if it's hex string
      const cleanHex = trimmed.replace(/^(0x)/i, '').replace(/[\s\-_:]/g, '');
      const isHex = /^[0-9a-fA-F]+$/.test(cleanHex) && cleanHex.length % 2 === 0;

      if (isHex) {
        const buf = Buffer.from(cleanHex, 'hex');
        return { buffer: buf, bytes: Array.from(buf) };
      }

      // Fallback: try base64 if not pure hex
      try {
        const buf = Buffer.from(trimmed, 'base64');
        return { buffer: buf, bytes: Array.from(buf) };
      } catch {
        const buf = Buffer.from(cleanHex, 'hex');
        return { buffer: buf, bytes: Array.from(buf) };
      }
    }

    return { buffer: Buffer.alloc(0), bytes: [] };
  }

  /**
   * Execute LoRaWAN payload decoder script in an isolated Node VM sandbox
   */
  static execute(
    scriptContent: string,
    payload: Buffer | string | number[],
    options: RunnerOptions = {}
  ): DecodeTestResult {
    const startTime = performance.now();
    const timeout = options.timeoutMs ?? this.DEFAULT_TIMEOUT_MS;
    const fPort = options.fPort ?? 1;
    const variables = options.variables ?? {};
    const logs: string[] = [];

    if (!scriptContent || typeof scriptContent !== 'string' || scriptContent.trim().length === 0) {
      return {
        success: false,
        errors: ['Script content is empty or invalid.'],
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        logs,
      };
    }

    let parsed: { buffer: Buffer; bytes: number[] };
    try {
      parsed = this.parsePayload(payload, options.inputFormat);
    } catch (err: any) {
      return {
        success: false,
        errors: [`Failed to parse input payload: ${err.message}`],
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        logs,
      };
    }

    // Isolated sandbox console
    const sandboxConsole = {
      log: (...args: any[]) => logs.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
      warn: (...args: any[]) => logs.push('[WARN] ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
      error: (...args: any[]) => logs.push('[ERROR] ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
      info: (...args: any[]) => logs.push('[INFO] ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
    };

    // Prepare sandbox context with standard utilities
    const sandbox: Record<string, any> = {
      console: sandboxConsole,
      // Pass both array of numbers and typed buffer
      bytes: parsed.bytes,
      fPort,
      variables,
      // Standard safe globals
      Math,
      Number,
      String,
      Boolean,
      Array,
      Object,
      JSON,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Date,
      Buffer: {
        from: (data: any, encoding?: any) => Buffer.from(data, encoding),
      },
    };

    const context = vm.createContext(sandbox);

    // Wrapper script supporting multiple standard conventions:
    // 1. ChirpStack v4 / LoRa Alliance: decodeUplink({ bytes, fPort, variables })
    // 2. ChirpStack v3 / TTN v3: Decode(fPort, bytes, variables)
    // 3. TTN v2: Decoder(bytes, fPort)
    // 4. Custom return
    const runnerScript = `
      ${scriptContent}

      (function() {
        var inputBytes = bytes;
        var inputPort = fPort;
        var inputVars = variables;

        // 1. ChirpStack v4 decodeUplink({ bytes, fPort, variables })
        if (typeof decodeUplink === 'function') {
          return decodeUplink({ bytes: inputBytes, fPort: inputPort, variables: inputVars });
        }

        // 2. ChirpStack v3 / TTN v3 Decode(fPort, bytes)
        if (typeof Decode === 'function') {
          return Decode(inputPort, inputBytes, inputVars);
        }

        // 3. TTN v2 Decoder(bytes, fPort)
        if (typeof Decoder === 'function') {
          return Decoder(inputBytes, inputPort);
        }

        // 4. decode(fPort, bytes)
        if (typeof decode === 'function') {
          return decode(inputPort, inputBytes, inputVars);
        }

        throw new Error("No valid decoder entrypoint found. Define 'decodeUplink({ bytes, fPort })', 'Decode(fPort, bytes)' or 'Decoder(bytes, fPort)'.");
      })()
    `;

    try {
      const script = new vm.Script(runnerScript, {
        filename: 'decoder-sandbox.js',
      });

      const rawResult = script.runInContext(context, {
        timeout,
        displayErrors: true,
      });

      const execTime = Math.round((performance.now() - startTime) * 100) / 100;

      // Normalize result: ChirpStack v4 returns { data, warnings, errors }
      let data: Record<string, any> = {};
      let errors: string[] = [];
      let warnings: string[] = [];

      if (rawResult && typeof rawResult === 'object') {
        const sanitized = JSON.parse(JSON.stringify(rawResult));
        if ('data' in sanitized) {
          data = sanitized.data || {};
          if (Array.isArray(sanitized.errors)) errors = sanitized.errors;
          if (Array.isArray(sanitized.warnings)) warnings = sanitized.warnings;
        } else {
          // Standard dictionary result
          data = sanitized;
        }
      } else if (rawResult !== undefined && rawResult !== null) {
        data = { value: rawResult };
      }

      return {
        success: errors.length === 0,
        data,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        executionTimeMs: execTime,
        logs: logs.length > 0 ? logs : undefined,
      };
    } catch (err: any) {
      const execTime = Math.round((performance.now() - startTime) * 100) / 100;
      let errorMsg = err.message || 'Execution error';
      if (err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
        errorMsg = `Script execution timed out (${timeout}ms). Possible infinite loop.`;
      }

      return {
        success: false,
        errors: [errorMsg],
        executionTimeMs: execTime,
        logs: logs.length > 0 ? logs : undefined,
      };
    }
  }

  /**
   * Provide a default sample template script for ChirpStack v4 LoRaWAN decoder
   */
  static getDefaultTemplate(): string {
    return `/**
 * LoRaWAN Payload Decoder Template (ChirpStack v4 / LoRa Alliance standard)
 * 
 * @param {Object} input
 * @param {number[]} input.bytes - Array of byte values (0-255)
 * @param {number} input.fPort - LoRaWAN FPort number (1-223)
 * @param {Object} [input.variables] - Optional device variables
 * @returns {Object} { data: Object, warnings: string[], errors: string[] }
 */
function decodeUplink(input) {
  var bytes = input.bytes;
  var fPort = input.fPort;
  var data = {};
  var errors = [];
  var warnings = [];

  if (!bytes || bytes.length === 0) {
    errors.push("Payload is empty");
    return { data: data, errors: errors, warnings: warnings };
  }

  // Example: Decode battery (byte 0) and temperature (bytes 1-2 int16 big-endian * 0.01)
  if (bytes.length >= 1) {
    data.battery_pct = bytes[0];
  }
  if (bytes.length >= 3) {
    var rawTemp = (bytes[1] << 8) | bytes[2];
    if (rawTemp & 0x8000) rawTemp = rawTemp - 0x10000;
    data.temperature = +(rawTemp * 0.01).toFixed(2);
  }

  return {
    data: data,
    warnings: warnings,
    errors: errors
  };
}
`;
  }
}
