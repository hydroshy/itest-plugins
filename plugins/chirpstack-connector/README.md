# @universal-iot/plugin-chirpstack-connector

> LoRaWAN ChirpStack v3/v4 Protocol Adapter, Webhook Ingestion & Daviteq Gateway Bridge.

## Features
- **ChirpStack v3 & v4 Webhook Support**: Normalizes uplink JSON payloads into standard `UnifiedTelemetry` records.
- **Gateway Statistics Bridge**: Forwards gateway RSSI, SNR, frequency, and LoRa data rate metadata.
- **Bi-directional Integration**: Prepared for downlink scheduling and downlink queue management.

## Standalone Development
```bash
npm install
npm run build
npm test
npm run pack
```
