import { BadgeCheck } from '@/ui/icons';

import { formatMoney } from '@/lib/format';
import type { Monetization, WithdrawBlocker } from '@/lib/types';
import { Pill } from '@/ui';

export function blockerInfo(b: WithdrawBlocker, m: Monetization): { text: string; cta?: string; href?: string } {
  switch (b) {
    case 'pro_required':
      return { text: 'Tus ganancias están registradas. Para retirarlas necesitás un plan Pro activo; podés seguir creciendo gratis.', cta: 'Ver planes Pro', href: '/creator/pro' };
    case 'kyc_required':
      return { text: 'Para retirar tenés que verificar tu identidad. Una identidad verificada corresponde a una sola cuenta monetizada.', cta: 'Verificar identidad', href: '/creator/kyc' };
    case 'bank_required':
      return { text: 'Registrá la cuenta bancaria donde vas a recibir tus retiros.', cta: 'Agregar cuenta bancaria', href: '/creator/bank' };
    case 'bank_unverified':
      return { text: 'Estamos revisando tu cuenta bancaria. El titular tiene que coincidir con tu identidad verificada.' };
    case 'bank_cooldown':
      return { text: 'Por seguridad, los retiros se habilitan 24 horas después de cambiar la cuenta bancaria.' };
    case 'payout_in_progress':
      return { text: 'Tenés un retiro en proceso. Te avisamos cuando se acredite.' };
    case 'account_restricted':
      return { text: 'Tu cuenta tiene restricciones y no puede retirar por ahora.' };
    case 'insufficient_available':
      return { text: `Todavía no tenés saldo disponible suficiente. El retiro mínimo es ${formatMoney(m.payout_min, m.currency, m.currency_decimals)}.` };
  }
}

export function KycPill({ status }: { status: string }) {
  if (status === 'VERIFIED') return <Pill label="Verificada" tone="success" icon={BadgeCheck} />;
  if (status === 'REVIEW') return <Pill label="En revisión" tone="warning" />;
  if (status === 'REJECTED') return <Pill label="Rechazada" tone="danger" />;
  if (status === 'SUSPENDED') return <Pill label="Suspendida" tone="danger" />;
  return <Pill label="Pendiente" />;
}

