"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalEventBus = exports.InMemoryEventBus = void 0;
const events_1 = require("events");
class InMemoryEventBus {
    emitter = new events_1.EventEmitter();
    constructor(maxListeners = 100) {
        this.emitter.setMaxListeners(maxListeners);
    }
    emit(event, payload) {
        this.emitter.emit(event, payload);
    }
    on(event, handler) {
        this.emitter.on(event, handler);
    }
    off(event, handler) {
        this.emitter.off(event, handler);
    }
    once(event, handler) {
        this.emitter.once(event, handler);
    }
    clear() {
        this.emitter.removeAllListeners();
    }
}
exports.InMemoryEventBus = InMemoryEventBus;
exports.globalEventBus = new InMemoryEventBus();
