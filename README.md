# RECA Barbería

Muestra de portafolio de una aplicación de reservas y gestión de barbería, con interfaz de clientes y panel del propietario.

## Incluye

- Registro, acceso, reservas y lista de espera.
- Gestión de citas, contenidos, ingresos y recomendaciones.
- Backend Node.js/Express, PostgreSQL y frontend JavaScript.
- Integraciones opcionales de correo, IA y flujos n8n.

## Ejecutar localmente

Requiere Node.js y PostgreSQL con `initdb`, `pg_ctl`, `psql` y `createdb` disponibles.

```sh
npm install
npm run db:start
npm start
```

Abre http://127.0.0.1:8081. Consulta [la guía de la aplicación](prototipo/README.md) para crear la cuenta local del propietario.

## Alcance de la muestra

Esta publicación permite revisar el código; no despliega una aplicación ni activa proveedores externos. Los correos del código son ficticios. Para usar correo o IA hay que configurar servicios propios; el remitente de ejemplo no puede enviar correo real. No se incluyen bases de datos, clientes, copias de seguridad, credenciales ni archivos `.env`. Las plantillas `*.config.example.txt` documentan la configuración sin secretos. El historial publicado se ha depurado para retirar contactos y rutas personales.

Los créditos y licencias de recursos visuales y fuentes se conservan en sus carpetas. Los documentos legales son borradores.
