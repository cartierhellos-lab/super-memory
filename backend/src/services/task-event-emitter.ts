import { EventEmitter } from 'events';

export class TaskEventEmitter extends EventEmitter {
  emitUpdate(payload: {
    taskId: string;
    status?: string;
    progress?: number;
    error_msg?: string | null;
  }) {
    this.emit('task:update', payload);
  }
}

// 单例导出
export const taskEventEmitter = new TaskEventEmitter();
