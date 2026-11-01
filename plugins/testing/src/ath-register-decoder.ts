/**
 * ATH Template Modbus Register Decoder & ChirpStack Provisioning Helper
 * Tham khảo template ATH_TEMPLATE.CSV cho cảm biến LoRaWAN ITEST
 */

export interface ATHDeviceRegisters {
  fwCode: string; // Reg 0, 5 regs, string
  fwVersion: string; // Reg 5, 4 regs, string
  hwVersion: string; // Reg 9, 2 regs, string
  lorawanProtocolVersion?: string; // Reg 11, 4 regs, string
  meVersion: string; // Reg 15, 2 regs, string
  devEui: string; // Reg 27, 4 regs, hex (16 chars)
  appEui: string; // Reg 31, 4 regs, hex (16 chars - joinEui)
  appKey: string; // Reg 35, 8 regs, hex (32 chars)
  regionCode: string; // Reg 69, 3 regs, string
  deviceClass: string; // Reg 85, 1 reg, string
  sensorType: number; // Reg 103, 1 reg, uint16
  serialNumber: string; // Reg 259, 9 regs, string
  itemCode: string; // Reg 386, 14 regs, string
  rawMap?: Record<number, string>;
}

export interface ChirpstackDevicePayload {
  device: {
    applicationId: string;
    description: string;
    devEui: string;
    deviceProfileId: string;
    isDisabled: boolean;
    joinEui: string;
    name: string;
    skipFcntCheck: boolean;
  };
  variables?: Record<string, string>;
}

export interface ChirpstackDeviceKeysPayload {
  deviceKeys: {
    devEui: string;
    nwkKey: string;
    appKey: string;
  };
}

export class ATHRegisterDecoder {
  /**
   * Chuyển đổi mảng byte sang chuỗi ASCII hiển thị được
   */
  static bytesToString(bytes: number[] | Uint8Array): string {
    if (!bytes || !bytes.length) return '';
    return String.fromCharCode(
      ...Array.from(bytes).filter((b) => b >= 32 && b <= 126)
    ).trim();
  }

  /**
   * Chuyển đổi mảng byte sang chuỗi HEX viết hoa
   */
  static bytesToHex(bytes: number[] | Uint8Array): string {
    if (!bytes || !bytes.length) return '';
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  /**
   * Chuyển đổi 2 byte sang uint16
   */
  static bytesToUint16(bytes: number[] | Uint8Array): number {
    if (!bytes || bytes.length < 2) return 0;
    return ((bytes[0] & 0xff) << 8) | (bytes[1] & 0xff);
  }

  /**
   * Trích xuất các byte từ rawMemory map (key là địa chỉ thanh ghi, value là [highByte, lowByte])
   */
  static extractBytes(
    rawMemory: Map<number, number[]>,
    startAddr: number,
    numRegs: number
  ): number[] {
    const result: number[] = [];
    for (let r = 0; r < numRegs; r++) {
      const reg = rawMemory.get(startAddr + r);
      if (reg && reg.length >= 2) {
        result.push(reg[0], reg[1]);
      } else {
        result.push(0, 0);
      }
    }
    return result;
  }

  /**
   * Giải mã toàn bộ 13 trường thanh ghi từ bộ nhớ đệm thô (thanh ghi 0..259 và 386)
   */
  static decodeFromMemoryMap(rawMemory: Map<number, number[]>): ATHDeviceRegisters {
    const fwCodeBytes = this.extractBytes(rawMemory, 0, 5);
    const fwVersionBytes = this.extractBytes(rawMemory, 5, 4);
    const hwVersionBytes = this.extractBytes(rawMemory, 9, 2);
    const protocolBytes = this.extractBytes(rawMemory, 11, 4);
    const meVersionBytes = this.extractBytes(rawMemory, 15, 2);
    const devEuiBytes = this.extractBytes(rawMemory, 27, 4);
    const appEuiBytes = this.extractBytes(rawMemory, 31, 4);
    const appKeyBytes = this.extractBytes(rawMemory, 35, 8);
    const regionCodeBytes = this.extractBytes(rawMemory, 69, 3);
    const classBytes = this.extractBytes(rawMemory, 85, 1);
    const sensorTypeBytes = this.extractBytes(rawMemory, 103, 1);
    const serialBytes = this.extractBytes(rawMemory, 259, 9);
    const itemCodeBytes = this.extractBytes(rawMemory, 386, 14);

    return {
      fwCode: this.bytesToString(fwCodeBytes),
      fwVersion: this.bytesToString(fwVersionBytes),
      hwVersion: this.bytesToString(hwVersionBytes),
      lorawanProtocolVersion: this.bytesToString(protocolBytes),
      meVersion: this.bytesToString(meVersionBytes),
      devEui: this.bytesToHex(devEuiBytes),
      appEui: this.bytesToHex(appEuiBytes),
      appKey: this.bytesToHex(appKeyBytes),
      regionCode: this.bytesToString(regionCodeBytes) || 'AS923-1',
      deviceClass: this.bytesToString(classBytes) || 'A',
      sensorType: this.bytesToUint16(sensorTypeBytes),
      serialNumber: this.bytesToString(serialBytes),
      itemCode: this.bytesToString(itemCodeBytes),
    };
  }

  /**
   * Xây dựng danh sách batch chunk đọc nhanh Modbus FC03 tối ưu:
   * Chunk 1: 0..99 (100 thanh ghi)
   * Chunk 2: 100..199 (100 thanh ghi)
   * Chunk 3: 200..267 (68 thanh ghi, bao trùm thanh ghi 259..267 của SERIAL_NUMBER)
   * Chunk 4: 386..399 (14 thanh ghi cho ITEM_CODE)
   */
  static getFastReadChunks(): Array<{ start: number; count: number; description: string }> {
    return [
      { start: 0, count: 100, description: 'Chunk 1: Regs 0..99 (FW, HW, DevEUI, AppEUI, AppKey, Region, Class)' },
      { start: 100, count: 100, description: 'Chunk 2: Regs 100..199 (Sensor Type, RF params)' },
      { start: 200, count: 68, description: 'Chunk 3: Regs 200..267 (Serial Number at 259)' },
      { start: 386, count: 14, description: 'Chunk 4: Regs 386..399 (Item Code at 386)' },
    ];
  }

  /**
   * Helper tạo payload đăng ký ChirpStack (Lần 1 - Device Object)
   */
  static buildChirpstackDevicePayload(params: {
    applicationId: string;
    devEui: string;
    joinEui: string;
    serialNumber: string;
    deviceProfileId: string;
    description?: string;
    skipFcntCheck?: boolean;
    variables?: Record<string, string>;
  }): ChirpstackDevicePayload {
    return {
      device: {
        applicationId: params.applicationId,
        description: params.description || 'ITEST 2.0',
        devEui: params.devEui.toLowerCase(),
        deviceProfileId: params.deviceProfileId,
        isDisabled: false,
        joinEui: params.joinEui.toLowerCase(),
        name: params.serialNumber,
        skipFcntCheck: params.skipFcntCheck ?? true,
      },
      variables: params.variables || {
        source: 'ITEST_DEVICE_TESTING',
        provisionedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Helper tạo payload đăng ký ChirpStack Keys (Lần 2 - Device Keys)
   */
  static buildChirpstackKeysPayload(params: {
    devEui: string;
    appKey: string;
    nwkKey?: string;
  }): ChirpstackDeviceKeysPayload {
    const key = params.appKey.toLowerCase();
    return {
      deviceKeys: {
        devEui: params.devEui.toLowerCase(),
        nwkKey: params.nwkKey ? params.nwkKey.toLowerCase() : key,
        appKey: key,
      },
    };
  }
}
