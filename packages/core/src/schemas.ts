import { z } from 'zod';
import { USER_ROLES, APPOINTMENT_STATUSES, PROVIDER_STATUSES } from './types';

export const createProviderSchema = z.object({
  bio: z.string().max(2000),
  specialization: z.string(),
  yearsExperience: z.number().int().min(0),
  hourlyRate: z.number().positive(),
  timezone: z.string(),
});

export const createServiceSchema = z.object({
  serviceName: z.string().min(1).max(200),
  description: z.string().max(1000),
  durationMinutes: z.number().int().min(15).max(180),
  price: z.number().positive(),
});

export const createAppointmentSchema = z.object({
  providerId: z.string(),
  serviceId: z.string(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(180),
});

export const matchingMessageSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(5000),
});
