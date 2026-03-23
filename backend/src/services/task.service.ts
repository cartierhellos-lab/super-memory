import { v4 as uuidv4 } from 'uuid';
import { pool } from '../shared/db.js';
import { taskEventEmitter } from './task-event-emitter.js';
import { EventPublisher } from './event-publisher.js';

/**
 * TaskService - 任务业务逻辑层
 * 负责任务创建、状态管理、事件发射等
 */
export class TaskService {
  /**
   * 获取单个任务
   */
  static async getTask(id: string) {
    const conn = await pool.getConnection();
    try {
      const [rows]: any = await conn.execute(
        'SELECT * FROM tasks WHERE id = ?',
        [id]
      );
      return rows[0] || null;
    } catch (err) {
      console.error('Failed to fetch task:', err);
      return null;
    } finally {
      conn.release();
    }
  }

  /**
   * 创建新任务
   * 返回新建任务的ID
   */
  static async createTask(data: {
    name: string;
    recipient: string;
    content: string;
    scheduledAt?: Date;
  }) {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();

      await conn.execute(
        `INSERT INTO tasks (id, name, recipient, content, status, progress, scheduled_at)
         VALUES (?, ?, ?, ?, 'PENDING', 0, ?)`,
        [id, data.name, data.recipient, data.content, data.scheduledAt || null]
      );

      // 💡 发布 PENDING 事件供前端显示
      const payload = {
        taskId: id,
        status: 'PENDING',
        progress: 0,
      };

      taskEventEmitter.emitUpdate(payload);
      await EventPublisher.publishTaskUpdate(payload);

      console.log(`✅ Task created: ${id}`);
      return id;
    } catch (err) {
      console.error('Failed to create task:', err);
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 更新任务状态
   * @param id 任务ID
   * @param status 新状态
   * @param progress 进度 (0-100)
   * @param errorMsg 错误消息（可选）
   */
  static async updateStatus(
    id: string,
    status: string,
    progress?: number,
    errorMsg?: string
  ) {
    const conn = await pool.getConnection();
    try {
      await conn.execute(
        `UPDATE tasks SET status = ?, progress = ?, error_msg = ?, updated_at = NOW()
         WHERE id = ?`,
        [status, progress ?? 0, errorMsg || null, id]
      );

      const payload = {
        taskId: id,
        status,
        progress: progress ?? 0,
        error_msg: errorMsg || null,
      };

      // 💡 本地事件
      taskEventEmitter.emitUpdate(payload);

      // 💡 Redis 发布给所有订阅者（包括 Socket.io）
      await EventPublisher.publishTaskUpdate(payload);

      console.log(`✅ Task ${id} status: ${status} (progress: ${progress}%)`);
    } catch (err) {
      console.error('Failed to update task status:', err);
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 获取所有 PENDING 状态的任务
   * 用于调度器拉取未处理的任务
   */
  static async getPendingTasks(limit = 10) {
    const conn = await pool.getConnection();
    try {
      const [rows]: any = await conn.execute(
        `SELECT * FROM tasks WHERE status = 'PENDING'
         ORDER BY created_at ASC LIMIT ?`,
        [limit]
      );
      return rows;
    } catch (err) {
      console.error('Failed to fetch pending tasks:', err);
      return [];
    } finally {
      conn.release();
    }
  }

  /**
   * 获取所有任务（用于前端列表展示）
   */
  static async getAllTasks(limit = 100) {
    const conn = await pool.getConnection();
    try {
      const [rows]: any = await conn.execute(
        `SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?`,
        [limit]
      );
      return rows;
    } catch (err) {
      console.error('Failed to fetch all tasks:', err);
      return [];
    } finally {
      conn.release();
    }
  }

  /**
   * 获取特定账户的任务
   */
  static async getTasksByAccount(accountId: string) {
    const conn = await pool.getConnection();
    try {
      const [rows]: any = await conn.execute(
        `SELECT * FROM tasks WHERE account_id = ?
         ORDER BY created_at DESC LIMIT 100`,
        [accountId]
      );
      return rows;
    } catch (err) {
      console.error('Failed to fetch tasks by account:', err);
      return [];
    } finally {
      conn.release();
    }
  }

  /**
   * 获取统计信息
   */
  static async getStatistics() {
    const conn = await pool.getConnection();
    try {
      const [rows]: any = await conn.execute(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'LOCKED' THEN 1 ELSE 0 END) as locked,
           SUM(CASE WHEN status = 'SENDING' THEN 1 ELSE 0 END) as sending,
           SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
           SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
         FROM tasks`
      );
      return rows[0];
    } catch (err) {
      console.error('Failed to fetch statistics:', err);
      return null;
    } finally {
      conn.release();
    }
  }
}
