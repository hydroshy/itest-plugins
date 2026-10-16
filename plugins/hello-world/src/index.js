"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HelloWorldPlugin = void 0;
exports.createPluginInstance = createPluginInstance;
class HelloWorldPlugin {
    context;
    unsubscribeEvents;
    startedAt;
    isRunning = false;
    async init(context) {
        this.context = context;
        this.context.logger.info(`[HelloWorldPlugin] Initializing plugin: ${context.manifest.id} v${context.manifest.version}`);
        // Register permissions declared in manifest
        if (context.manifest.permissions && context.permissions) {
            for (const perm of context.manifest.permissions) {
                if (typeof perm !== 'string') {
                    context.permissions.registerPermission(perm);
                }
            }
        }
        // Register exposed service
        const greetingPrefix = (context.config && context.config.greeting) || 'Hello Industrial IoT';
        const helloService = {
            greet: (name) => `${greetingPrefix}, ${name}!`,
            getStatus: () => ({
                active: this.isRunning,
                uptimeSeconds: this.startedAt ? Math.floor((Date.now() - this.startedAt.getTime()) / 1000) : 0,
            }),
        };
        context.services.registerService('helloService', helloService, {
            version: '1.0.0',
            description: 'Provides greeting functionality for Universal IoT Backbone',
        });
        // Subscribe to Event Bus
        this.unsubscribeEvents = context.eventBus.subscribe('core.device.*', (envelope) => {
            this.context?.logger.debug(`[HelloWorldPlugin] Received core device event: ${envelope.topic}`, envelope.payload);
        });
    }
    async start() {
        if (!this.context) {
            throw new Error('[HelloWorldPlugin] Cannot start: context is not initialized');
        }
        this.startedAt = new Date();
        this.isRunning = true;
        this.context.logger.info(`[HelloWorldPlugin] Started successfully at ${this.startedAt.toISOString()}`);
        // Publish plugin started notification event
        await this.context.eventBus.publish('plugin.hello-world.started', {
            pluginId: this.context.manifest.id,
            timestamp: this.startedAt.toISOString(),
            status: 'READY',
        });
    }
    async stop() {
        this.isRunning = false;
        if (this.context) {
            this.context.logger.info(`[HelloWorldPlugin] Stopping plugin...`);
            if (this.unsubscribeEvents) {
                this.unsubscribeEvents();
                this.unsubscribeEvents = undefined;
            }
            this.context.services.unregisterService('helloService');
        }
    }
    async destroy() {
        await this.stop();
        this.context = undefined;
    }
    async checkHealth() {
        return {
            status: this.isRunning ? 'healthy' : 'unhealthy',
            message: this.isRunning ? 'HelloWorldPlugin is active and healthy' : 'Plugin is stopped',
            details: {
                uptimeMs: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
                running: this.isRunning,
            },
            timestamp: new Date(),
        };
    }
}
exports.HelloWorldPlugin = HelloWorldPlugin;
function createPluginInstance() {
    return new HelloWorldPlugin();
}
exports.default = HelloWorldPlugin;
