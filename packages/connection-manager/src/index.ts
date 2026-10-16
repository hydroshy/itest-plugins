import { TransportAdapter } from '@iot-platform/plugin-sdk';
import { IEventBus, globalEventBus } from '@iot-platform/event-bus';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface ManagedConnection {
  id: string;
  protocol: string;
  target: string;
  adapter: TransportAdapter;
  state: ConnectionState;
  reconnectAttempts: number;
  lastConnectedAt?: Date;
  lastError?: string;
  metadata?: Record<string, any>;
}

export class ConnectionManager {
  private readonly connections = new Map<string, ManagedConnection>();

  constructor(private readonly eventBus: IEventBus = globalEventBus) {}

  registerConnection(
    id: string,
    protocol: string,
    target: string,
    adapter: TransportAdapter,
    metadata?: Record<string, any>,
  ): ManagedConnection {
    const conn: ManagedConnection = {
      id,
      protocol,
      target,
      adapter,
      state: 'disconnected',
      reconnectAttempts: 0,
      metadata,
    };
    this.connections.set(id, conn);
    this.eventBus.emit('connection:registered', { id, protocol, target });
    return conn;
  }

  async connect(id: string): Promise<boolean> {
    const conn = this.connections.get(id);
    if (!conn) throw new Error(`Connection ${id} not found`);

    conn.state = 'connecting';
    this.eventBus.emit('connection:connecting', { id });

    try {
      await conn.adapter.connect();
      conn.state = 'connected';
      conn.lastConnectedAt = new Date();
      conn.reconnectAttempts = 0;
      this.eventBus.emit('connection:connected', { id, target: conn.target });
      return true;
    } catch (err: any) {
      conn.state = 'failed';
      conn.lastError = err.message;
      this.eventBus.emit('connection:failed', { id, error: err.message });
      return false;
    }
  }

  async disconnect(id: string): Promise<void> {
    const conn = this.connections.get(id);
    if (!conn) return;

    try {
      await conn.adapter.disconnect();
    } catch (e) {}
    conn.state = 'disconnected';
    this.eventBus.emit('connection:disconnected', { id });
  }

  getConnection(id: string): ManagedConnection | undefined {
    return this.connections.get(id);
  }

  listConnections(protocol?: string): ManagedConnection[] {
    const all = Array.from(this.connections.values());
    if (protocol) return all.filter((c) => c.protocol === protocol);
    return all;
  }
}

export const globalConnectionManager = new ConnectionManager();
