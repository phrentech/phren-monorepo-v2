import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import { authMiddleware } from './middleware/auth';
import { authRoutes } from './routes/auth';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: [
      'https://patient.phrentech.com',
      'https://provider.phrentech.com',
      'https://session.phrentech.com',
    ],
    credentials: true,
  }),
);

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/auth', authRoutes);

// Protected routes -- will be added in Task 9
app.use('/api/*', authMiddleware);

export default app;
