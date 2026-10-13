export type FitnessPlan = {
  schema: 'sky.fitness.plan/1';
  title: string;
  sessions: Array<{
    label: string;
    durationMinutes: number;
    activities: string[];
  }>;
  notes: string[];
};

const shortText = (value: unknown, maximum: number) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;

export function parseFitnessPlan(text: string): FitnessPlan | null {
  if (text.length > 20_000) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const plan = value as Partial<FitnessPlan>;
  if (plan.schema !== 'sky.fitness.plan/1' || !shortText(plan.title, 120) ||
      !Array.isArray(plan.sessions) || plan.sessions.length < 1 || plan.sessions.length > 7 ||
      !Array.isArray(plan.notes) || plan.notes.length > 8 ||
      !plan.notes.every((note) => shortText(note, 300))) return null;
  for (const session of plan.sessions) {
    if (!session || !shortText(session.label, 80) ||
        !Number.isSafeInteger(session.durationMinutes) ||
        session.durationMinutes < 5 || session.durationMinutes > 180 ||
        !Array.isArray(session.activities) || session.activities.length < 1 ||
        session.activities.length > 12 ||
        !session.activities.every((activity) => shortText(activity, 160))) return null;
  }
  return plan as FitnessPlan;
}
