# Recuperación de clientes por Gmail

El usuario autorizó usar `demo-54b54911@example.com` como remitente de recuperación y enviar una prueba exclusivamente a esa misma dirección. **No autorizó WhatsApp, mensajes de citas ni otros destinatarios de prueba.** El flujo n8n de citas continúa en modo borradores.

## Configuración privada y activación
1. Iniciar sesión privadamente en la cuenta Gmail del negocio. Activar verificación en dos pasos cuando sea necesario.
2. Crear una contraseña de aplicación en https://myaccount.google.com/apppasswords. Si Google no ofrece esa opción, revisar la configuración de seguridad de la cuenta; no utilizar la contraseña normal ni desactivar protecciones.
3. Abrir `.local/gmail.env` y completar **solo** `GMAIL_APP_PASSWORD`. Guardar privadamente; nunca mostrar el contenido en chat/logs o subirlo a servicios externos. Archivo con permisos 600, directorio privado y excluido de Git.
4. Ejecutar `npm run mail:test`. El destinatario está fijado al remitente autorizado. Sin credenciales válidas no se conecta a Gmail. Un resultado de aceptación SMTP no garantiza recepción.
5. Comprobar Bandeja de entrada/Spam. **Solo tras confirmar recepción**, ejecutar `npm run mail:enable -- --confirm-received`.
6. Recargar la aplicación. La configuración se vuelve a leer sin reiniciar. `GET /api/auth/recovery-status` informa si está habilitada, sin exponer usuario/contraseña.
7. Probar «¿Olvidaste tu contraseña?» con una cuenta **de cliente** registrada. Confirmar recepción, abrir el enlace, cambiar contraseña y verificar el acceso. No considerar la función terminada solo por una prueba SMTP.

## Comportamiento y seguridad
- SMTP Gmail con TLS verificado en puerto 465, sin logger/debug y con tiempos de espera. No contactar Gmail desde las pruebas automatizadas: usan transportes simulados.
- Enlaces de 30 minutos, token aleatorio almacenado hashed, un solo uso y revocación de sesiones. La cuenta del dueño no se modifica por este flujo.
- Se confirma el token en PostgreSQL **antes** de enviarlo. Peticiones repetidas no invalidan ni reenvían un enlace en curso o enviado. Un fallo invalida el enlace no entregado y permite nueva solicitud.
- Respuesta pública uniforme para clientes existentes, cuentas inexistentes y dueño. Nunca se devuelve el enlace ni se revela la existencia de una cuenta.
- Cuando está deshabilitado, continúa el modo borrador privado. Cuando está habilitado, los borradores locales se eliminan después del intento de entrega; los errores del proveedor no se imprimen.
- En instalación local el enlace exige la misma red Wi-Fi y computadora encendida. Una IP cambiada deja enlaces antiguos inaccesibles. Publicación con HTTPS estable y cookies seguras sigue pendiente.
- Gmail tiene límites de envío; este adaptador local no certifica disponibilidad ni es un proveedor transaccional de producción. Monitoreo de entrega y antifraude/verificación de correo siguen pendientes.

## Verificación de correo — autorización independiente
El transporte de verificación está implementado, **sin autorización ni activación todavía**. Habilitar recuperaciones no habilita verificaciones. Solo tras autorización y prueba de recepción específica, agregar `VERIFICATION_EMAIL_ENABLED=true` privadamente. No se envía al registrarse ni al iniciar el servidor; el cliente lo solicita para su propio correo desde Mi cuenta, con sesión y CSRF. Enlaces de 30 minutos y un solo uso. Los premios nuevos requieren ambos correos verificados; completar corte antes de verificar deja el premio pendiente.

En servidor, los archivos privados se ubican en `PRIVATE_DIR` en lugar de `.local/`. Nunca dentro del directorio de fotos o del frontend. Guía: `../deployment/README.md`.

## Pruebas
`npm test` incluye configuración privada/TLS, prueba de destinatario fijo, envío simulado después del commit, no enumeración, cambio real de contraseña, repetición y recuperación tras fallos, todo sin proveedores y en bases aisladas.
