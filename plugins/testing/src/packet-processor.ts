import { DevicePacketDTO, PacketDirection, PacketType } from './testing.types';

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
}
