import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import type { AppVariables } from './middleware/auth';
import { authMiddleware } from './middleware/auth';
import { authRoutes } from './routes/auth';
import { providerRoutes } from './routes/providers';
import { appointmentRoutes } from './routes/appointments';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

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

// Protected routes
app.use('/api/*', authMiddleware);
app.route('/api/providers', providerRoutes);
app.route('/api/appointments', appointmentRoutes);

export default app;
