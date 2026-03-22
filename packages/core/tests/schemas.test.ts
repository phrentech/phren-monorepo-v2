import { describe, it, expect } from 'vitest';
import {
  createProviderSchema,
  createServiceSchema,
  createAppointmentSchema,
  matchingMessageSchema,
} from '../src/schemas';

describe('createProviderSchema', () => {
  it('accepts valid provider data', () => {
    const result = createProviderSchema.safeParse({
      bio: 'Experienced therapist',
      specialization: 'CBT',
      yearsExperience: 10,
      hourlyRate: 150,
      timezone: 'America/New_York',
    });
    expect(result.success).toBe(true);
  });

  it('rejects bio over 2000 chars', () => {
    const result = createProviderSchema.safeParse({
      bio: 'a'.repeat(2001),
      specialization: 'CBT',
      yearsExperience: 10,
      hourlyRate: 150,
      timezone: 'America/New_York',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative yearsExperience', () => {
    const result = createProviderSchema.safeParse({
      bio: 'Bio',
      specialization: 'CBT',
      yearsExperience: -1,
      hourlyRate: 150,
      timezone: 'America/New_York',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive hourlyRate', () => {
    const result = createProviderSchema.safeParse({
      bio: 'Bio',
      specialization: 'CBT',
      yearsExperience: 5,
      hourlyRate: 0,
      timezone: 'America/New_York',
    });
    expect(result.success).toBe(false);
  });
});

describe('createServiceSchema', () => {
  it('accepts valid service data', () => {
    const result = createServiceSchema.safeParse({
      serviceName: 'Individual Therapy',
      description: 'One-on-one session',
      durationMinutes: 60,
      price: 100,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty serviceName', () => {
    const result = createServiceSchema.safeParse({
      serviceName: '',
      description: 'desc',
      durationMinutes: 60,
      price: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects duration under 15 minutes', () => {
    const result = createServiceSchema.safeParse({
      serviceName: 'Quick',
      description: 'desc',
      durationMinutes: 10,
      price: 100,
    });
    expect(result.success).toBe(false);
  });
});

describe('createAppointmentSchema', () => {
  it('accepts valid appointment data', () => {
    const result = createAppointmentSchema.safeParse({
      providerId: 'provider_123',
      serviceId: 'service_456',
      scheduledAt: '2026-04-01T10:00:00Z',
      durationMinutes: 60,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid datetime', () => {
    const result = createAppointmentSchema.safeParse({
      providerId: 'provider_123',
      serviceId: 'service_456',
      scheduledAt: 'not-a-date',
      durationMinutes: 60,
    });
    expect(result.success).toBe(false);
  });
});

describe('matchingMessageSchema', () => {
  it('accepts valid message', () => {
    const result = matchingMessageSchema.safeParse({
      message: 'I need help with anxiety',
    });
    expect(result.success).toBe(true);
  });

  it('accepts message with conversationId', () => {
    const result = matchingMessageSchema.safeParse({
      conversationId: 'conv_123',
      message: 'Follow-up question',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty message', () => {
    const result = matchingMessageSchema.safeParse({
      message: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message over 5000 chars', () => {
    const result = matchingMessageSchema.safeParse({
      message: 'a'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});
