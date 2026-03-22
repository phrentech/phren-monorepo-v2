import { eq } from 'drizzle-orm';
import type { Database } from '../client';
import { patients, patientPreferences } from '../schema';

export async function getPatientByUserId(db: Database, userId: string) {
  const result = await db
    .select()
    .from(patients)
    .where(eq(patients.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

export async function createPatient(
  db: Database,
  data: { userId: string; dateOfBirth?: string; emergencyContact?: string },
) {
  await db.insert(patients).values(data);
}

export async function updatePatient(
  db: Database,
  userId: string,
  data: Partial<{ dateOfBirth: string; emergencyContact: string; intakeCompleted: boolean }>,
) {
  await db.update(patients).set(data).where(eq(patients.userId, userId));
}

export async function getPatientPreferences(db: Database, patientId: string) {
  return db
    .select()
    .from(patientPreferences)
    .where(eq(patientPreferences.patientId, patientId));
}

export async function setPatientPreference(
  db: Database,
  id: string,
  patientId: string,
  category: string,
  key: string,
  value: string,
) {
  await db
    .insert(patientPreferences)
    .values({ id, patientId, category, key, value })
    .onConflictDoUpdate({ target: patientPreferences.id, set: { value } });
}
