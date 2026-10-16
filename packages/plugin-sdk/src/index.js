"use strict";
/**
 * Universal Industrial IoT - Plugin SDK Core Contracts
 * Platform Architecture Standard Specification
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtocolError = void 0;
class ProtocolError extends Error {
    code;
    protocol;
    target;
    isRetryable;
    raw;
    timestamp;
    constructor(code, message, protocol, target, isRetryable = false, raw) {
        super(`[${protocol}] ${code}: ${message}`);
        this.code = code;
        this.protocol = protocol;
        this.target = target;
        this.isRetryable = isRetryable;
        this.raw = raw;
        this.name = 'ProtocolError';
        this.timestamp = new Date();
    }
}
exports.ProtocolError = ProtocolError;
// ==========================================
// 9. MODBUS SHARED CODECS & HELPERS
// ==========================================
__exportStar(require("./modbus-codec"), exports);
