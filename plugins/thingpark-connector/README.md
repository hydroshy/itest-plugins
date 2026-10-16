# @universal-iot/plugin-thingpark-connector

> Actility ThingPark Wireless Enterprise LoRaWAN Network Server Connector Plugin.

## Features
- **Actility ThingPark DX Core Support**: Ingests uplink telemetry from enterprise ThingPark Wireless servers.
- **RF Metrics Extraction**: Normalizes `LrrRSSI`, `LrrSNR`, `Frequency`, and `SpFact`.
- **Payload Decoding Bridge**: Extracts raw hex payloads and routes them to the payload decoder.

## Standalone Development
```bash
npm install
npm run build
npm test
npm run pack
```
