# @universal-iot/plugin-ttn-connector

> The Things Network (TTN v3) / The Things Stack LoRaWAN Connector Plugin.

## Features
- **TTN v3 Webhook Ingestion**: Receives and decodes Uplink messages from The Things Stack.
- **RF Quality Metadata**: Extracts RSSI, SNR, Channel RSSI, and LoRa Spreading Factor.
- **Payload Decoded & Hex Support**: Supports both pre-decoded objects and raw base64 payload conversion.

## Standalone Development
```bash
npm install
npm run build
npm test
npm run pack
```
