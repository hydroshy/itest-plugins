"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalDeviceRegistry = exports.InMemoryDeviceRegistry = void 0;
const event_bus_1 = require("@iot-platform/event-bus");
class InMemoryDeviceRegistry {
    eventBus;
    devices = new Map();
    drivers = [];
    constructor(eventBus = event_bus_1.globalEventBus) {
        this.eventBus = eventBus;
    }
    async registerDevice(device) {
        this.devices.set(device.id, { ...device });
        this.eventBus.emit('device:registered', device);
        return device;
    }
    async updateDevice(id, updates) {
        const existing = this.devices.get(id);
        if (!existing)
            return null;
        const updated = { ...existing, ...updates };
        this.devices.set(id, updated);
        this.eventBus.emit('device:updated', updated);
        return updated;
    }
    async getDevice(id) {
        return this.devices.get(id) || null;
    }
    async listDevices(filter) {
        let list = Array.from(this.devices.values());
        if (filter?.tenantId) {
            list = list.filter((d) => d.tenantId === filter.tenantId);
        }
        if (filter?.protocolType) {
            list = list.filter((d) => d.protocolType === filter.protocolType);
        }
        if (filter?.status) {
            list = list.filter((d) => d.status === filter.status);
        }
        return list;
    }
    async deleteDevice(id) {
        const dev = this.devices.get(id);
        if (!dev)
            return false;
        this.devices.delete(id);
        this.eventBus.emit('device:deleted', { id, tenantId: dev.tenantId });
        return true;
    }
    registerDriver(driver) {
        const idx = this.drivers.findIndex((d) => d.driverId === driver.driverId);
        if (idx >= 0) {
            this.drivers[idx] = driver;
        }
        else {
            this.drivers.push(driver);
        }
        this.eventBus.emit('driver:registered', { driverId: driver.driverId, protocol: driver.protocolType });
    }
    getDriver(protocolType, model) {
        return this.drivers.find((d) => {
            if (d.protocolType !== protocolType)
                return false;
            if (model && d.supportedModels && d.supportedModels.length > 0) {
                return d.supportedModels.includes(model) || d.supportedModels.includes('*');
            }
            return true;
        });
    }
}
exports.InMemoryDeviceRegistry = InMemoryDeviceRegistry;
exports.globalDeviceRegistry = new InMemoryDeviceRegistry();
