# @universal-iot/plugin-modbus-tcp

> Industrial Modbus TCP Protocol Plugin with MBAP Header Framing, Connection Pooling & Defragmentation.

## Features
- **MBAP Framing**: 7-byte Modbus Application Protocol header with async Transaction ID correlation.
- **Connection Pooling**: Reuses established TCP sockets across devices sharing the same gateway endpoint.
- **TCP Stream Reassembly**: Automatically buffers fragmented packets until complete Modbus frames are formed.
- **Auto-Reconnect**: Robust reconnection and health checking for field gateways and PLCs.

## Configuration Schema
- `host`: Gateway IP / Hostname (default: `127.0.0.1`)
- `port`: TCP Port (default: `502`)
- `unitId`: Modbus Slave / Unit ID (default: `1`)
- `timeoutMs`: Response timeout (default: `3000ms`)
- `maxConnections`: Maximum pooled sockets (default: `10`)

## Standalone Development
```bash
npm install
npm run build
npm test
npm run pack
```
