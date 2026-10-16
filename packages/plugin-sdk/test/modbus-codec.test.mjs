import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateModbusCRC16,
  verifyModbusCRC16,
  appendModbusCRC16,
  buildModbusReadRequest,
  buildModbusWriteSingleRegisterRequest,
  buildModbusWriteMultipleRegistersRequest,
  parseModbusResponse,
  decodeModbusValue,
  encodeModbusValue,
  normalizeModbusAddress,
  ModbusFunctionCode,
  ModbusExceptionCode,
} from '../dist/index.js';

test('Modbus CRC16 calculation and verification', () => {
  // Test frame: Unit 0x01, FC 0x03, Start 0x0000, Count 0x000A -> CRC should be 0xC5CD (or LE 0xCDC5)
  const pdu = Buffer.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a]);
  const crc = calculateModbusCRC16(pdu);
  assert.equal(typeof crc, 'number');

  const fullFrame = appendModbusCRC16(pdu);
  assert.equal(fullFrame.length, 8);
  assert.equal(verifyModbusCRC16(fullFrame), true);

  // Corrupted frame
  const corrupted = Buffer.from(fullFrame);
  corrupted[3] ^= 0xff;
  assert.equal(verifyModbusCRC16(corrupted), false);
});

test('Modbus address normalization', () => {
  assert.deepEqual(normalizeModbusAddress(40001), {
    offset: 0,
    inferredFunction: ModbusFunctionCode.READ_HOLDING_REGISTERS,
  });
  assert.deepEqual(normalizeModbusAddress(40108), {
    offset: 107,
    inferredFunction: ModbusFunctionCode.READ_HOLDING_REGISTERS,
  });
  assert.deepEqual(normalizeModbusAddress(30005), {
    offset: 4,
    inferredFunction: ModbusFunctionCode.READ_INPUT_REGISTERS,
  });
  assert.deepEqual(normalizeModbusAddress(10010), {
    offset: 9,
    inferredFunction: ModbusFunctionCode.READ_DISCRETE_INPUTS,
  });
  assert.deepEqual(normalizeModbusAddress(1), {
    offset: 0,
    inferredFunction: ModbusFunctionCode.READ_COILS,
  });
  assert.deepEqual(normalizeModbusAddress(0), {
    offset: 0,
  });
});

test('Modbus RTU request frame construction and response parsing', () => {
  const req = buildModbusReadRequest(1, ModbusFunctionCode.READ_HOLDING_REGISTERS, 100, 2, false);
  assert.equal(req.length, 8); // 1 (unit) + 1 (fc) + 2 (addr) + 2 (qty) + 2 (crc)
  assert.equal(verifyModbusCRC16(req), true);

  // Mock valid response: Unit 1, FC 03, ByteCount 4, Data [0x00, 0x64, 0x00, 0xC8]
  const respPayload = Buffer.from([0x01, 0x03, 0x04, 0x00, 0x64, 0x00, 0xc8]);
  const fullResp = appendModbusCRC16(respPayload);

  const parsed = parseModbusResponse(fullResp, false);
  assert.equal(parsed.unitId, 1);
  assert.equal(parsed.functionCode, 3);
  assert.equal(parsed.isError, false);
  assert.deepEqual(parsed.data, Buffer.from([0x04, 0x00, 0x64, 0x00, 0xc8]));
});

test('Modbus TCP request and response parsing with MBAP header', () => {
  const req = buildModbusReadRequest(1, ModbusFunctionCode.READ_HOLDING_REGISTERS, 100, 2, true, 42);
  assert.equal(req.length, 12); // 7 (MBAP) + 5 (PDU)
  assert.equal(req.readUInt16BE(0), 42); // Transaction ID
  assert.equal(req.readUInt16BE(2), 0);  // Protocol ID
  assert.equal(req.readUInt8(6), 1);     // Unit ID

  // Mock TCP Response: MBAP (TxID 42, Proto 0, Len 7, Unit 1) + FC 03 + ByteCount 4 + Data
  const tcpResp = Buffer.alloc(13);
  tcpResp.writeUInt16BE(42, 0);
  tcpResp.writeUInt16BE(0, 2);
  tcpResp.writeUInt16BE(7, 4);
  tcpResp.writeUInt8(1, 6);
  tcpResp.writeUInt8(0x03, 7);
  Buffer.from([0x04, 0x01, 0x02, 0x03, 0x04]).copy(tcpResp, 8);

  const parsed = parseModbusResponse(tcpResp, true);
  assert.equal(parsed.transactionId, 42);
  assert.equal(parsed.unitId, 1);
  assert.equal(parsed.functionCode, 3);
  assert.equal(parsed.isError, false);
});

test('Modbus Exception handling', () => {
  // RTU Exception: Unit 1, FC 0x83 (Error on FC 03), ExceptionCode 0x02 (Illegal Data Address)
  const errPayload = Buffer.from([0x01, 0x83, ModbusExceptionCode.ILLEGAL_DATA_ADDRESS]);
  const fullErrFrame = appendModbusCRC16(errPayload);

  const parsed = parseModbusResponse(fullErrFrame, false);
  assert.equal(parsed.isError, true);
  assert.equal(parsed.functionCode, 3);
  assert.equal(parsed.exceptionCode, ModbusExceptionCode.ILLEGAL_DATA_ADDRESS);
});

test('Data type decoding and endianness', () => {
  // 1. uint16 standard BIG_ENDIAN
  const buf16 = Buffer.from([0x04, 0xd2]); // 1234
  assert.equal(decodeModbusValue(buf16, 0, 'uint16'), 1234);

  // 2. uint16 with scale and offset: raw=1234, scale=0.1, offset=-10 => 123.4 - 10 = 113.4
  assert.equal(decodeModbusValue(buf16, 0, 'uint16', 'BIG_ENDIAN', 0.1, -10), 113.4);

  // 3. float32 BIG_ENDIAN (ABCD)
  const floatBuf = Buffer.alloc(4);
  floatBuf.writeFloatBE(123.456, 0);
  const decodedFloat = decodeModbusValue(floatBuf, 0, 'float32', 'BIG_ENDIAN');
  assert.ok(Math.abs(decodedFloat - 123.456) < 0.001);

  // 4. float32 MID_LITTLE_ENDIAN (CDAB - Word Swap, very common in industrial meters like Schneider/ABB)
  const wordSwappedFloat = Buffer.alloc(4);
  wordSwappedFloat[0] = floatBuf[2];
  wordSwappedFloat[1] = floatBuf[3];
  wordSwappedFloat[2] = floatBuf[0];
  wordSwappedFloat[3] = floatBuf[1];
  const decodedWordSwapped = decodeModbusValue(wordSwappedFloat, 0, 'float32', 'MID_LITTLE_ENDIAN');
  assert.ok(Math.abs(decodedWordSwapped - 123.456) < 0.001);

  // 5. boolean / coil
  const coilBuf = Buffer.from([0x01]);
  assert.equal(decodeModbusValue(coilBuf, 0, 'boolean'), true);

  // 6. bitfield (16 bits)
  const bitfieldBuf = Buffer.from([0x00, 0x05]); // 0x0005 -> bit 0 and bit 2 are 1
  const bits = decodeModbusValue(bitfieldBuf, 0, 'bitfield', 'BIG_ENDIAN');
  assert.equal(bits[0], true);
  assert.equal(bits[1], false);
  assert.equal(bits[2], true);
  assert.equal(bits[3], false);
});

test('Data type encoding back to buffer', () => {
  const enc16 = encodeModbusValue(1234, 'uint16');
  assert.equal(enc16.readUInt16BE(0), 1234);

  const encFloat = encodeModbusValue(56.78, 'float32', 'BIG_ENDIAN');
  assert.ok(Math.abs(encFloat.readFloatBE(0) - 56.78) < 0.001);

  const coilTrue = encodeModbusValue(true, 'boolean');
  assert.equal(coilTrue.readUInt16BE(0), 0xff00);

  const coilFalse = encodeModbusValue(false, 'boolean');
  assert.equal(coilFalse.readUInt16BE(0), 0x0000);
});
