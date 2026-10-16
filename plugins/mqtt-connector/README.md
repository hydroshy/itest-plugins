# @universal-iot/plugin-mqtt-connector

> Scalable MQTT Connector Plugin with Offline RingBuffer, Backpressure Management & Dynamic Topic Mapping.

## Features
- **Broker Compatibility**: EMQX, Mosquitto, HiveMQ, AWS IoT Core, Azure IoT Hub.
- **Offline Queuing with Backpressure**: Configurable `drop-oldest`, `drop-newest`, or `reject` policy when disconnected.
- **Dynamic Topic Mapping**: Extracts `:deviceId`, `:tenantId`, or wildcards `+`/`#` to map directly to `UnifiedTelemetry`.
- **Quality of Service**: Supports QoS 0, QoS 1, QoS 2 with automatic replay on reconnection.

## Standalone Development
```bash
npm install
npm run build
npm test
npm run pack
```
