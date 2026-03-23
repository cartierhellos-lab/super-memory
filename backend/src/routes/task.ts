import express from 'express';
import { TaskService } from '../services/task.service.js';
import { AccountService } from '../services/account.service.js';

const router = express.Router();

/**
 * POST /api/tasks
 * 创建新任务
 */
router.post('/tasks', async (req, res) => {
  try {
    const { name, recipient, content, scheduledAt } = req.body;

    // 验证必填字段
    if (!name || !recipient || !content) {
      return res.status(400).json({
        error: 'Missing required fields: name, recipient, content',
      });
    }

    const taskId = await TaskService.createTask({
      name,
      recipient,
      content,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    });

    res.status(201).json({
      id: taskId,
      status: 'PENDING',
      message: 'Task created successfully',
    });
  } catch (err: any) {
    console.error('Failed to create task:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tasks
 * 获取所有任务列表
 */
router.get('/tasks', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const tasks = await TaskService.getAllTasks(limit);

    res.json({
      data: tasks,
      count: tasks.length,
    });
  } catch (err: any) {
    console.error('Failed to fetch tasks:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tasks/:id
 * 获取单个任务详情
 */
router.get('/tasks/:id', async (req, res) => {
  try {
    const task = await TaskService.getTask(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (err: any) {
    console.error('Failed to fetch task:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tasks/:id/status
 * 更新任务状态
 */
router.post('/tasks/:id/status', async (req, res) => {
  try {
    const { status, progress, error_msg } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await TaskService.updateStatus(
      req.params.id,
      status,
      progress,
      error_msg
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to update task status:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tasks/account/:accountId
 * 获取特定账户的任务列表
 */
router.get('/tasks/account/:accountId', async (req, res) => {
  try {
    const tasks = await TaskService.getTasksByAccount(req.params.accountId);
    res.json({ data: tasks, count: tasks.length });
  } catch (err: any) {
    console.error('Failed to fetch tasks by account:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tasks/stats/summary
 * 获取任务统计信息
 */
router.get('/tasks/stats/summary', async (req, res) => {
  try {
    const stats = await TaskService.getStatistics();
    res.json(stats);
  } catch (err: any) {
    console.error('Failed to fetch statistics:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
