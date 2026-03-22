import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema',
  out: '../../infrastructure/d1-migrations',
  dialect: 'sqlite',
});
