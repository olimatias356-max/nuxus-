// Turns API errors into short Spanish messages for the UI.
// Server-side validation errors (raised in SQL) are already user-facing.
type AnyError = { message?: string; code?: string; status?: number; name?: string } | null | undefined;

const AUTH_MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/email not confirmed/i, 'Confirmá tu email con el código que te enviamos.'],
  [/user already registered|already been registered/i, 'Ya existe una cuenta con ese email.'],
  [/token has expired|otp.*(expired|invalid)|invalid.*otp/i, 'El código es inválido o venció. Pedí uno nuevo.'],
  [/password.*(at least|characters|weak)|weak_password/i, 'La contraseña es muy débil: usá 8+ caracteres con mayúsculas, minúsculas y números.'],
  [/same.*password/i, 'La contraseña nueva tiene que ser distinta a la anterior.'],
  [/rate limit|too many|security purposes/i, 'Demasiados intentos. Esperá un minuto y probá de nuevo.'],
  [/signups not allowed/i, 'El registro está deshabilitado temporalmente.'],
  [/network request failed|failed to fetch|network error|load failed/i, 'Sin conexión. Revisá tu internet y probá de nuevo.'],
];

export function errorMessage(error: unknown, fallback = 'Algo salió mal. Probá de nuevo.'): string {
  const e = error as AnyError;
  if (!e) return fallback;
  const message = typeof e.message === 'string' ? e.message : '';

  // "Database error saving new user" = the sign-up trigger rejected the data.
  if (/database error saving new user/i.test(message)) {
    return 'No pudimos crear la cuenta. Revisá el usuario, tu fecha de nacimiento y los términos.';
  }
  for (const [re, text] of AUTH_MESSAGES) {
    if (re.test(message)) return text;
  }
  switch (e.code) {
    case '42501':
      return 'No tenés permiso para hacer esto.';
    case '23505':
      return 'Eso ya existe.';
    case '23514':
    case '22P02':
      return 'Hay datos inválidos. Revisalos y probá de nuevo.';
    case 'PGRST301':
    case 'PT401':
      return 'Tu sesión venció. Iniciá sesión de nuevo.';
    default:
      break;
  }
  // Messages raised by our SQL functions are Spanish and safe to show.
  if (message && /[áéíóúñ¿¡]|^[A-ZÁÉÍÓÚ][a-záéíóúñ ]/.test(message) && message.length < 200 && !/[{}<>]/.test(message)) {
    return message;
  }
  return fallback;
}
