
import 'dotenv/config';
import { validateProductionEnv } from './shared/env.js';
import { dispatchPending } from './workers/scheduler.js';
import './workers/worker.js';

console.log('Worker processes started');
validateProductionEnv();

// Start scheduler loop
setInterval(dispatchPending, 2000);
