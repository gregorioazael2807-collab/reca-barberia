# RECA + n8n — correos automáticos

## Activación posterior — prevalece sobre notas de borradores
El dueño autorizó «sí, actívalo ya»: transporte Gmail de citas independiente implementado, prueba al propio remitente aceptada por SMTP y activación para eventos nuevos. Recepción de la prueba aún por confirmar por el dueño. `recaDraftMessages` también solicita `/api/automation/email/run`, protegido por clave de servicio; backend deriva destinatario/texto y registra aceptación o incertidumbre sin reenvíos automáticos. No envía backlog, ni recordatorios del historial previo. WhatsApp no tiene transporte. Guía vigente: [EMAIL.md](EMAIL.md). Las secciones antiguas de modo solo borrador describen la etapa anterior.

## Actualización — solo correo (11 de octubre)
El dueño pidió automatizar únicamente correo desde `demo-54b54911@example.com`; WhatsApp permanece desactivado. El flujo principal redacta y guarda exclusivamente `subject` y `emailText` de confirmaciones, cambios, cancelaciones y recordatorios de una hora. Comanda → Mensajes muestra esos correos. Plantilla con saludo, servicio, fecha/hora/zona, precio congelado, pago en el local, política y enlace; avisos locales explican la necesidad de la misma Wi-Fi. No llama a IA ni tiene coste de API de redacción.

El flujo actualizado está importado/publicado en la instancia RECA; prueba de n8n real en base temporal aprobada, sin duplicación y sin envíos. **La entrega de correos de citas sigue sin implementarse ni habilitarse**: preparar el transporte independiente, autorizar una prueba al remitente, comprobar recepción y activar para eventos nuevos. Gmail de recuperación no autoriza ni activa automáticamente los mensajes de citas. Nunca enviar la cola antigua sin revisión explícita.

Instancia exclusiva de RECA, n8n **2.42.4**, Docker Desktop y volumen `reca-automation_reca_n8n_data`. Editor: http://localhost:5680. Solo escucha en el equipo; no modificar la instancia de clínica de 5678.

## Lo que ya funciona
- Confirmar, cancelar y reprogramar crean tareas en PostgreSQL dentro de la transacción de la cita.
- El flujo publicado `recaDraftMessages` consulta RECA cada minuto, recoge hasta 10 tareas, redacta y guarda exclusivamente correos como **borradores**, nunca como mensajes enviados.
- Textos iniciales en español: nombre, servicio, fecha/hora de la barbería, precio y política realmente acordados; pago en el local. No se anuncia duración estimada del corte.
- Reintentos idempotentes, lease de 5 minutos y máximo de 5 intentos. Las tareas fallidas aparecen para revisión del dueño.
- Cambiar/cancelar/atender invalida tareas anteriores. No se redactan confirmaciones de citas que ya comenzaron. Eliminar una cuenta limpia nombres, correos y textos de sus tareas.
- El panel privado del dueño permite consultar el estado y revisar borradores. Los clientes no tienen acceso.
- Solo eventos nuevos; no se notifica automáticamente el historial anterior a esta instalación.

## Arranque
Con RECA en 8081, PostgreSQL y Docker Desktop activos, desde la raíz:

```sh
npm run n8n:start
```

En una instalación nueva, importar/publicar **solo el flujo principal** y reiniciar:

```sh
docker compose -f compose.n8n.yaml exec -T n8n n8n import:workflow --input=/files/reca-workflow.json
docker compose -f compose.n8n.yaml exec -T n8n n8n publish:workflow --id=recaDraftMessages
docker compose -f compose.n8n.yaml restart n8n
```

La instancia actual ya está importada y publicada. Abrir el editor y completar la cuenta local de n8n si aparece la pantalla inicial: elegir la contraseña privadamente, nunca en chat. Esa cuenta es distinta de la cuenta del dueño en RECA.

Para detener únicamente esta instancia: `npm run n8n:stop`. No usar comandos globales que detengan los contenedores del otro proyecto. No borrar el volumen: contiene la configuración de n8n.

## Seguridad y límites
- No hay rutas ni nodos de envío. El backend siempre informa `mode: draft-only` y `canSend: false`. La configuración privada mantiene también envíos y solicitudes a proveedores desactivados.
- La clave de servicio y la clave de cifrado se generan en `.local/`, con permisos 600 y exclusión de Git. El flujo exportado referencia variables de entorno; no contiene claves ni el teléfono del negocio.
- El número WhatsApp Business configurado es **emisor**, nunca destinatario de pruebas. `recipientPhone` permanece vacío: todavía falta recabar teléfono y consentimiento del cliente.
- n8n no conserva datos de ejecuciones exitosas, fallidas o manuales; diagnóstico y plantillas externas desactivados. Los borradores privados viven en PostgreSQL.
- La clave de servicio permite únicamente recoger tareas y guardar borradores; no sirve para entrar como dueño o modificar citas/configuración.
- No agregar nodos externos ni activar proveedores sin autorización específica. La preparación de correos está autorizada; la entrega a clientes queda pendiente de prueba y activación confirmadas.
- Recordatorios confirmados por el usuario: **1 hora antes**. Cada consulta de n8n prepara una tarea única para citas confirmadas de la revisión actual que entren en ese plazo; únicamente borradores, sin envíos. Requiere backend y n8n activos; consulta cada minuto, no garantiza el segundo exacto. Citas iniciadas, canceladas o atendidas no generan recordatorios. La lista de espera está implementada en modo borradores: preferencias voluntarias con consentimiento por canal, teléfono solo para WhatsApp, detección de nuevas vacantes en cada consulta y descarte de avisos obsoletos. No entrega mensajes. Guía: `WAITLIST.md`.
- Conexión a WhatsApp requiere la cuenta/API de Meta, identificadores, token privado, consentimiento y plantillas aprobadas cuando corresponda. El número por sí solo no conecta la API.
- Correo de citas sigue pendiente de autorización/proveedor. Excepción posterior: el usuario autorizó exclusivamente recuperación de clientes desde `demo-54b54911@example.com` y una prueba al propio remitente. Adaptador separado del flujo n8n, todavía deshabilitado hasta credenciales privadas y recepción confirmada. Guía: `../backend/GMAIL.md`. No utilizar credenciales en código público ni chat.
- Antes de producción: HTTPS, cuenta privada de n8n, respaldo de PostgreSQL/volumen/claves, revisión de permisos y aislamiento de task runners. La instalación local usa el runner interno de JavaScript; no es una certificación de producción.

## Pruebas
```sh
npm test
npm run test:browser
npm run test:mobile
node backend/tests/n8n.mjs
```

La última prueba usa **n8n real**, el flujo auxiliar inactivo `recaDraftTest`, un backend temporal en 8082 y una base PostgreSQL que se elimina al terminar. Comprueba recogida, redacción, persistencia y reintento sin duplicación. No crea usuarios/citas de prueba en RECA ni contacta proveedores. El registro es privado: `.local/n8n-test.log`. No activar el flujo auxiliar.

Tras cambiar los textos en `backend/message-texts.js`: ejecutar `npm run n8n:prepare`, revisar el JSON generado, repetir importación/publicación/reinicio del principal y ejecutar las pruebas. No borrar datos ni claves para actualizar mensajes.
