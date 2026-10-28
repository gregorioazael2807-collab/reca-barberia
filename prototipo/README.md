# RECA Barbería — aplicación web funcional local

## Arranque
Desde la raíz del proyecto:

```sh
npm install
npm run db:start
npm start
```

Abrir http://127.0.0.1:8081. Requiere Node.js y PostgreSQL (`initdb`, `pg_ctl`, `psql`, `createdb`). El servidor escucha solo en el equipo local; no es un despliegue público.

Si aún no existe la cuenta del dueño, el servidor guarda el enlace privado de configuración en `.local/owner-setup-url.txt`. Abrirlo localmente y elegir nombre y contraseña. No compartir el enlace ni guardar credenciales en el código. El registro público crea únicamente clientes.

El servidor estático dentro de prototipo/ no ofrece cuentas ni reservas; ahora muestra un error de conexión, no una demostración. Usar siempre el backend de 8081.

## Probar en el teléfono con QR
Con PostgreSQL activo y sin otro servidor ocupando 8081, ejecutar desde la raíz:

```sh
npm run phone
```

El comando detecta la IP privada y genera `prototipo/evidencias/acceso-telefono.png`. Escanear ese QR con el teléfono conectado a la misma red Wi-Fi/red compartida que la computadora. La computadora y el servidor deben permanecer encendidos. Si cambia la red/IP, reiniciar este modo para regenerar el QR.

Este modo escucha en la red local, con autenticación y autorización intactas, pero sin HTTPS: usar solo una red de confianza para pruebas. No abrir puertos del router ni exponerlo a Internet. El QR contiene únicamente la URL pública, nunca el enlace privado del dueño. El modo normal `npm start` sigue limitado al equipo local. Si el firewall bloquea el acceso, autorizar la aplicación en la red local, sin desactivar el firewall.

## Acceso obligatorio con cuenta
Sin sesión válida solo se muestran registro/inicio de sesión y la entrada privada del dueño. No hay menú de navegación de la aplicación, catálogo, galería, agenda ni reservas disponibles para invitados. El servidor también exige autenticación para `/api/public` (catálogo) y `/api/availability`; `/api/site` devuelve únicamente marca y foto pública para la pantalla de acceso.

Tras registrarse o iniciar sesión como cliente se entra en **Inicio**. Al volver con una sesión válida no se repite el registro. Si la sesión caduca (actualmente 8 horas) o se cierra, hay que iniciar sesión, no crear otro perfil. Esta decisión sustituye el retorno directo a Reservar de la revisión anterior.

## Recuperación y recomendaciones
- «¿Olvidaste tu contraseña?» usa enlaces de 30 minutos, un solo uso y revocación de sesiones. Adaptador Gmail autorizado para recuperación; todavía deshabilitado hasta configurar `.local/gmail.env` privadamente y confirmar recepción de prueba. Guía: `../backend/GMAIL.md`. Mientras esté deshabilitado solo guarda borradores privados; no mostrar ni compartir `.local/password-recovery-drafts/`.
- En Mi cuenta el cliente puede copiar su enlace personal o descargar su QR. Solo funciona en la misma red hasta publicar con HTTPS.
- 1 punto y un descuento del 25 % por cada cliente nuevo recomendado que complete su primer corte, acreditado exclusivamente por el dueño al marcar atendida la cita. No hay premios al registrarse, reservar ni cancelar.
- Canje opcional al confirmar una próxima reserva: un descuento de un solo uso y no acumulable; USD 35 → USD 26.25. Cancelar devuelve el descuento, reprogramar conserva precio. Pendientes verificación de correo y controles contra identidades ficticias antes de publicación.
- Verificación de correos disponible en Mi cuenta y mediante enlace privado; transporte desactivado y separado de recuperación hasta autorización específica. Nuevos premios requieren ambos correos verificados y corte atendido; los premios pendientes se resuelven al verificar. Alias Gmail/autorrecomendación y recreaciones del mismo buzón no dan premios duplicados. Conservar clave HMAC y revisar conservación antes de publicar.
- Pruebas aisladas adicionales: `npm run test:rewards` (incluye ambos correos verificados) y `npm run test:restore`. Despliegue/respaldos: `../deployment/README.md`. Textos legales: `../legal/`, aún borradores.

## Experiencia de acceso y conexión
- Registro primero e inicio de sesión separado. Mostrar/ocultar contraseña no borra campos; al enviar se vuelve a ocultar. Ayuda de mínimo 12 caracteres en contraseñas nuevas.
- Campos conservados al cambiar idioma, solo temporalmente en memoria: no se guardan contraseñas en localStorage, sessionStorage ni registros.
- Estado de espera y prevención de envíos duplicados. Errores claros ES/EN y accesibles al lector de pantalla, sin detalles técnicos de red.
- Pantalla de carga inicial y botón para reintentar conexión. Solicitudes de lectura limitadas a 10 segundos y cambios a 45; no hay reintentos automáticos de reservas/cambios. Un fallo consultando la sesión no se trata como cierre de sesión.
- Prueba adicional aislada: `npm run test:experience`.

## Cliente y dueño: entradas separadas
- El cliente ve primero **Crear cuenta** (`#register`), sin pestañas ni formulario de acceso. El enlace pequeño «Ya tengo cuenta · Iniciar sesión» abre la pantalla separada `#login`, con opción de volver a registro y recuperar contraseña. Eliminado el botón redundante «Crear mi perfil de cliente».
- El candado pequeño en la esquina superior derecha abre exclusivamente el acceso del dueño. No hay botón grande de administración dentro del perfil del cliente.
- El inicio de sesión del dueño usa una ruta distinta, validada por rol en el servidor. No se puede registrar un dueño desde el formulario público.
- Si hay una sesión de dueño activa, Mi cuenta lo explica y ofrece cerrar sesión para probar como cliente, sin mostrar su perfil editable como si fuera un cliente.
- Diseño de ancho completo en dispositivos táctiles, áreas seguras y controles de 16px para evitar zoom automático al escribir en iPhone. La navegación inferior se aparta al editar sin interceptar el envío de formularios.

## Activar reservas con datos reales
En el panel del dueño:
1. Revisar ubicación y zona horaria: Tampa, Florida / America/New_York, ya guardadas.
2. Revisar cancelación/cambio: 300 minutos (5 horas), ya guardados. La reprogramación usa conservadoramente la misma anticipación.
3. Configurar anticipación mínima para reservar. `0` permite cualquier turno futuro disponible; vacío mantiene las reservas deshabilitadas.
4. Precio confirmado y guardado: USD 35 en caballeros y niños. No se muestra duración estimada al cliente. Separación confirmada y guardada: una hora mínima entre reservas. Configurable desde el panel con un mínimo de 60 minutos; no representa duración del corte.
5. Abrir los días de trabajo y establecer intervalos, por ejemplo turnos separados por una pausa. No se establece ningún horario real por defecto.

La aplicación consulta datos reales y rechaza reservas si falta configuración. Los datos utilizados en las pruebas están en bases temporales, no en el negocio.

## Funciones reales
### Usuarios y administración
- Registro, inicio/cierre de sesión, edición de nombre y eliminación de cuenta de cliente.
- Panel exclusivo del dueño; autorización y CSRF verificados en el servidor.
- Servicios, configuración, foto pública previsualizada/recortada y galería persistidos en PostgreSQL.
- Subidas optimizadas a WebP; categorías, procedencia y declaración de permisos de uso.

### Reservas y agenda
- Disponibilidad en la zona horaria de la barbería, incluidos los cambios estacionales.
- Turnos que ocupan una hora mínima en la agenda y no cruzan descansos, cierre, otras citas ni bloqueos. No se pide ni se muestra duración estimada del corte.
- Retenciones reales de 10 minutos, recuperables al recargar la página; cuenta atrás informativa y caducidad autoritativa del servidor.
- Confirmación reintentable sin duplicados, con precio/separación/condiciones y referencia opcional conservados.
- Historial privado de citas confirmadas, atendidas y canceladas.
- Cancelación con un mínimo de 5 horas, que libera el intervalo sin depender de mensajes.
- Reprogramación atómica: conserva precio/separación, y si falla no pierde la cita original.
- Agenda del dueño, bloqueos por horas locales y marcado como atendida después de finalizar el servicio.
- El dueño puede resolver excepciones de cancelación sin el límite del cliente.
- No se elimina una cuenta con próximas citas confirmadas; las retenciones se liberan al eliminarla.

Parámetros técnicos actuales: opciones cada 15 minutos, horizonte de 90 días y retenciones de 10 minutos. La exclusión `[inicio, fin)` en PostgreSQL protege el espacio mínimo de una hora y permite citas contiguas. La limpieza de retenciones caducadas se ejecuta en las operaciones del calendario, incluso antes de consultar disponibilidad. No requiere un temporizador de navegador para liberar turnos.

La agenda del dueño devuelve como máximo las 500 entradas más recientes por fecha de inicio.

## Mensajes con n8n — solo borradores
Cola transaccional real y flujo n8n publicado para redactar/guardar confirmaciones, cambios y cancelaciones. El panel privado del dueño muestra estados y permite revisar los textos; clientes sin acceso. Reintentos sin duplicación y tareas obsoletas invalidadas. **No hay rutas/nodos de envío ni proveedores conectados**, ni recordatorios con tiempos inventados.

Instancia exclusiva de RECA en http://localhost:5680; arranque `npm run n8n:start`. No usar la instancia del otro proyecto en 5678. Guía y pendientes: `../automation/README.md`. La prueba adicional `node backend/tests/n8n.mjs` verifica n8n real con una base temporal, sin clientes reales ni mensajes a proveedores.

## Pruebas reproducibles
Desde la raíz:

```sh
npm run db:start
npm test
# Solo si faltan los navegadores de prueba:
npx playwright install chromium webkit
npm run test:browser
npm run test:mobile
```

Resultados verificados: 48 pruebas de backend/seguridad + 5 de lógica aprobadas. Navegador: cuentas y permisos, servicios, fotografías, idiomas, galería, retención/recarga, confirmación, reprogramación, cancelación, bloqueos, cita atendida y 40 comprobaciones de ancho sin errores JavaScript.

La prueba móvil añade 186 comprobaciones en WebKit/iPhone SE e iPhone 13 y Chromium/Android, con emulación táctil, cinco tamaños/orientaciones, registro visible y acceso exclusivo del dueño. No sustituye la revisión en el teléfono físico del usuario. Capturas en `evidencias/iphone-se-inicio.png`, `iphone-se-cuenta.png`, `iphone-13-inicio.png` y `android-inicio.png`.

Los tests crean y eliminan bases aisladas. No configurar cuentas de prueba en la base real. `PLAYWRIGHT_MODULE` y `CHROMIUM_PATH` permiten reutilizar herramientas externas; normalmente no hacen falta porque Playwright ya figura como dependencia de desarrollo. `prototipo/tests/browser.mjs` es un alias de la misma prueba integral para evitar duplicación.

Capturas de pruebas aisladas: `evidencias/tramo3-admin.png` y `evidencias/tramo3-citas.png`. Los importes y datos de esas capturas son de prueba, no configuración de RECA.

## Pendiente
Entrega de WhatsApp/correo (cuentas/API, remitente, permisos y plantillas), autorización explícita de envío, tiempos de recordatorio, lista de espera, promociones, likes persistentes, reseñas verificadas y Android/Google Play. La cola y la redacción con n8n sí están implementadas y probadas. No se muestran controles de demostración como funciones terminadas ni se envían mensajes.

Antes de publicar: verificación/recuperación de cuentas, HTTPS/cookies seguras (actualmente configuración local), respaldos, privacidad, accesibilidad y dispositivos reales. Pruebas locales aprobadas no equivalen a auditoría completa de producción.

## Identidad y fotografías
Diseño basado en `../referencias-stitch/`, estética oscura/dorada y fuentes locales. El logotipo oficial y la foto pública del dueño son distintos. Las fotos iniciales no representan trabajos de RECA. Fuentes y límites legales en `FOTOS.md` y `assets/photo-sources.json`; revisar especialmente autorizaciones de menores antes de publicar.
