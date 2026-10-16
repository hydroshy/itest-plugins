# @universal-iot/plugin-payload

> Sandboxed JavaScript Payload & Memory Map Decoder Plugin.

## Features
- **Isolated VM Sandbox**: Executes user-provided decoders inside `node:vm` context with strict timeouts and zero host system access.
- **LoRaWAN Decoders**: Automatically detects and executes `decodeUplink({ bytes, fPort })`, `Decoder(bytes, fPort)`, and `decode(payload)`.
- **Modbus Memory Mapping**: Maps raw holding/input register arrays into engineering telemetry values with scale, offset, and word-swapped endianness.

## Standalone Development
```bash
npm install
npm run build
npm test
npm run pack
```
