import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import dotenv from 'dotenv';
import chatRoutes from './routes/chat.ts';
import repoRoutes from './routes/repo.ts';

dotenv.config();

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/', (c) => {
  return c.json({ 
    status: 'ok', 
    message: 'Groq Dev Assistant API',
    version: '1.0.0'
  });
});

// Routes
app.route('/api/chat', chatRoutes);
app.route('/api/repo', repoRoutes);

// Error handling
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ 
    error: err.message || 'Internal server error' 
  }, 500);
});

const port = parseInt(process.env.PORT || '3000');

console.log(`🚀 Server starting on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port
});