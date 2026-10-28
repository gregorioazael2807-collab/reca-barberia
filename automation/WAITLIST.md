# Lista de espera — preferencias reales, entrega pendiente

El usuario pidió comenzar publicación HTTPS, mensajería y lista de espera para una reunión. Esta entrega implementa preferencias y borradores, **no conexiones a proveedores ni disponibilidad pública**.

## Cliente
En Reservar, elegir servicio y fecha y completar Lista de espera:
- Hora inicial/final son preferencias de inicio de cita, en America/New_York según configuración del dueño.
- Correo y WhatsApp tienen consentimientos separados, no preseleccionados, únicamente para vacantes; no publicidad.
- Teléfono internacional solo obligatorio al seleccionar WhatsApp. Sin esa selección no se guarda el teléfono.
- Hasta cinco preferencias por cliente. Una por servicio/fecha; guardar nuevamente actualiza esa preferencia y elimina sus borradores anteriores.
- Salir de esta lista elimina preferencias y borradores asociados. Eliminar cuenta también los elimina en cascada.
- La fecha debe quedar dentro del horizonte real de reservas (90 días). Sin configuración de horarios/precios/reglas no se inventa disponibilidad ni se admite la inscripción.

## Vacantes
Al inscribirse se guarda la disponibilidad existente, sin generar avisos por horarios ya libres. Después, cada revisión compara contra la agenda actual y genera un borrador por cada nuevo horario compatible. Revisa horarios/descansos, anticipación, separación, retenciones, citas y bloqueos.

La consulta de n8n `/api/automation/claim`, la revisión privada del dueño y la consulta del cliente actualizan los avisos. Requiere aplicación/DB activas; revisión periódica requiere n8n activo. No garantiza notificación instantánea.

Cada preferencia/horario genera como máximo un borrador. Si deja de estar disponible se invalida; no se reenvía por repetidas liberaciones del mismo horario. Al pasar la fecha, la siguiente revisión elimina preferencias y borradores. No se reserva una vacante por generar un aviso. La reserva normal mantiene el bloqueo del servidor y la prohibición de solapamientos.

El dueño consulta borradores en Mensajes · solo borradores. El cliente ve si hay horarios compatibles, pero debe consultar de nuevo la disponibilidad y completar una reserva válida. La inscripción no afecta una cita ya confirmada.

## API y privacidad
- `GET /api/waitlist`: solo preferencias/vacantes del cliente autenticado.
- `POST /api/waitlist`: sesión, CSRF, origen y consentimiento obligatorio.
- `DELETE /api/waitlist/:id`: solo preferencias del propio cliente.
- `GET /api/admin/waitlist`: exclusivo del dueño; estado y borradores privados.
- Estados siempre `mode: draft-only`, `canSend: false`; no existen rutas de entrega.

## Para conectar entrega
Pendientes: proveedor/región/dominio, autorización por canal y destinatario, cuenta/API Meta/identificador de emisor/token privado y plantillas aprobadas cuando corresponda; correo de citas independiente del permiso de recuperación. No usar el número emisor como destinatario de prueba. Antes de cada futura entrega se debe comprobar consentimiento vigente y disponibilidad, con cola durable/reintentos/registro de estado y controles contra duplicados. Esta versión no implementa todavía ese transporte.

Actualizar el aviso de privacidad y aprobarlo antes de publicación: ahora se recoge teléfono voluntario y preferencias. Los textos legales siguen siendo borradores.

## Pruebas aisladas
```sh
node --test backend/tests/waitlist.test.js
npm run test:waitlist
npm test
npm run test:browser
npm run test:mobile
```
Prueban consentimiento, aislamiento, persistencia, vacantes reales, no duplicación, competencia por el mismo turno, descarte de avisos obsoletos, retirada/borrado y ajustes teléfono/tablet/computadora. No contactan proveedores ni crean datos ficticios en el negocio.
