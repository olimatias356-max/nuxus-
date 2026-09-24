import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('Ingresá un email válido.').max(254);

export const passwordSchema = z
  .string()
  .min(8, 'Usá al menos 8 caracteres.')
  .max(72, 'Máximo 72 caracteres.')
  .regex(/[a-z]/, 'Agregá una letra minúscula.')
  .regex(/[A-Z]/, 'Agregá una letra mayúscula.')
  .regex(/[0-9]/, 'Agregá un número.');

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._]{3,24}$/, 'De 3 a 24 caracteres: letras, números, punto o guion bajo.')
  .refine((v) => !/^\.|\.$|\.\./.test(v), 'No puede empezar ni terminar con punto, ni tener dos seguidos.');

export const displayNameSchema = z.string().trim().min(1, 'Ingresá tu nombre.').max(50, 'Máximo 50 caracteres.');

export const otpSchema = z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 dígitos.');

/** Parses DD/MM/AAAA and returns ISO date (AAAA-MM-DD) or null. */
export function parseBirthDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || date.getTime() > Date.now()) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function ageFrom(isoDate: string, now = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

export function firstError(result: { success: boolean; error?: z.ZodError }): string | null {
  return result.success ? null : (result.error?.issues[0]?.message ?? 'Dato inválido.');
}
