# Preparación de producción — no desplegada todavía

No contratar ni contactar proveedores, publicar datos, activar nuevos correos o modificar otra aplicación sin autorización. El usuario quiere Google Play/App Store: este backend será necesario para las aplicaciones, pero aquí aún no hay compilaciones móviles ni cuentas de tiendas.

## Configuración soportada
- `NODE_ENV=production`: rechaza origen HTTP y exige `DATABASE_URL`, `UPLOAD_DIR` y `PRIVATE_DIR` absolutos.
- `RECA_ORIGIN`: origen HTTPS estable sin ruta, query, fragmento ni credenciales. No se deriva del encabezado Host.
- `DATABASE_URL`: PostgreSQL del negocio; TLS verificado en producción. No permite sslmode sin verificación. `DB_SSL_CA` admite CA privada válida del proveedor; no desactivar verificación para resolver certificados.
- `UPLOAD_DIR`: disco persistente para `/media/UUID.webp`. Imágenes normalizadas/validadas por el backend. No usar disco efímero del hosting.
- `PRIVATE_DIR`: disco privado persistente para claves, configuración de Gmail y enlace inicial del dueño. No puede quedar dentro de imágenes públicas o del frontend. Conservar la clave `referral-identity-key`; cambiarla o perderla afecta el control de duplicados.
- `PORT`, `RECA_HOST`: puerto y escucha interna. En el ejemplo Caddy vive en la misma máquina; la app escucha solo en loopback.
- `TRUST_PROXY`: limitado al proxy conocido. No usar `true`, `*` ni toda internet. Firewall: impedir acceso externo directo al puerto de Node. En otro proveedor, revisar su arquitectura/rangos, no copiar loopback ciegamente.
- Cookies Secure/HttpOnly/SameSite y HSTS en HTTPS. Orígenes externos no autorizados bloqueados. Límite de intentos en PostgreSQL para compartirlo entre procesos; se almacenan hashes de IP por ventanas, con limpieza periódica.

`production.config.example.txt` y `Caddyfile.example` son plantillas, no una instalación activa. No contienen claves reales. Preparar Node compatible (22.13+), certificados/TLS, permisos de discos, PostgreSQL y proxy en el proveedor elegido. Inicializar con una sola instancia y configurar el dueño antes de escalar; sincronizar las mismas claves privadas entre instancias. No ejecutar pruebas que crean bases temporales en el servicio productivo.

## Verificación y recomendaciones
El servidor real exige ambos correos verificados para nuevos premios y verificación del recomendador al canjear. El corte debe estar marcado atendido por el dueño. Los premios de cortes atendidos antes de verificar se procesan al verificar. Alias Gmail/autorrecomendación y recreaciones del mismo buzón no generan premios repetidos.

El envío de verificación es independiente del de recuperación: requiere **autorización explícita** y `VERIFICATION_EMAIL_ENABLED=true` en `PRIVATE_DIR/gmail.env`. Actualmente falta esa autorización/activación y las credenciales/recepción real de Gmail. No se envía al registrarse ni al iniciar el servidor. Los tokens no se muestran en API/chat y vencen a los 30 minutos.

Estos controles no identifican por sí solos a una persona ni detectan todas las cuentas falsas. Aprobar los borradores de `legal/` y el plazo de conservación del registro antifraude antes de operar públicamente.

## Monitoreo
- `/health/live`: proceso HTTP activo, sin datos privados.
- `/health/ready`: PostgreSQL disponible; devuelve 503 al fallar, sin detalles de conexión.
- Pendiente en hosting: monitor externo, alertas a responsable autorizado, supervisión/reinicio del proceso, alertas de espacio/respaldos y revisión de cola n8n.
- No registrar contraseñas, cookies, enlaces privados, payloads de clientes ni errores completos de SMTP. Los enlaces secretos están en fragmentos, no en rutas de servidor.

## Respaldos y restauración
`npm run backup` crea volcado custom PostgreSQL, fotos subidas y manifest con SHA-256, en un directorio privado. No escribe contraseñas en argumentos de `pg_dump`. Necesita `pg_dump`/`pg_restore` compatibles con la versión del servidor. La CA verificada de Node se utiliza también para libpq cuando hay TLS.

`npm run test:restore` crea exclusivamente bases/fotos temporales ficticias; restaura, verifica login y fotos, detecta corrupción y rechaza restaurar sobre `reca_barberia`. No es una restauración de producción ni debe ejecutarse en NODE_ENV=production.

**Pendientes operativos:** horario y retención de copias, cifrado antes de copiar fuera del servidor, destino externo autorizado, alertas de fallo, restauración integral real en staging y tiempos objetivo de recuperación. Los checksums detectan alteraciones accidentales, no reemplazan cifrado ni autenticación. Copias locales en el mismo equipo no protegen frente a pérdida total.

El respaldo implementado contiene **DB y medios subidos (fotos WEBP, videos MP4 y música MP3/M4A)**. Ofertas, movimientos financieros y planes están en PostgreSQL; su restauración aislada también está comprobada. El campo histórico `photos` del manifest incluye ahora todos esos tipos de archivo, conservando compatibilidad con copias anteriores. Conservar aparte, cifrados: claves privadas, configuración SMTP/n8n, volumen de n8n y versión exacta de código/assets de referencia. No rotar ni perder la clave de identidad sin un plan. Una restauración productiva requiere autorización, ventana de mantenimiento, respaldo del estado actual y ensayo previo; la herramienta aislada no permite sobrescribir la base del negocio.

## Cifrado implementado y plan operativo
`npm run backup:encrypted` crea una copia DB/medios autenticada AES-256-GCM y comprueba un descifrado byte a byte. Fichero `.reca.enc` privado y clave binaria `PRIVATE_DIR/backup-encryption-key` (600) que no se imprime. Temporales de empaquetado/verificación se eliminan; la copia original de `backup` se mantiene privada sin cifrar. La prueba rechaza alteración/clave incorrecta y no sobrescribe destinos.

**No es todavía un respaldo externo**: acordar destino, programación y custodia de la clave por separado, incluyendo conservación cifrada de claves de identidad/configuración/n8n. Perder la máquina y la única clave impide recuperar el cifrado. No compartir claves en chat. Ensayar restauración completa en staging antes de anunciar recuperación de producción.

Plan y criterios de aceptación: `deployment/PUESTA_EN_MARCHA.md`. Hosting/dominio/presupuesto, destino externo, canales/destinatarios de mensajes y aprobación jurídica permanecen pendientes.

## Antes de publicar
Elegir proveedor/región/dominio/presupuesto, revisar privacidad y derechos de imágenes, completar dueño/horarios/Gmail, probar desde otra red y desde teléfonos reales, aprobar términos y conservación de datos, programar copias/alertas y completar eliminación/solicitudes de cuenta para las tiendas. Ninguna prueba local certifica disponibilidad 24/7 ni cumplimiento legal.
