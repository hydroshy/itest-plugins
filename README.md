# Universal Industrial IoT - Modular Plugin & Infrastructure Architecture

Hệ thống đã được phân tách và tái cấu trúc hoàn chỉnh từ hệ thống đơn khối sang mô hình **Micro-Kernel + Modular Plugins & Packages**, bảo toàn tính toàn vẹn 100% của mã nguồn, schema isolation, và khả năng mở rộng cắm rút (hot-swappable).

---

## 1. Kiến trúc phân tách (Architecture Decoupling)

* **Core Backbone (`/dvt`)**: Máy chủ lõi NestJS xử lý Identity & Access Management (RBAC), Multi-tenant Database Connection Routing, Global Health Check, và các Facade Controller/Service ủy quyền sang Plugin Layer.
* **Core Packages (`/plugin/packages`)**: Các gói hạ tầng dùng chung độc lập, được đóng gói theo chuẩn SDK:
  1. `plugin-sdk`: Định nghĩa Interfaces, Lifecycle (`init`, `start`, `stop`, `destroy`), Unified Types (`UnifiedTelemetry`, `UnifiedDevice`), Event Contracts.
  2. `event-bus`: Hệ thống truyền thông Distributed In-Memory / Broker PubSub theo pattern Reactive Observer, hỗ trợ wildcard topics.
  3. `device-registry`: Quản lý định danh thống nhất thiết bị IoT, trạng thái kết nối, cấu hình gateway & metadata.
  4. `connection-manager`: Quản lý pool kết nối mạng (Socket, TCP, Serial, MQTT, HTTP Webhook) với heartbeat và retry backoff tự động.
  5. `telemetry-engine`: Động cơ xử lý chuỗi thời gian, chuẩn hóa telemetry, deduplication, buffer streaming và metrics caching.
* **Plugins Matrix (`/plugin/plugins`)**: Hệ thống plugin độc lập theo từng miền nghiệp vụ:

---

## 2. Danh mục Modules & Plugins đã phân tách

### A. Giao thức & Kết nối (Protocol & Network Server Connectors)
| Plugin | Mô tả & Chức năng | Capabilities |
| :--- | :--- | :--- |
| **`modbus-rtu`** | Giao thức Modbus RTU / RS485 | Half-Duplex Lock, CRC16, Serial Port Pool |
| **`modbus-tcp`** | Giao thức Modbus TCP / Industrial Ethernet | MBAP Header, Transaction Correlation |
| **`mqtt-connector`** | Giao thức MQTT v3.1.1 & v5 Client | Dynamic Topic Subscription, QoS, Payload Bridge |
| **`chirpstack-connector`** | Bộ kết nối LoRaWAN ChirpStack v3/v4 & Gateway Daviteq (`https://iengineering.daviteq.com/chirpstack/gateway`) | Uplink/Downlink normalization, Gateway RSSI/SNR metrics |
| **`globiots-connector`** | Bộ kết nối Globiots Cloud LoRa Service (`https://resources.globiots.com/rest/api/v1/lora-service/uplink-message`) | Ingestion webhook, bi-directional uplink forwarding |
| **`thingpark-connector`** | Bộ kết nối Actility ThingPark Wireless LoRaWAN Server | Geo-location, DevEUI framing, Uplink/Downlink bridge |

### B. Xử lý dữ liệu & Định dạng (Data Processing & Parsing)
| Plugin | Mô tả & Chức năng | Capabilities |
| :--- | :--- | :--- |
| **`payload`** | Bộ giải mã Payload nhị phân/HEX và ánh xạ Modbus Register Mapping | Hex Decoder, Dynamic Javascript Sandbox Decoder |
| **`traceability`** | Quản lý kiểm thử QA/QC, truy xuất nguồn gốc thiết bị, phiên test & bằng chứng | Test Assertion, Packet Logs, Calibration Evidence |

### C. Ứng dụng & Nghiệp vụ (Application & Management Plugins)
| Plugin | Mô tả & Chức năng | Capabilities |
| :--- | :--- | :--- |
| **`device-profile-manager`** | Quản lý Profile thiết bị, cấu hình thanh ghi mẫu & kịch bản giải mã | Profile CRUD, Sandbox Script Runner |
| **`modbus-register-explorer`**| Công cụ tương tác & chuẩn đoán thanh ghi Modbus, tra cứu template | Batch Register Polling, Register Map Presets |
| **`mqtt-topic-explorer`** | Giám sát cây topic MQTT thời gian thực, debug payload & test publish | Topic Tree Hierarchy, Real-time Inspector |
| **`telemetry-dashboard`** | HMI Studio canvas, đồ thị chuỗi thời gian, đồng hồ đo & widget điều khiển | Real-time Widgets, Gauge, Timeseries Charts |
| **`alarm-engine`** | Động cơ cảnh báo công nghiệp, giám sát ngưỡng & quy trình xác nhận cảnh báo | Threshold Rules, Severity Dispatch, Acknowledgment |
| **`reporting`** | Tổng hợp dữ liệu viễn trắc, xuất báo cáo CSV/JSON/PDF & Audit Trail | Telemetry Export, Compliance Audit Trail |
| **`test-automation`** | Kịch bản kiểm thử tự động, giả lập thiết bị (Mock Publisher) & lịch sử test | Automated Step Runner, Execution History |
| **`final-config-manager`** | Quản lý cấu hình xuất xưởng hệ thống, thông số môi trường & validate schema | System Config Import/Export, Schema Validation |

---

## 3. Bản đồ Database Schema Isolation

| Lớp | Schema PostgreSQL | Bảng dữ liệu chính |
| :--- | :--- | :--- |
| **Core Backbone** | `public` | `unified_devices`, `unified_telemetry`, `core_plugins`, `tenants`, `users` |
| **Traceability Plugin** | `plugin_traceability` | `device_tested`, `test_templates`, `test_assertions`, `test_sessions`, `test_device_runs`, `test_evidence`, `test_packet_logs`, `test_result`, `final_config_presets`, `final_config_regs`, `final_config_sn`, `final_config_regs_sn` |
| **Payload Plugin** | `plugin_payload` | `modbus_presets`, `memmap_payload`, `memmap_regs` |
| **Reporting / Audit** | `plugin_reporting` | `audit_logs`, `scheduled_reports` |
| **Alarm Engine** | `plugin_alarm` | `alarm_rules`, `active_alarms`, `alarm_history` |

---

## 4. Bảo đảm tính toàn vẹn (Code Integrity Guarantees)

1. **Không phá vỡ API hiện hữu**: Các controller và service gốc trong `dvt` (`c-modules`, `lorawan`, `network-servers`) được giữ nguyên chữ ký (Signature) và route URL để tương thích 100% với Frontend Web GUI hiện tại, đồng thời hoạt động như một Facade Adapter kết nối tới các Plugin tương ứng.
2. **Quy chuẩn Plugin**: Mỗi plugin độc lập chứa đầy đủ `manifest.json`, `package.json`, `tsconfig.json` và triển khai `IPluginLifecycle` (`init`, `start`, `stop`, `destroy`).
3. **Sandbox & Safety**: Các tác vụ giải mã script (như Javascript Payload Decoder) chạy trong môi trường sandbox cô lập với timeout tối đa 1500ms, ngăn chặn nguy cơ tắc nghẽn Event Loop.
