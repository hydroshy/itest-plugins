"use strict";
/**
 * Shared Modbus RTU / TCP Codec Engine
 * Handles PDU Encoding/Decoding, CRC16, MBAP Headers, Endianness, Word/Byte Swapping,
 * IEEE-754 Floats, 16/32/64-bit Integers, Scaling, Offset & Reference Normalization.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModbusExceptionCode = exports.ModbusFunctionCode = void 0;
exports.calculateModbusCRC16 = calculateModbusCRC16;
exports.verifyModbusCRC16 = verifyModbusCRC16;
exports.appendModbusCRC16 = appendModbusCRC16;
exports.buildMbapHeader = buildMbapHeader;
exports.parseMbapHeader = parseMbapHeader;
exports.normalizeModbusAddress = normalizeModbusAddress;
exports.buildModbusReadRequest = buildModbusReadRequest;
exports.buildModbusWriteSingleRegisterRequest = buildModbusWriteSingleRegisterRequest;
exports.buildModbusWriteMultipleRegistersRequest = buildModbusWriteMultipleRegistersRequest;
exports.parseModbusResponse = parseModbusResponse;
exports.decodeModbusValue = decodeModbusValue;
exports.encodeModbusValue = encodeModbusValue;
var ModbusFunctionCode;
(function (ModbusFunctionCode) {
    ModbusFunctionCode[ModbusFunctionCode["READ_COILS"] = 1] = "READ_COILS";
    ModbusFunctionCode[ModbusFunctionCode["READ_DISCRETE_INPUTS"] = 2] = "READ_DISCRETE_INPUTS";
    ModbusFunctionCode[ModbusFunctionCode["READ_HOLDING_REGISTERS"] = 3] = "READ_HOLDING_REGISTERS";
    ModbusFunctionCode[ModbusFunctionCode["READ_INPUT_REGISTERS"] = 4] = "READ_INPUT_REGISTERS";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_SINGLE_COIL"] = 5] = "WRITE_SINGLE_COIL";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_SINGLE_REGISTER"] = 6] = "WRITE_SINGLE_REGISTER";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_MULTIPLE_COILS"] = 15] = "WRITE_MULTIPLE_COILS";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_MULTIPLE_REGISTERS"] = 16] = "WRITE_MULTIPLE_REGISTERS";
})(ModbusFunctionCode || (exports.ModbusFunctionCode = ModbusFunctionCode = {}));
var ModbusExceptionCode;
(function (ModbusExceptionCode) {
    ModbusExceptionCode[ModbusExceptionCode["ILLEGAL_FUNCTION"] = 1] = "ILLEGAL_FUNCTION";
    ModbusExceptionCode[ModbusExceptionCode["ILLEGAL_DATA_ADDRESS"] = 2] = "ILLEGAL_DATA_ADDRESS";
    ModbusExceptionCode[ModbusExceptionCode["ILLEGAL_DATA_VALUE"] = 3] = "ILLEGAL_DATA_VALUE";
    ModbusExceptionCode[ModbusExceptionCode["SERVER_DEVICE_FAILURE"] = 4] = "SERVER_DEVICE_FAILURE";
    ModbusExceptionCode[ModbusExceptionCode["ACKNOWLEDGE"] = 5] = "ACKNOWLEDGE";
    ModbusExceptionCode[ModbusExceptionCode["SERVER_DEVICE_BUSY"] = 6] = "SERVER_DEVICE_BUSY";
    ModbusExceptionCode[ModbusExceptionCode["MEMORY_PARITY_ERROR"] = 8] = "MEMORY_PARITY_ERROR";
    ModbusExceptionCode[ModbusExceptionCode["GATEWAY_PATH_UNAVAILABLE"] = 10] = "GATEWAY_PATH_UNAVAILABLE";
    ModbusExceptionCode[ModbusExceptionCode["GATEWAY_TARGET_DEVICE_FAILED"] = 11] = "GATEWAY_TARGET_DEVICE_FAILED";
})(ModbusExceptionCode || (exports.ModbusExceptionCode = ModbusExceptionCode = {}));
/**
 * Standard Modbus CRC16 Calculation (Polynomial: 0xA001, Init: 0xFFFF)
 */
function calculateModbusCRC16(buffer) {
    let crc = 0xffff;
    for (let i = 0; i < buffer.length; i++) {
        crc ^= buffer[i];
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x0001) !== 0) {
                crc = (crc >> 1) ^ 0xa001;
            }
            else {
                crc = crc >> 1;
            }
        }
    }
    return crc;
}
function verifyModbusCRC16(frame) {
    if (frame.length < 3)
        return false;
    const payload = frame.subarray(0, frame.length - 2);
    const expectedCrc = calculateModbusCRC16(payload);
    const actualCrc = frame[frame.length - 2] | (frame[frame.length - 1] << 8); // CRC is Little-Endian in RTU
    return expectedCrc === actualCrc;
}
function appendModbusCRC16(payload) {
    const crc = calculateModbusCRC16(payload);
    const result = Buffer.alloc(payload.length + 2);
    payload.copy(result, 0);
    result.writeUInt16LE(crc, payload.length);
    return result;
}
/**
 * MBAP Header for Modbus TCP (7 bytes)
 */
function buildMbapHeader(transactionId, unitId, pduLength) {
    const header = Buffer.alloc(7);
    header.writeUInt16BE(transactionId & 0xffff, 0); // Transaction ID
    header.writeUInt16BE(0x0000, 2); // Protocol ID: 0 (Modbus)
    header.writeUInt16BE((pduLength + 1) & 0xffff, 4); // Length: PDU length + 1 (for Unit ID)
    header.writeUInt8(unitId & 0xff, 6); // Unit ID
    return header;
}
function parseMbapHeader(buffer) {
    if (buffer.length < 7) {
        throw new Error(`MBAP buffer too short: ${buffer.length} < 7`);
    }
    return {
        transactionId: buffer.readUInt16BE(0),
        protocolId: buffer.readUInt16BE(2),
        length: buffer.readUInt16BE(4),
        unitId: buffer.readUInt8(6),
    };
}
/**
 * Normalizes Modbus reference notation (e.g. 40001 -> 0, 30005 -> 4) or 0-based offset
 */
function normalizeModbusAddress(address) {
    if (address >= 40001 && address <= 49999) {
        return { offset: address - 40001, inferredFunction: ModbusFunctionCode.READ_HOLDING_REGISTERS };
    }
    if (address >= 30001 && address <= 39999) {
        return { offset: address - 30001, inferredFunction: ModbusFunctionCode.READ_INPUT_REGISTERS };
    }
    if (address >= 10001 && address <= 19999) {
        return { offset: address - 10001, inferredFunction: ModbusFunctionCode.READ_DISCRETE_INPUTS };
    }
    if (address >= 1 && address <= 9999) {
        return { offset: address - 1, inferredFunction: ModbusFunctionCode.READ_COILS };
    }
    return { offset: address };
}
/**
 * Build Request Frame (RTU or TCP)
 */
function buildModbusReadRequest(unitId, functionCode, startAddress, quantity, isTcp = false, transactionId = 1) {
    const pdu = Buffer.alloc(5);
    pdu.writeUInt8(functionCode, 0);
    pdu.writeUInt16BE(startAddress, 1);
    pdu.writeUInt16BE(quantity, 3);
    if (isTcp) {
        const mbap = buildMbapHeader(transactionId, unitId, pdu.length);
        return Buffer.concat([mbap, pdu]);
    }
    else {
        const adu = Buffer.alloc(6);
        adu.writeUInt8(unitId, 0);
        pdu.copy(adu, 1);
        return appendModbusCRC16(adu);
    }
}
function buildModbusWriteSingleRegisterRequest(unitId, registerAddress, value, isTcp = false, transactionId = 1) {
    const pdu = Buffer.alloc(5);
    pdu.writeUInt8(ModbusFunctionCode.WRITE_SINGLE_REGISTER, 0);
    pdu.writeUInt16BE(registerAddress, 1);
    pdu.writeUInt16BE(value & 0xffff, 3);
    if (isTcp) {
        const mbap = buildMbapHeader(transactionId, unitId, pdu.length);
        return Buffer.concat([mbap, pdu]);
    }
    else {
        const adu = Buffer.alloc(6);
        adu.writeUInt8(unitId, 0);
        pdu.copy(adu, 1);
        return appendModbusCRC16(adu);
    }
}
function buildModbusWriteMultipleRegistersRequest(unitId, startAddress, registerValues, isTcp = false, transactionId = 1) {
    const byteCount = registerValues.length * 2;
    const pdu = Buffer.alloc(6 + byteCount);
    pdu.writeUInt8(ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS, 0);
    pdu.writeUInt16BE(startAddress, 1);
    pdu.writeUInt16BE(registerValues.length, 3);
    pdu.writeUInt8(byteCount, 5);
    for (let i = 0; i < registerValues.length; i++) {
        pdu.writeUInt16BE(registerValues[i] & 0xffff, 6 + i * 2);
    }
    if (isTcp) {
        const mbap = buildMbapHeader(transactionId, unitId, pdu.length);
        return Buffer.concat([mbap, pdu]);
    }
    else {
        const adu = Buffer.alloc(1 + pdu.length);
        adu.writeUInt8(unitId, 0);
        pdu.copy(adu, 1);
        return appendModbusCRC16(adu);
    }
}
function parseModbusResponse(response, isTcp = false) {
    if (isTcp) {
        if (response.length < 9) {
            throw new Error(`Modbus TCP response too short: ${response.length} bytes`);
        }
        const mbap = parseMbapHeader(response);
        const pdu = response.subarray(7);
        const functionCode = pdu.readUInt8(0);
        const isError = (functionCode & 0x80) !== 0;
        if (isError) {
            return {
                unitId: mbap.unitId,
                functionCode: functionCode & 0x7f,
                data: Buffer.alloc(0),
                isError: true,
                exceptionCode: pdu.readUInt8(1),
                transactionId: mbap.transactionId,
            };
        }
        return {
            unitId: mbap.unitId,
            functionCode,
            data: pdu.subarray(1),
            isError: false,
            transactionId: mbap.transactionId,
        };
    }
    else {
        if (response.length < 5) {
            throw new Error(`Modbus RTU response too short: ${response.length} bytes`);
        }
        if (!verifyModbusCRC16(response)) {
            throw new Error(`Modbus RTU CRC verification failed for frame length ${response.length}`);
        }
        const unitId = response.readUInt8(0);
        const functionCode = response.readUInt8(1);
        const isError = (functionCode & 0x80) !== 0;
        const pduData = response.subarray(2, response.length - 2);
        if (isError) {
            return {
                unitId,
                functionCode: functionCode & 0x7f,
                data: Buffer.alloc(0),
                isError: true,
                exceptionCode: pduData.readUInt8(0),
            };
        }
        return {
            unitId,
            functionCode,
            data: pduData,
            isError: false,
        };
    }
}
/**
 * Endianness and Word/Byte Swapper
 */
function applyEndianness(buf, endianness) {
    const result = Buffer.from(buf);
    const len = result.length;
    if (len === 2) {
        if (endianness === 'LITTLE_ENDIAN' || endianness === 'LITTLE_ENDIAN_BYTE_SWAP') {
            const b0 = result[0];
            result[0] = result[1];
            result[1] = b0;
        }
        return result;
    }
    if (len === 4) {
        // ABCD
        const [a, b, c, d] = [result[0], result[1], result[2], result[3]];
        switch (endianness) {
            case 'BIG_ENDIAN': // ABCD
                break;
            case 'LITTLE_ENDIAN': // BADC (byte swap)
                result[0] = b;
                result[1] = a;
                result[2] = d;
                result[3] = c;
                break;
            case 'MID_LITTLE_ENDIAN': // CDAB (word swap)
                result[0] = c;
                result[1] = d;
                result[2] = a;
                result[3] = b;
                break;
            case 'LITTLE_ENDIAN_BYTE_SWAP': // DCBA (both)
                result[0] = d;
                result[1] = c;
                result[2] = b;
                result[3] = a;
                break;
        }
        return result;
    }
    if (len === 8) {
        if (endianness === 'LITTLE_ENDIAN' || endianness === 'LITTLE_ENDIAN_BYTE_SWAP') {
            result.reverse();
        }
    }
    return result;
}
/**
 * Decode register value with scaling, offset, endianness
 */
function decodeModbusValue(buffer, byteOffset, dataType, endianness = 'BIG_ENDIAN', scale = 1, offset = 0, lengthBytes = 2) {
    if (byteOffset + 1 > buffer.length) {
        throw new Error(`Offset ${byteOffset} exceeds buffer length ${buffer.length}`);
    }
    let rawValue = 0;
    switch (dataType) {
        case 'boolean': {
            rawValue = buffer.readUInt8(byteOffset) !== 0;
            return rawValue;
        }
        case 'uint16': {
            const slice = applyEndianness(buffer.subarray(byteOffset, byteOffset + 2), endianness);
            rawValue = slice.readUInt16BE(0);
            break;
        }
        case 'int16': {
            const slice = applyEndianness(buffer.subarray(byteOffset, byteOffset + 2), endianness);
            rawValue = slice.readInt16BE(0);
            break;
        }
        case 'uint32': {
            const slice = applyEndianness(buffer.subarray(byteOffset, byteOffset + 4), endianness);
            rawValue = slice.readUInt32BE(0);
            break;
        }
        case 'int32': {
            const slice = applyEndianness(buffer.subarray(byteOffset, byteOffset + 4), endianness);
            rawValue = slice.readInt32BE(0);
            break;
        }
        case 'float32': {
            const slice = applyEndianness(buffer.subarray(byteOffset, byteOffset + 4), endianness);
            rawValue = slice.readFloatBE(0);
            break;
        }
        case 'float64': {
            const slice = applyEndianness(buffer.subarray(byteOffset, byteOffset + 8), endianness);
            rawValue = slice.readDoubleBE(0);
            break;
        }
        case 'string': {
            const slice = buffer.subarray(byteOffset, byteOffset + lengthBytes);
            return slice.toString('utf8').replace(/\0/g, '').trim();
        }
        case 'bitfield': {
            const slice = applyEndianness(buffer.subarray(byteOffset, byteOffset + 2), endianness);
            const val = slice.readUInt16BE(0);
            const bits = [];
            for (let i = 0; i < 16; i++) {
                bits.push(((val >> i) & 1) === 1);
            }
            return bits;
        }
        default:
            throw new Error(`Unsupported Modbus data type: ${dataType}`);
    }
    if (typeof rawValue === 'number') {
        return Number((rawValue * scale + offset).toFixed(6));
    }
    return rawValue;
}
/**
 * Encode engineering value back into Modbus Register Buffer
 */
function encodeModbusValue(value, dataType, endianness = 'BIG_ENDIAN', scale = 1, offset = 0) {
    let rawNumber = typeof value === 'number' ? (value - offset) / scale : 0;
    switch (dataType) {
        case 'boolean': {
            const b = Buffer.alloc(2);
            b.writeUInt16BE(value ? 0xff00 : 0x0000, 0); // Modbus FC05 coil standard
            return b;
        }
        case 'uint16': {
            const b = Buffer.alloc(2);
            b.writeUInt16BE(Math.round(rawNumber) & 0xffff, 0);
            return applyEndianness(b, endianness);
        }
        case 'int16': {
            const b = Buffer.alloc(2);
            b.writeInt16BE(Math.round(rawNumber), 0);
            return applyEndianness(b, endianness);
        }
        case 'uint32': {
            const b = Buffer.alloc(4);
            b.writeUInt32BE(Math.round(rawNumber) >>> 0, 0);
            return applyEndianness(b, endianness);
        }
        case 'int32': {
            const b = Buffer.alloc(4);
            b.writeInt32BE(Math.round(rawNumber), 0);
            return applyEndianness(b, endianness);
        }
        case 'float32': {
            const b = Buffer.alloc(4);
            b.writeFloatBE(rawNumber, 0);
            return applyEndianness(b, endianness);
        }
        case 'float64': {
            const b = Buffer.alloc(8);
            b.writeDoubleBE(rawNumber, 0);
            return applyEndianness(b, endianness);
        }
        case 'string': {
            const str = String(value);
            const b = Buffer.from(str, 'utf8');
            if (b.length % 2 !== 0) {
                return Buffer.concat([b, Buffer.from([0x00])]); // Pad to word
            }
            return b;
        }
        default:
            throw new Error(`Unsupported encode Modbus data type: ${dataType}`);
    }
}
