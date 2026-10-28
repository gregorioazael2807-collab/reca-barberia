# Sistema de Control de Barbería — sistema privado del dueño

Entrada `/comanda/`, separada de la app de clientes **RECA Barbería**, con la misma base de datos y protección real de permisos. Interfaz negra/dorada para tablet, computadora y teléfono. No es una nueva app Android ni está publicada aún.

## IA Gocho IA — primera etapa
Sección `#gocho` privada y simple: escribir/Enviar, Enter envía y limpia (Shift+Enter salto de línea), respuesta dorada y opciones/historial cerrados. Consultas reales de agenda, gastos e ingresos; propuestas de fin de semana libre y ofertas porcentuales. Cambios únicamente con confirmación expresa en la respuesta, revalidación e idempotencia. No cancela/mueve citas ni altera precios históricos. OpenAI configurado y habilitado privadamente con autorización y 10 consultas/día UTC (no tope en dólares); tres consultas reales de agenda verificadas. Nueva clasificación de ofertas pendiente de la primera orden real del dueño; pruebas aisladas y sin crear ofertas comerciales. Guía y límites: `backend/GOCHO_IA.md`.

## Acceso
Solo el dueño accede a administración. La primera cuenta se crea con la invitación privada de un solo uso de `.local/owner-setup-url.txt` (PRIVATE_DIR en producción). No hay registro público de administradores. No publicar esa invitación en QR/chat. El correo reservado no concede permisos por sí solo.

La app de clientes no muestra el candado administrativo. Los marcadores antiguos `/#admin` y `/#setup/...` redirigen a Comanda. Los clientes no pueden consultar ni modificar datos administrativos o financieros aunque conozcan las rutas.

## Inicio y menú
Al entrar se muestra solo el fondo, sin bienvenida, título «Panel del dueño» ni formularios juntos. El menú izquierdo permanece cerrado al abrir/recargar; tocar **Menú** lo despliega. Cerrar con **Cerrar menú**, tocando fuera, Escape o seleccionando una sección. Es un diálogo modal con foco de teclado contenido. Abrir/cerrar no vuelve a dibujar formularios ni borra cambios sin guardar. Las herramientas permanecen en sus secciones.

## Entrega 1 — implementada y probada
- Agenda, bloqueos, cancelaciones y marcado atendido.
- Horarios/descansos, zona horaria, anticipación, separación mínima y servicios/precios.
- Perfil del barbero: subir, recortar, guardar o retirar su foto. Aparece también en cliente; el logo es independiente.
- Galería simplificada: foto, nombre del corte, categoría, estilo y confirmación de foto propia/permiso. Orden final automático; nombre igual en ES/EN, sin fingir una traducción. Metadatos registran la declaración del dueño, no una licencia verificada. Fotos de terceros requieren documentación por el flujo completo, no declarar que sean propias. Gestión de orden/visibilidad permanece disponible.
- Borradores de citas/lista de espera y cuenta del dueño. Entrega de mensajes todavía apagada.
- Fondo decorativo del usuario desde Descargas, optimizado en `assets/brand/comanda-renka-fondo.webp`. No se afirma que sea fotografía del local real.

## Entrega 2 — ofertas y videos implementados y probados
### Ofertas
En **Ofertas**, crear o editar título, descripción, condiciones ES/EN, servicios, porcentaje entero 1–90 y fechas locales de la barbería. Activar/retirar; solo se muestran al cliente ofertas vigentes y activas. Se muestran en Inicio y `#offers`.

Al confirmar una reserva, el cliente selecciona explícitamente una oferta compatible. El servidor vuelve a comprobar servicio, vigencia actual y fecha de cita, calcula el precio en centavos y conserva las condiciones en la cita. No se combina con el 25 % por recomendaciones. Cambiar/retirar una oferta no altera precios confirmados; reprogramar conserva las condiciones acordadas. No se crean promociones ficticias.

### Videos
En **Videos**, subir un video para Crear cuenta y otro para Inicio · Reservar Cita Ahora. Requiere confirmar derechos de video/música. Formato admitido: MP4 H.264, audio MP4/AAC, hasta 30 MB, 60 segundos y 3840 píxeles por dimensión. Los videos existentes duran 15 segundos.

Se inspecciona la estructura MP4 y se rechazan referencias externas, formatos no admitidos y archivos que excedan límites; **no se transcodifica ni se realiza un análisis antivirus o una decodificación exhaustiva de cada frame**. Convertir otros codecs antes de subirlos. Archivos se guardan con nombre UUID y se sirven con soporte Range. No reproducir sonido automáticamente: cliente pulsa reproducir. Se puede volver al video original.

Al reemplazar/quitar un video, el archivo anterior se conserva para no romper reproductores/referencias; limpieza de huérfanos y cuotas de almacenamiento son pendientes operativos. Respaldos ya admiten fotos WEBP y videos MP4, sin perder compatibilidad con manifest anteriores.

## Quitar contenido
- **Quitar música de toda la app**: deja de seleccionar música para clientes/asistente, pero la conserva en biblioteca.
- **Quitar de la app** en un archivo activo: retira esa pista o el video de las pantallas donde esté seleccionado.
- **Quitar video de esta pantalla**: oculta Inicio o Crear cuenta sin poner otro video. **Volver al video original** es una acción distinta y explícita.
- **Quitar de biblioteca**: retirada lógica; primero quitar de la app si está activo. No borra definitivamente archivos.

## Bibliotecas separadas — 10 + 10 guardados
Menú **Biblioteca de música** y **Galería de videos**: 10 pistas instrumentales jazz/funk CC BY 4.0 y 10 clips modernos de Mixkit de cortes/barbería con fichas/licencia Stock Video Free; la colección anterior, rechazada por el dueño, se archivó. Para este proyecto, no para redistribuir como stock. Buscar, escuchar/ver, subir, elegir para la app y retirar de biblioteca. Videos de referencia, no trabajos de RECA. El lote se guardó sin cambiar las selecciones actuales. Desmarcar **Usar al guardar** para subir nuevos archivos solo a biblioteca.

Los créditos originales acompañan cualquier selección en la app, también el registro. Se impide retirar un archivo activo. Quitar de biblioteca es lógico, no borra físicamente. Guía y condiciones: `backend/MEDIA_LIBRARY.md`. Todos los 20 archivos probados en Chromium/WebKit; biblioteca y medios incluidos en respaldos.

## Música — implementada y probada
En **Música**, subir MP3 o M4A/AAC, hasta 20 MB y 10 minutos, con confirmación explícita de derechos para reproducir en el negocio y compartir en la app. No incluye música seleccionada automáticamente ni acceso a Spotify/YouTube; no se contacta a proveedores.

La selección guardada es la misma en el asistente y la app de clientes con sesión. El dueño puede marcar Intentar reproducción automática al entrar en la app de clientes; habilitado por petición expresa. Si el navegador permite sonido, arranca; si lo bloquea, aparece Activar música. Cada dispositivo controla volumen/pausa y puede silenciar (preferencia local respetada). No se puede garantizar sonido sin primer toque en todos los teléfonos. No se transmite la salida de audio de la tablet ni se sincroniza el instante de reproducción. El reproductor ♫ Música se mantiene al cambiar de sección y puede repetir la pista. Evitar reproducir a la vez la música de un video y la pista de fondo.

Validación estructural de MP3/M4A y límites; sin transcodificación, antivirus ni decodificación exhaustiva. Revisar metadatos personales de los archivos antes de compartir. Al cambiar/quitar una selección se conserva el archivo anterior; limpieza de huérfanos/revocación de enlaces requieren tratamiento operativo antes de producción. Respaldos/restauración admiten MP3/M4A además de fotos/videos. Fixture de prueba de audio se deriva del video local existente y no se selecciona en los datos reales del negocio.

## Entrega 3 — control financiero operativo implementado y probado
En **Ingresos y gastos**:

También aparece **Ingresos en espera de citas**, compartido con Agenda: clientes únicos, citas confirmadas sin cobro registrado y suma de sus precios guardados (con descuentos). Incluye todas las fechas, no solo la semana elegida; excluye cancelaciones, retenciones y pagos ya registrados. Es previsión, nunca ingreso recibido ni beneficio garantizado. No inserta movimientos. Se recalcula al actualizar o volver a entrar; confirmar llegada y cobro retira la previsión y registra el ingreso real una sola vez.
- Registrar manualmente ingresos recibidos o gastos pagados en USD, fecha local, categoría, método y nota. Confirmación explícita de recepción/pago. No admitir fechas futuras ni importes fraccionarios en centavos.
- **Agenda → Confirmar llegada y cobro**: solo el dueño, el día local de la cita, confirma expresamente que el cliente llegó y entregó el importe. Registra automáticamente una sola vez el precio congelado de la reserva (con descuentos), no el precio actual del catálogo. Reservar o marcar atendida no crea ingresos. Llegada y finalización son estados independientes.
- Guarda hora real, dueño que confirmó, importe y vínculo al movimiento financiero en una transacción. Múltiples toques/reintentos no duplican cobros. Un importe cero confirma llegada sin movimiento ficticio. Método `other`: no se supone efectivo o tarjeta. Cobros manuales previos vinculados impiden crear uno adicional sin revisión.
- Tras confirmar llegada/cobro, no se permite cancelar ni mover esa cita; una corrección financiera se hace con anulación motivada, conservando historial. Reintentar llegada no repone un ingreso anulado. No volver a registrar manualmente el mismo cobro. El cliente puede ver su llegada e importe registrado, pero no confirmarlos ni acceder al reporte financiero.
- Pruebas aisladas: `backend/tests/arrival.test.js` (permisos/CSRF, concurrencia, descuentos, fechas locales, rollback, correcciones) y `npm run test:arrival` (tablet Chromium, iPad/iPhone WebKit, ES/EN, persistencia y actualización del resumen sin recargar).
- Solicitudes con clave de idempotencia no duplican un mismo movimiento. Clave reutilizada con otros datos se rechaza.
- Seleccionar una fecha de inicio para un período de siete días. Fecha inicial sugerida: lunes de la semana actual; dueño puede cambiarla. Los límites del reporte usan la zona de la barbería, no 168 horas fijas.
- Totales de ingresos/gastos, saldo operativo y gastos por categoría. Lista muestra como máximo 500 movimientos; totales incluyen todos.
- Anular errores con motivo, conservando registro original; reemplazo se registra como nuevo movimiento. No borrar historia ni alterar cobros automáticamente al cancelar citas.
- Meta de ingresos y límite de gastos opcionales definidos por el dueño; presupuesto restante/excedido y distancia a la meta. Sin metas/cifras inventadas, sin predicciones garantizadas.

El saldo operativo no es ganancia neta final ni contabilidad fiscal certificada: impuestos, propinas, comisiones, deudas/cuentas por cobrar y otros costes deben registrarse/revisarse según el negocio. No hay conexión bancaria, pasarela de cobro ni facturación fiscal. Finanzas son privadas y no se exponen en la app de clientes. Conservación legal y obligaciones fiscales requieren revisión.

## Sincronización
Precios, horarios, galería, ofertas y video de Inicio se sincronizan aproximadamente cada 5 segundos en pantallas de consulta y al volver a la app. Reproductores se conservan si la fuente no cambió. No se reemplazan formularios de acceso, nombres sin guardar ni reservas en curso. Cambios del video de registro se ven en la siguiente carga de la pantalla; no se borra un registro que se esté completando. La agenda se valida en servidor al consultar/retener/confirmar.

## Pruebas aisladas
```sh
npm test
npm run test:comanda
npm run test:content
npm run test:browser
npm run test:mobile
npm run test:rewards
npm run test:restore
```
Datos temporales separados del negocio; cero envíos a proveedores. Validan permisos, invitación, sincronización, precios efectivos, cargas/reproducción, finanzas reales y restauración de DB/fotos/videos/ofertas/finanzas. Evidencia aislada: `../evidencias/comanda-renka-tablet.png`.

## Pendientes de publicación
HTTPS/hosting/dominio, dueño y horarios reales si no se han completado, pruebas físicas, proveedores/entregas autorizadas, privacidad/condiciones, copias externas cifradas/programadas, alertas y cuotas/limpieza de medios. El dueño controla las opciones habilitadas, no el código, sistema operativo ni protecciones de seguridad. No considerar terminado el acceso público 24/7 ni el envío de mensajes.
