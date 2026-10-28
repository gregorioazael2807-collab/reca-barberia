# Puesta en marcha RECA — pendientes verificables

## Ya implementado, no equivalente a publicación
- Reservas reales con permisos, exclusión de cruces, snapshots y confirmaciones de cambios.
- Gocho con ventana lateral azul, errores en la misma zona, Enter, borrado del cuadro, cuota visible y consultas directas sin coste de IA.
- Contexto de hasta tres órdenes del mismo dueño/conversación durante 30 minutos. Nueva conversación corta el contexto. No se envían respuestas, datos financieros ni contactos al proveedor; sí las órdenes que el dueño haya escrito. Sigue siendo un asistente de herramientas limitadas, no control ilimitado ni conversación general con todos los datos.
- `npm run backup:encrypted`: DB/medios empaquetados y cifrados AES-256-GCM; descifrado/hash comprobados localmente. Detecta corrupción y clave incorrecta. No equivale a respaldo externo ni a una restauración de producción.

## Decisiones que debe tomar el dueño
1. **Hosting:** presupuesto mensual máximo, proveedor/región y dominio (o confirmar dominio propio). Persistencia de PostgreSQL y medios, HTTPS, proceso supervisado, alertas y restricciones de red. No contratar ni publicar hasta aprobar.
2. **Respaldos:** destino externo (disco aparte o cuenta/proveedor autorizado), horario, retención y responsable de recuperar la clave. La clave `PRIVATE_DIR/backup-encryption-key` debe custodiarse **por separado del fichero cifrado**; perder ambas en la misma computadora impide recuperación. No enviar clave en chat ni copiarla junto al cifrado a un enlace público. Conservar también claves de identidad/configuración/n8n de forma cifrada y autorizada.
3. **Mensajes:** correo, WhatsApp o ambos; remitente/cuenta/proveedor, clases de mensajes aprobadas y destinatario de prueba autorizado. WhatsApp requiere cuenta Meta/plantillas. Gmail de recuperación ya habilitado no autoriza enviar nuevas clases de correo. No activar envío a la base actual sin comprobar consentimiento/destinatarios.
4. **Legal:** revisión por profesional competente de `legal/`, retención/eliminación, condiciones de reservas, consentimiento de mensajes y derechos de fotos/videos. Los borradores no son aprobación jurídica ni garantía de cumplimiento.

## Piloto controlado — solo después de las aprobaciones necesarias
- 3–5 participantes autorizados; no crear cuentas/citas ficticias en la base comercial.
- Prueba inicial de comprensión con dueño: identificar mensaje y respuesta, leer coste/cuota, enviar con Enter, recuperar error, reconocer una propuesta sin ejecutar y confirmar/rechazar.
- Cada participante registra su propia cuenta y prueba reservar, verificar precio y zona, cambiar/cancelar dentro de reglas, cerrar sesión y recuperación.
- Dueño verifica que no hay cruces, precios históricos se conservan y ningún servicio atendido genera ingreso automático.
- Probar lenta conexión/regreso a pestaña, iPhone y Android físicos; una prueba emulada no sustituye dispositivos reales.
- Mensajería: primero una cuenta/recipiente explícitamente autorizado, estados de entrega/reintentos sin duplicados; luego ampliar con consentimiento.
- Restauración completa en staging con clave custodiada; medir tiempo de recuperación antes de afirmar protección frente a pérdida total.
- Vigilar errores y cola, espacio de medios, éxito de backups y gasto real de API. Mantener máximo 10 consultas naturales/día UTC salvo nueva autorización; no es un tope en dólares.

## Criterio de salida
No declarar terminado: HTTPS sin verificar desde otra red, copia externa sin recuperación ensayada, documentos sin aprobar, transporte sin entrega real autorizada ni facilidad de uso sin observar al dueño/participantes. Registrar fecha, persona responsable y resultado; cualquier fallo crítico de permisos, precios o cruces bloquea publicación.
