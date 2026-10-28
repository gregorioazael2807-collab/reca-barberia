# Aviso de privacidad — RECA Barbería

**BORRADOR para revisión del dueño. No es asesoría jurídica ni un aviso aprobado para publicar.** Deben completarse los datos y plazos pendientes antes de Google Play/App Store o de operar públicamente.

## Responsable y contacto
- Negocio: RECA Barbería, Tampa, Florida, Estados Unidos.
- Pendiente: nombre legal del responsable, dirección comercial y correo para solicitudes de privacidad. No publicar un contacto supuesto.

## Datos y finalidades
- Nombre y correo: crear la cuenta, identificar reservas y recuperar/verificar el acceso.
- Contraseña: se almacena una derivación con salt mediante scrypt, no la contraseña legible.
- Sesiones y tokens: acceso y protección frente a solicitudes no autorizadas. Los tokens de recuperación/verificación se almacenan hashed y caducan a los 30 minutos; las sesiones actuales duran 8 horas.
- Reservas: servicio, fecha, estado, precio acordado, referencia de corte y descuento utilizado.
- Reseñas voluntarias: una valoración de 1 a 5 estrellas y texto de hasta 1000 caracteres por cliente con cita marcada como atendida. Al publicar se informa de que nombre de pila, puntuación, texto y fecha serán visibles para otros usuarios con sesión. No se expone el correo ni el apellido mediante el listado. Todas las puntuaciones cuentan igual en el promedio; no se premian las valoraciones positivas ni se filtran las bajas. El cliente puede editar o eliminar su reseña; eliminar la cuenta también la elimina. No se publica en Google ni se envía a un proveedor de reputación. Evitar datos privados en el texto. Antes de publicar el servicio al público, aprobar reglas de contenido, canal de denuncia y procedimiento ante abuso; actualmente no hay moderación automática.
- Recomendaciones: relación entre cuentas, corte atendido que originó el beneficio, puntos y canjes. Se utiliza una clave HMAC del correo normalizado para evitar duplicar beneficios con alias o recreaciones. **Es un identificador pseudonimizado, no información anónima.**
- Seguridad: límites de intentos basados en un resumen de IP, con ventanas de cinco minutos y limpieza periódica en producción.
- Fotos y videos: referencias, foto pública del barbero y videos de registro/Inicio subidos por el dueño. Son medios públicos; requieren permisos de uso, música e imagen. No se solicita al cliente una foto personal en el flujo actual. Archivos antiguos de video pueden permanecer después del reemplazo; plazo/limpieza/respaldos deben aprobarse.
- Bibliotecas privadas del dueño: archivos, títulos, duración, miniaturas, declaración de permiso, autor/fuente/licencia y modificaciones. Los clientes no consultan la biblioteca completa; solo ven y reproducen lo seleccionado con sus créditos. Material externo identificado, no representa trabajos de RECA. Licencias de copyright no garantizan derechos de imagen/model release; revisión legal/comercial pendiente.
- Música pública de la aplicación: archivo MP3/M4A y título elegido por el dueño, con declaración de derechos. Mismo archivo disponible en asistente/app; cada persona decide reproducir en su dispositivo. No se transmite micrófono ni audio en directo. El dueño puede configurar intentar reproducción al entrar en la app con sesión; queda sujeta al navegador y, si este bloquea sonido, requiere Activar música. El cliente puede silenciar; esa preferencia booleana se guarda localmente por cuenta/dispositivo y no se comunica a terceros. Revisar metadatos personales antes de compartir; archivos anteriores pueden permanecer aunque se retire la selección. Plazo/limpieza/revocación de enlaces públicos pendientes.
- Finanzas privadas del dueño: ingresos recibidos/gastos pagados introducidos manualmente, importes USD, fecha, categoría, método, notas y posible relación de un cobro con una cita. Metas/límites semanales opcionales. Solo dueño puede consultar estos datos. Anular un error conserva movimiento/motivo; no se conecta a bancos ni se recoge tarjeta bancaria. No escribir datos personales innecesarios ni secretos en notas. Plazos contables/fiscales y tratamiento de solicitudes requieren revisión antes de publicar.
- Lista de espera voluntaria: servicio, fecha, franja de interés y consentimiento separado para correo/WhatsApp. El teléfono internacional se pide únicamente si el cliente elige WhatsApp; no se usa para publicidad. Las preferencias y borradores de vacantes se eliminan al salir de esa lista, borrar la cuenta o al pasar la fecha solicitada en la siguiente revisión. Los envíos siguen desactivados.
- No se solicitan ubicación GPS, datos bancarios ni datos médicos. Pago en el local.

## Proveedores y comunicaciones
- El envío por Gmail, cuando sea autorizado y habilitado, transmite al proveedor el correo destinatario y el contenido del mensaje de recuperación/verificación.
- Recuperar o verificar correo no suscribe al cliente a publicidad. Los borradores de citas y vacantes se guardan privadamente; no se entregan a proveedores. Antes de habilitar mensajes de citas/vacantes deben declararse proveedor y finalidad, recabar los permisos correspondientes y probar entregas autorizadas. No activar publicidad con el consentimiento de la lista de espera.
- Hosting, base de datos, región de alojamiento, copias externas y proveedores definitivos: **pendientes de selección y declaración**.
- Las pruebas automatizadas utilizan datos ficticios en bases aisladas; no envían a proveedores.

## Conservación y eliminación
- La cuenta del cliente dispone de eliminación dentro de la aplicación. Actualmente debe resolver las próximas citas confirmadas antes de eliminarla; revisar este recorrido y el mecanismo alternativo de solicitud antes de publicar.
- Al eliminar una cuenta se revocan sesiones, se eliminan verificaciones/recuperaciones y se limpian los datos personales de sus borradores de citas. Pueden permanecer registros de agenda y beneficios necesarios para gestionar el negocio y prevenir recompensas duplicadas.
- El registro pseudonimizado de recompensas permanece después de eliminar la cuenta recomendada para impedir premios repetidos. **El plazo de conservación y su justificación deben aprobarse antes de producción; no se ha definido un plazo final.**
- Pendientes: plazos de reservas históricas, registros antifraude, fotos, mensajes y copias de respaldo; eliminación al vencer esos plazos y tratamiento de solicitudes sobre copias existentes.

## Derechos y solicitudes
Ofrecer acceso, corrección y eliminación conforme a la normativa aplicable. Completar el contacto, procedimiento de verificación del solicitante y plazos de respuesta. No exigir enviar contraseñas o enlaces secretos a soporte.

## Menores y fotografías
El servicio infantil no implica autorizar cuentas de menores. Definir quién puede crear/reservar esa cuenta y la autorización del representante. Revisar derechos/licencias e imagen de las referencias, especialmente menores identificables, antes de publicar.

## Seguridad y publicación
Producción requiere HTTPS, cookies Secure/HttpOnly/SameSite, PostgreSQL con TLS verificado, almacenamiento persistente y directorios privados separados de imágenes públicas. Las pruebas locales no garantizan cumplimiento legal ni disponibilidad absoluta.

## Bloqueos antes de aprobación
Datos del responsable/contacto, proveedores/región, plazos de conservación, solicitudes/eliminación, política de menores, derechos sobre fotos, revisión legal y declaraciones de privacidad/Data Safety de las tiendas.
