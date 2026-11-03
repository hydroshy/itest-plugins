import {
  ChirpStackHttpUplinkDTO,
  DevicePacketDTO,
  PacketDirection,
  PacketType,
  StandardDevicePayloadDTO,
} from './testing.types';

export class PacketProcessor {
  /**
   * Chuẩn hóa raw payload từ base64 sang hex hoặc ngược lại
   */
  public static toHex(raw: string): string {
    const trimmed = raw.trim();
    // Nếu là hex hợp lệ
    if (/^[0-9a-fA-F]+$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    // Nếu là base64
    try {
      const buf = Buffer.from(trimmed, 'base64');
      return buf.toString('hex').toUpperCase();
    } catch {
      return trimmed;
    }
  }

  /**
   * Giải mã payload linh hoạt (Hỗ trợ nhị phân tiêu chuẩn IoT và JSON)
   */
  public static decodePayload(
    rawPayload: string,
    fPort?: number,
    customDecoder?: (buf: Buffer, port?: number) => Record<string, any>
  ): Record<string, any> {
    const hex = this.toHex(rawPayload);
    const buf = Buffer.from(hex, 'hex');

    if (customDecoder) {
      try {
        return customDecoder(buf, fPort);
      } catch (err) {
        return { decode_error: String(err), hex_dump: hex };
      }
    }

    // Nếu payload là JSON text
    try {
      const text = buf.toString('utf8');
      if (text.startsWith('{') && text.endsWith('}')) {
        return JSON.parse(text);
      }
    } catch {
      // Bỏ qua nếu không phải utf-8 text
    }

    // Bộ giải mã mẫu theo cổng fPort hoặc cấu trúc thông số IoT phổ biến
    const decoded: Record<string, any> = {
      length_bytes: buf.length,
      hex: hex,
    };

    if (buf.length >= 2) {
      // Giả lập đọc mẫu battery / voltage (byte đầu)
      const byte0 = buf.readUInt8(0);
      decoded.battery_percent = Math.min(100, Math.round((byte0 / 255) * 100));
    }

    if (buf.length >= 4) {
      // Giả lập đọc giá trị đo lường 2 bytes
      const measurement = buf.readInt16BE(1);
      decoded.metric_value = measurement / 10.0;
    }

    if (buf.length >= 8) {
      // Đọc counter 4 bytes (đồng hồ xung/nước)
      decoded.counter = buf.readUInt32BE(buf.length - 4);
    }

    return decoded;
  }

  /**
   * Xử lý gói tin đầu vào và sinh đầy đủ DTO sẵn sàng lưu DB
   */
  public static processIncomingPacket(packet: {
    device_id?: string;
    network_id: string;
    raw_payload: string;
    f_port?: number;
    f_cnt?: number;
    direction?: PacketDirection;
    packet_type?: PacketType;
    rf_info?: {
      rssi?: number;
      snr?: number;
      frequency?: number;
      gateway_id?: string;
      channel?: number;
    };
    custom_decoder?: (buf: Buffer, port?: number) => Record<string, any>;
  }): DevicePacketDTO {
    const hexPayload = this.toHex(packet.raw_payload);
    const decoded = this.decodePayload(hexPayload, packet.f_port, packet.custom_decoder);

    return {
      device_id: packet.device_id,
      network_id: packet.network_id.toUpperCase(),
      raw_payload: hexPayload,
      decoded_payload: decoded,
      rf_info: packet.rf_info,
      f_cnt: packet.f_cnt,
      f_port: packet.f_port,
      direction: packet.direction || 'uplink',
      packet_type: packet.packet_type || 'UNCONFIRMED_DATA_UP',
      received_at: new Date(),
    };
  }

  /**
   * Parse ChirpStack v4/v3 HTTP Integration uplink webhook payload:
   * Extracts standard unified RF parameters (RSSI, SNR, FCNT, SF, FREQUENCY, RAW_PAYLOAD)
   * and invokes decoder callback or built-in decoder for dynamic sensor payload fields.
   */
  public static async parseChirpStackHttpUplink(
    payload: ChirpStackHttpUplinkDTO,
    decoderCallback?: (
      rawHex: string,
      fPort?: number,
      metadata?: Record<string, any>
    ) => Promise<Record<string, any>> | Record<string, any>
  ): Promise<StandardDevicePayloadDTO> {
    const rawData = payload.data || '';
    const rawPayloadHex = this.toHex(rawData);

    // Extract RF metadata uniformly
    const primaryRx = (payload.rxInfo && payload.rxInfo.length > 0) ? payload.rxInfo[0] : undefined;
    const rssi = primaryRx?.rssi !== undefined ? Number(primaryRx.rssi) : -999;
    const snr = primaryRx?.snr !== undefined
      ? Number(primaryRx.snr)
      : (primaryRx?.loRaSNR !== undefined ? Number(primaryRx.loRaSNR) : 0);

    const fCnt = payload.fCnt !== undefined ? Number(payload.fCnt) : 0;
    const fPort = payload.fPort !== undefined ? Number(payload.fPort) : 1;

    const sf =
      payload.txInfo?.modulation?.lora?.spreadingFactor !== undefined
        ? Number(payload.txInfo.modulation.lora.spreadingFactor)
        : (payload.txInfo?.dataRate?.spreadFactor !== undefined
            ? Number(payload.txInfo.dataRate.spreadFactor)
            : 7);

    const frequency = payload.txInfo?.frequency !== undefined ? Number(payload.txInfo.frequency) : 0;

    const devEui = (
      payload.deviceInfo?.devEui ||
      payload.devEUI ||
      payload.devEui ||
      ''
    ).trim().toUpperCase();

    const deviceName = payload.deviceInfo?.deviceName || payload.deviceName || devEui;
    const applicationId = payload.deviceInfo?.applicationId || payload.applicationID || '';
    const receivedAt = payload.time || new Date().toISOString();

    let decodedPayload: Record<string, any> = {};

    if (decoderCallback && rawPayloadHex) {
      try {
        decodedPayload = await decoderCallback(rawPayloadHex, fPort, {
          devEui,
          deviceName,
          applicationId,
          fCnt,
          rssi,
          snr,
          sf,
          frequency,
        });
      } catch (err: any) {
        decodedPayload = {
          decode_error: String(err.message || err),
          raw_hex: rawPayloadHex,
        };
      }
    } else if (rawPayloadHex) {
      decodedPayload = this.decodePayload(rawPayloadHex, fPort);
    }

    return {
      dev_eui: devEui,
      device_name: deviceName,
      application_id: applicationId,
      f_cnt: fCnt,
      f_port: fPort,
      rssi,
      snr,
      sf,
      frequency,
      raw_payload: rawPayloadHex,
      raw_payload_base64: rawData,
      decoded_payload: decodedPayload,
      received_at: receivedAt,
    };
  }
}
