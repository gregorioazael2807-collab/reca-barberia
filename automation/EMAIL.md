# Correos de citas mediante n8n

## Estado local autorizado — 11 de octubre
El dueño autorizó activar únicamente correo desde demo-54b54911@example.com. Se envió una prueba exclusivamente al remitente: Gmail aceptó por SMTP, pero el dueño todavía debe confirmar recepción en Bandeja de entrada/Spam. Ninguna prueba creó clientes o citas en la base comercial. WhatsApp permanece desactivado.

## Funcionamiento
- `recaDraftMessages`, publicado en la instancia exclusiva RECA (5680), consulta cada minuto, redacta correos y solicita POST `/api/automation/email/run`.
- n8n no contiene credenciales SMTP, destinatarios ni acceso libre al proveedor. La clave privada de servicio autentica el endpoint. Los clientes no pueden invocarlo.
- Backend selecciona hasta tres correos por ejecución, revisa evento/revisión/estado/fecha y toma el destinatario del usuario asociado a la cita. No acepta destinatario, asunto o cuerpo suministrados por el llamante. Recalcula la plantilla con el snapshot de condiciones acordadas.
- Eventos: confirmación, cambio, cancelación y recordatorio una hora antes. No incluye publicidad ni lista de espera; esos envíos requieren trabajo/autorización aparte.
- `PRIVATE_DIR/appointment-email.json`: activación independiente de recuperación/verificación, remitente autorizado y corte temporal `activatedAt`. Credenciales se leen privadamente de gmail.env. Ambos fuera del frontend/Git, permisos 600.
- Solo eventos creados desde la activación. Un recordatorio también requiere confirmación/cambio de la misma revisión posterior al corte: no envía recordatorios de citas del historial anterior.
- PostgreSQL registra una entrega única por tarea: sending, accepted, uncertain, cancelled. Concurrentes/reintentos de n8n no duplican envíos. Message-ID estable por tarea.
- Accepted significa **aceptado por SMTP**, no entregado a la bandeja de entrada. No hay webhooks de entrega/lectura. Timeout/fallo/caída en vuelo se registra uncertain y NO se reintenta automáticamente para evitar duplicados; revisar privadamente antes de cualquier recuperación manual. No está implementado un botón de reenvío.
- Cancelar o cambiar no depende de Gmail; se valida el estado inmediatamente antes de contactar SMTP. Una cancelación ocurrida mientras el proveedor ya recibe un correo no puede retirar ese correo; se redacta su nuevo evento.
- Gmail impone sus límites y cuotas. Requiere la computadora, PostgreSQL y n8n encendidos. Enlaces locales solo abren en la misma red; no equivale a correo transaccional de producción ni HTTPS publicado.

## Operación
Comanda → Mensajes muestra estado, correos redactados, aceptados por Gmail y envíos inciertos. También distingue Gmail habilitado de n8n conectado: si no ha consultado en los últimos 3 minutos aparece «revisar conexión». Revisar Docker y el servicio RECA en el puerto 5680; el puerto 5678 pertenece a otro proyecto. Después de recuperar el servicio, actualizar el estado. Un heartbeat reciente no garantiza recepción en la bandeja de entrada. Para detener citas: cambiar privadamente enabled a false en appointment-email.json; no desactiva recuperaciones. No borrar/regenerar activatedAt para reenviar historial. WhatsApp no tiene transporte ni rutas de envío.

Activación expresa/prueba al remitente (no ejecutar sin permiso):

```sh
npm run mail:appointments:enable -- --send-test --authorize-new-events
```

Repetir el comando envía otra prueba al remitente, conserva el corte original si sigue habilitado. SMTP sin aceptación no habilita la configuración.

## Pruebas
`backend/tests/email-delivery.test.js`: transportes simulados, TLS, prueba fija, configuración independiente, corte/historial/recordatorios, cancelación/revisión, concurrencia/deduplicación, errores privados e incertidumbre sin reenvíos. `npm run test:n8n` usa flujo auxiliar sin rama de envío y base temporal; no contacta proveedores. No probar correos reales con clientes sin autorización específica.
