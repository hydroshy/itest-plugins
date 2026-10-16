import { EventEmitter } from 'events';

export type EventHandler<T = any> = (payload: T) => void | Promise<void>;

export interface IEventBus {
  emit<T = any>(event: string, payload: T): void;
  on<T = any>(event: string, handler: EventHandler<T>): void;
  off<T = any>(event: string, handler: EventHandler<T>): void;
  once<T = any>(event: string, handler: EventHandler<T>): void;
  clear(): void;
}

export class InMemoryEventBus implements IEventBus {
  private readonly emitter = new EventEmitter();

  constructor(maxListeners: number = 100) {
    this.emitter.setMaxListeners(maxListeners);
  }

  emit<T = any>(event: string, payload: T): void {
    this.emitter.emit(event, payload);
  }

  on<T = any>(event: string, handler: EventHandler<T>): void {
    this.emitter.on(event, handler);
  }

  off<T = any>(event: string, handler: EventHandler<T>): void {
    this.emitter.off(event, handler);
  }

  once<T = any>(event: string, handler: EventHandler<T>): void {
    this.emitter.once(event, handler);
  }

  clear(): void {
    this.emitter.removeAllListeners();
  }
}

export const globalEventBus = new InMemoryEventBus();
