# @universal-iot/plugin-modbus-rtu

> Industrial Modbus RTU / RS-485 Protocol Plugin for Universal IoT Platform.

## Features
- **Half-Duplex Bus Locking**: Prevents collision on shared RS-485 serial buses with FIFO request queue and $t_{3.5}$ inter-frame silent intervals.
- **Function Codes**: FC01 (Read Coils), FC02 (Read Discrete Inputs), FC03 (Read Holding Registers), FC04 (Read Input Registers), FC05/06 (Write Single), FC15/16 (Write Multiple).
- **Multi-Endian & Word-Swapping**: Big-Endian, Little-Endian, Mid-Big-Endian, Mid-Little-Endian.
- **Data Types**: `int16`, `uint16`, `int32`, `uint32`, `float32`, `float64`, `boolean`, `string`.
- **Dynamic Ingestion**: Hot-pluggable on Backbone via ZIP bundle or GitHub Release URL.

## Configuration Schema
Configurable via `manifest.json`:
- `port`: Serial device (`COM1`, `/dev/ttyUSB0`)
- `baudRate`: 2400 to 115200 (default: 9600)
- `dataBits`: 7 or 8 (default: 8)
- `stopBits`: 1 or 2 (default: 1)
- `parity`: `none`, `even`, `odd` (default: `none`)
- `interFrameDelayMs`: Silent interval duration (default: 3.5ms)
- `timeoutMs`: Request timeout (default: 1000ms)

## Standalone Development & Packaging
```bash
# 1. Install dependencies
npm install

# 2. Build TypeScript to dist/
npm run build

# 3. Run unit tests
npm test

# 4. Package into distribution ZIP for Backbone ingestion
npm run pack
```

## GitHub Polyrepo Setup
1. Create a new GitHub repository: `https://github.com/universal-iot/plugin-modbus-rtu.git`.
2. Push this directory to the repository.
3. Every Git tag `v*.*.*` will automatically trigger GitHub Actions to test, build, and attach `plugin-modbus-rtu-v*.*.*.zip` to the GitHub Release.
