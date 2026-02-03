/**
 * Inter-module messaging layer.
 * Scheduler and Cost Control communicate through this layer.
 * Services must not communicate directly with each other.
 */

import { EventEmitter } from "events";

export type MessageType =
  | "budget.check"
  | "budget.exhausted"
  | "budget.added"
  | "service.started"
  | "service.stopped"
  | "service.paused"
  | "service.errored"
  | "cost.recorded";

export interface Message<T = unknown> {
  type: MessageType;
  serviceId: string;
  payload: T;
  timestamp: Date;
}

export interface MessageBus {
  publish(message: Message): Promise<void>;
  subscribe(type: MessageType, handler: (message: Message) => Promise<void>): void;
  unsubscribe(type: MessageType, handler: (message: Message) => Promise<void>): void;
}

export class EventEmitterBus implements MessageBus {
  private emitter = new EventEmitter();

  async publish(message: Message): Promise<void> {
    this.emitter.emit(message.type, message);
  }

  subscribe(type: MessageType, handler: (message: Message) => Promise<void>): void {
    this.emitter.on(type, handler);
  }

  unsubscribe(type: MessageType, handler: (message: Message) => Promise<void>): void {
    this.emitter.off(type, handler);
  }
}
