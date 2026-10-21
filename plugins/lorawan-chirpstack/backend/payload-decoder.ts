export class LoRaWanPayloadDecoder {
  /**
   * Decode payload based on codec type
   */
  public static decode(
    rawPayload: string,
    codecType: 'cayenne_lpp' | 'raw_hex' | 'json' | 'custom_js' = 'cayenne_lpp',
    fPort: number = 1,
    customScript?: string,
  ): Record<string, any> {
    const buffer = this.parseToBuffer(rawPayload);

    switch (codecType) {
      case 'cayenne_lpp':
        return this.decodeCayenneLPP(buffer);
      case 'raw_hex':
        return this.decodeRawHex(buffer);
      case 'json':
        return this.decodeJson(rawPayload);
      case 'custom_js':
        return this.decodeCustomJs(buffer, fPort, customScript);
      default:
        return this.decodeRawHex(buffer);
    }
  }

  public static parseToBuffer(payload: string): Buffer {
    const trimmed = (payload || '').trim();
    // Check if hex (only hex characters and even length)
    const hexPattern = /^[0-9a-fA-F]+$/;
    if (trimmed.length % 2 === 0 && hexPattern.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    // Attempt base64 decode
    try {
      const buf = Buffer.from(trimmed, 'base64');
      if (buf.length > 0) return buf;
    } catch {
      // Fallback
    }
    return Buffer.from(trimmed, 'utf-8');
  }

  /**
   * Standard Cayenne LPP (Low Power Payload) Decoder
   */
  public static decodeCayenneLPP(buffer: Buffer): Record<string, any> {
    const result: Record<string, any> = {};
    let offset = 0;

    while (offset < buffer.length) {
      if (offset + 2 > buffer.length) break;
      const channel = buffer.readUInt8(offset++);
      const type = buffer.readUInt8(offset++);

      switch (type) {
        case 0x00: // Digital Input
          result[`digital_in_${channel}`] = buffer.readUInt8(offset++);
          break;
        case 0x01: // Digital Output
          result[`digital_out_${channel}`] = buffer.readUInt8(offset++);
          break;
        case 0x02: // Analog Input (0.01 Signed)
          result[`analog_in_${channel}`] = +(buffer.readInt16BE(offset) * 0.01).toFixed(2);
          offset += 2;
          break;
        case 0x03: // Analog Output (0.01 Signed)
          result[`analog_out_${channel}`] = +(buffer.readInt16BE(offset) * 0.01).toFixed(2);
          offset += 2;
          break;
        case 0x65: // Illuminance Sensor (1 Lux Unsigned)
          result[`illuminance_${channel}`] = buffer.readUInt16BE(offset);
          offset += 2;
          break;
        case 0x66: // Presence Sensor (1)
          result[`presence_${channel}`] = buffer.readUInt8(offset++);
          break;
        case 0x67: // Temperature Sensor (0.1 °C Signed)
          result[`temperature_${channel}`] = +(buffer.readInt16BE(offset) * 0.1).toFixed(1);
          offset += 2;
          break;
        case 0x68: // Humidity Sensor (0.5 % Unsigned)
          result[`humidity_${channel}`] = +(buffer.readUInt8(offset++) * 0.5).toFixed(1);
          break;
        case 0x71: // Accelerometer (0.001 G Signed)
          result[`accelerometer_${channel}`] = {
            x: +(buffer.readInt16BE(offset) * 0.001).toFixed(3),
            y: +(buffer.readInt16BE(offset + 2) * 0.001).toFixed(3),
            z: +(buffer.readInt16BE(offset + 4) * 0.001).toFixed(3),
          };
          offset += 6;
          break;
        case 0x73: // Barometer (0.1 hPa Unsigned)
          result[`barometer_${channel}`] = +(buffer.readUInt16BE(offset) * 0.1).toFixed(1);
          offset += 2;
          break;
        case 0x88: // GPS Location
          {
            const lat = +(buffer.readIntBE(offset, 3) * 0.0001).toFixed(4);
            const lon = +(buffer.readIntBE(offset + 3, 3) * 0.0001).toFixed(4);
            const alt = +(buffer.readIntBE(offset + 6, 3) * 0.01).toFixed(2);
            result[`gps_${channel}`] = { latitude: lat, longitude: lon, altitude: alt };
            offset += 9;
          }
          break;
        default:
          result[`unknown_channel_${channel}_type_${type}`] = buffer.subarray(offset).toString('hex');
          offset = buffer.length; // Stop parsing on unknown
          break;
      }
    }

    return result;
  }

  public static decodeRawHex(buffer: Buffer): Record<string, any> {
    return {
      hex: buffer.toString('hex'),
      length: buffer.length,
      bytes: Array.from(buffer),
    };
  }

  public static decodeJson(raw: string): Record<string, any> {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }

  public static decodeCustomJs(buffer: Buffer, fPort: number, script?: string): Record<string, any> {
    if (!script || !script.trim()) {
      return this.decodeRawHex(buffer);
    }

    try {
      const bytes = Array.from(buffer);
      // Safe function execution wrapper
      const fn = new Function('bytes', 'fPort', `"use strict";\n${script}`);
      const output = fn(bytes, fPort);
      return typeof output === 'object' && output !== null ? output : { result: output };
    } catch (err: any) {
      return {
        error: `Custom Decoder Error: ${err.message}`,
        rawBytes: Array.from(buffer),
      };
    }
  }
}
