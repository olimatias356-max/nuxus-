// Draft legal texts shown in the app. They must be reviewed by a lawyer for
// Paraguay, Argentina and Brazil before publishing to the stores.
export type LegalDoc = 'terms' | 'privacy' | 'rules';

export const LEGAL: Record<LegalDoc, { title: string; updated: string; sections: Array<{ h: string; p: string }> }> = {
  terms: {
    title: 'Términos de uso',
    updated: 'Septiembre 2026',
    sections: [
      { h: '1. Quiénes somos', p: 'MbareteFans es una plataforma social de creadores de contenido general (entretenimiento, cultura, deporte, educación, tecnología y más), con monetización para creadores. Al crear una cuenta aceptás estos términos.' },
      { h: '2. Tu cuenta', p: 'Tenés que tener al menos 18 años. Sos responsable de mantener segura tu contraseña. Una identidad verificada corresponde a una sola cuenta monetizada. Podés eliminar tu cuenta cuando quieras desde Ajustes.' },
      { h: '3. Tu contenido', p: 'Conservás los derechos sobre lo que publicás. Nos das una licencia no exclusiva para alojarlo, mostrarlo y distribuirlo dentro de la plataforma. Solo publicá contenido propio o que tengas derecho a usar.' },
      { h: '4. Reglas', p: 'Tenés que cumplir las Reglas de la comunidad. Podemos quitar contenido, aplicar advertencias (strikes), restringir o suspender cuentas que las incumplan. Podés apelar las decisiones desde la app.' },
      { h: '5. Ganancias y Pro', p: 'Los creadores gratuitos generan ganancias por publicidad válida (70% para el creador) y membresías (80%). Las ganancias solo se contabilizan sobre tráfico válido; la actividad fraudulenta no genera ingresos. Para retirar necesitás un plan Pro activo, identidad verificada y una cuenta bancaria a tu nombre. Pro no garantiza alcance: la distribución depende principalmente del rendimiento real del contenido.' },
      { h: '6. Suscripciones', p: 'Pro se cobra a través de Google Play o App Store y se renueva automáticamente cada mes hasta que lo canceles desde la tienda. Si cancelás, Pro sigue activo hasta el final del período pagado. MbareteFans no almacena datos de tarjetas.' },
      { h: '7. Responsabilidad', p: 'La plataforma se ofrece "tal cual". No somos responsables por el contenido publicado por usuarios, aunque moderamos activamente y actuamos ante los reportes.' },
      { h: '8. Cambios', p: 'Podemos actualizar estos términos. Si el cambio es importante te lo vamos a avisar en la app antes de que entre en vigencia.' },
    ],
  },
  privacy: {
    title: 'Política de privacidad',
    updated: 'Septiembre 2026',
    sections: [
      { h: 'Qué datos recopilamos', p: 'Email, nombre de usuario, nombre visible, país y fecha de nacimiento (privada, solo para verificar la edad). El contenido que publicás, tus interacciones y mensajes. Para monetizar: datos de identidad (KYC) y cuenta bancaria.' },
      { h: 'Cómo los protegemos', p: 'Las fotos de documentos de identidad se guardan en un almacenamiento privado al que solo accede el equipo de verificación. El número de documento se guarda cifrado con una función irreversible (hash). El número de cuenta bancaria se guarda cifrado; en la app solo ves los últimos 4 dígitos. Tu sesión se guarda en el almacenamiento seguro del teléfono. Al subir fotos eliminamos los metadatos, incluida la ubicación GPS.' },
      { h: 'Para qué los usamos', p: 'Para operar la plataforma, recomendar contenido, prevenir fraude y abuso, procesar pagos y retiros, y cumplir la ley. No vendemos tus datos personales.' },
      { h: 'Con quién los compartimos', p: 'Con proveedores que nos ayudan a operar (alojamiento, verificación de identidad, pagos a través de Google Play / App Store, bancos para retiros), bajo contratos de confidencialidad, y con autoridades cuando la ley lo exige.' },
      { h: 'Tus derechos', p: 'Podés ver y editar tus datos desde la app, descargar o pedir la eliminación de tu cuenta. Al eliminar la cuenta borramos tu perfil y tu contenido; conservamos solo los registros contables y de seguridad que la ley nos obliga a guardar.' },
      { h: 'Contacto', p: 'Escribinos desde Ajustes → Ayuda y contacto.' },
    ],
  },
  rules: {
    title: 'Reglas de la comunidad',
    updated: 'Septiembre 2026',
    sections: [
      { h: 'Contenido para todo público', p: 'MbareteFans es una plataforma de contenido general. No se permite contenido sexual explícito ni desnudos con fines sexuales.' },
      { h: 'Tolerancia cero', p: 'Contenido que involucre a menores en cualquier situación sexual o de riesgo, contenido no consentido, explotación o trata. Lo removemos y lo reportamos a las autoridades.' },
      { h: 'Respeto', p: 'Nada de acoso, amenazas, discursos de odio, violencia gráfica ni promoción de autolesiones.' },
      { h: 'Autenticidad', p: 'No te hagas pasar por otra persona o marca. La insignia azul significa identidad verificada, no se compra.' },
      { h: 'Derechos de autor', p: 'Publicá solo contenido tuyo o que tengas permiso para usar.' },
      { h: 'Juego limpio', p: 'Nada de spam, estafas, bots, compra de seguidores ni manipulación de reproducciones. La actividad artificial no genera ganancias y puede llevar a la suspensión.' },
      { h: 'Cómo actuamos', p: 'Revisamos los reportes; los casos dudosos los decide una persona. Las infracciones suman strikes: advertencia, restricción y suspensión. Siempre podés apelar.' },
    ],
  },
};
