import { generateUlid } from '@phren/core';
import type { Database } from './client';
import * as schema from './schema';

export async function seed(db: Database) {
  const now = new Date().toISOString();

  // --- Users: 3 providers, 3 patients ---
  const providerUsers = [
    { id: generateUlid(), email: 'dr.smith@example.com', name: 'Dr. Sarah Smith', role: 'provider' as const },
    { id: generateUlid(), email: 'dr.jones@example.com', name: 'Dr. Michael Jones', role: 'provider' as const },
    { id: generateUlid(), email: 'dr.patel@example.com', name: 'Dr. Priya Patel', role: 'provider' as const },
  ];

  const patientUsers = [
    { id: generateUlid(), email: 'alex.johnson@example.com', name: 'Alex Johnson', role: 'patient' as const },
    { id: generateUlid(), email: 'jordan.lee@example.com', name: 'Jordan Lee', role: 'patient' as const },
    { id: generateUlid(), email: 'sam.rivera@example.com', name: 'Sam Rivera', role: 'patient' as const },
  ];

  for (const user of [...providerUsers, ...patientUsers]) {
    await db.insert(schema.users).values({ ...user, createdAt: now, updatedAt: now });
  }

  // --- Provider profiles ---
  const providerProfiles = [
    {
      userId: providerUsers[0].id,
      bio: 'CBT specialist with 15 years of experience.',
      specialization: 'Cognitive Behavioral Therapy',
      yearsExperience: 15,
      hourlyRate: 175,
      timezone: 'America/New_York',
      status: 'active' as const,
    },
    {
      userId: providerUsers[1].id,
      bio: 'Trauma-informed therapist specializing in EMDR.',
      specialization: 'EMDR Therapy',
      yearsExperience: 10,
      hourlyRate: 200,
      timezone: 'America/Chicago',
      status: 'active' as const,
    },
    {
      userId: providerUsers[2].id,
      bio: 'Mindfulness-based therapy for stress reduction.',
      specialization: 'Mindfulness-Based Therapy',
      yearsExperience: 8,
      hourlyRate: 150,
      timezone: 'America/Los_Angeles',
      status: 'active' as const,
    },
  ];

  for (const profile of providerProfiles) {
    await db.insert(schema.providers).values(profile);
  }

  // --- Services: 2 per provider ---
  const services: Array<{
    id: string;
    providerId: string;
    serviceName: string;
    description: string;
    durationMinutes: number;
    price: number;
  }> = [];

  const serviceTemplates = [
    [
      { serviceName: 'Individual CBT Session', description: 'One-on-one cognitive behavioral therapy.', durationMinutes: 50, price: 175 },
      { serviceName: 'CBT Intake Assessment', description: 'Initial assessment and treatment planning.', durationMinutes: 90, price: 250 },
    ],
    [
      { serviceName: 'EMDR Session', description: 'Eye movement desensitization and reprocessing.', durationMinutes: 60, price: 200 },
      { serviceName: 'Trauma Assessment', description: 'Comprehensive trauma history and treatment planning.', durationMinutes: 90, price: 275 },
    ],
    [
      { serviceName: 'Mindfulness Session', description: 'Guided mindfulness-based stress reduction.', durationMinutes: 50, price: 150 },
      { serviceName: 'Meditation & Wellness', description: 'Meditation techniques and wellness coaching.', durationMinutes: 45, price: 125 },
    ],
  ];

  for (let i = 0; i < providerUsers.length; i++) {
    for (const tmpl of serviceTemplates[i]) {
      const svc = { id: generateUlid(), providerId: providerUsers[i].id, ...tmpl };
      services.push(svc);
      await db.insert(schema.providerServices).values(svc);
    }
  }

  // --- Availability: 5 slots per provider (Mon-Fri) ---
  for (const provider of providerUsers) {
    for (let day = 1; day <= 5; day++) {
      await db.insert(schema.providerAvailability).values({
        id: generateUlid(),
        providerId: provider.id,
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '17:00',
      });
    }
  }

  // --- Patient profiles ---
  const patientProfiles = [
    { userId: patientUsers[0].id, dateOfBirth: '1990-03-15', intakeCompleted: true },
    { userId: patientUsers[1].id, dateOfBirth: '1985-07-22', intakeCompleted: true },
    { userId: patientUsers[2].id, dateOfBirth: '1998-11-08', intakeCompleted: false },
  ];

  for (const profile of patientProfiles) {
    await db.insert(schema.patients).values(profile);
  }

  // --- Appointments: 5 at various statuses ---
  const appointmentData = [
    {
      id: generateUlid(),
      patientId: patientUsers[0].id,
      providerId: providerUsers[0].id,
      serviceId: services[0].id,
      status: 'completed' as const,
      scheduledAt: '2026-03-10T10:00:00.000Z',
      durationMinutes: 50,
      createdAt: now,
    },
    {
      id: generateUlid(),
      patientId: patientUsers[0].id,
      providerId: providerUsers[0].id,
      serviceId: services[0].id,
      status: 'scheduled' as const,
      scheduledAt: '2026-03-25T14:00:00.000Z',
      durationMinutes: 50,
      createdAt: now,
    },
    {
      id: generateUlid(),
      patientId: patientUsers[1].id,
      providerId: providerUsers[1].id,
      serviceId: services[2].id,
      status: 'scheduled' as const,
      scheduledAt: '2026-03-26T11:00:00.000Z',
      durationMinutes: 60,
      createdAt: now,
    },
    {
      id: generateUlid(),
      patientId: patientUsers[1].id,
      providerId: providerUsers[1].id,
      serviceId: services[3].id,
      status: 'cancelled' as const,
      scheduledAt: '2026-03-12T09:00:00.000Z',
      durationMinutes: 90,
      createdAt: now,
    },
    {
      id: generateUlid(),
      patientId: patientUsers[2].id,
      providerId: providerUsers[2].id,
      serviceId: services[4].id,
      status: 'in_progress' as const,
      scheduledAt: '2026-03-22T15:00:00.000Z',
      durationMinutes: 50,
      createdAt: now,
    },
  ];

  for (const appt of appointmentData) {
    await db.insert(schema.appointments).values(appt);
    await db.insert(schema.appointmentHistory).values({
      id: generateUlid(),
      appointmentId: appt.id,
      status: appt.status,
      changedBy: appt.patientId,
      changedAt: now,
    });
  }

  // --- Matching conversation with 3 messages ---
  const conversationId = generateUlid();
  await db.insert(schema.matchingConversations).values({
    id: conversationId,
    patientId: patientUsers[2].id,
    createdAt: now,
  });

  const matchingMsgs = [
    { role: 'user' as const, content: 'I have been feeling very stressed lately and would like help managing it.' },
    { role: 'assistant' as const, content: 'I understand. Can you tell me more about what has been causing your stress? This will help me recommend the right therapist for you.' },
    { role: 'user' as const, content: 'Mostly work-related pressure and difficulty sleeping. I have tried meditation apps but want professional guidance.' },
  ];

  for (const msg of matchingMsgs) {
    await db.insert(schema.matchingMessages).values({
      id: generateUlid(),
      conversationId,
      role: msg.role,
      content: msg.content,
      createdAt: now,
    });
  }

  console.log('Seed complete: 3 providers, 3 patients, 6 services, 15 availability slots, 5 appointments, 1 matching conversation with 3 messages');
}
