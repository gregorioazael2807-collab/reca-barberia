# IA Gocho IA — conversación, agenda, finanzas y ofertas

## Respuestas generales sin nuevos permisos
Gocho responde preguntas generales mediante `help.answer` (máximo 4000 caracteres). No tiene búsqueda web ni acceso a información en directo. `datetime` devuelve fecha y hora desde el reloj del servidor y la zona configurada de la barbería, sin confiar en horas inventadas por el modelo. Respuestas generales no crean propuestas ni permiten confirmar cambios. Se mantienen intactas las herramientas existentes, los permisos, la auditoría, las cuotas y las confirmaciones. Contexto limitado a tres órdenes anteriores, sin respuestas previas ni datos del negocio.

## Actualización: pantalla simple y ofertas
La configuración local está habilitada con autorización del dueño. Tras advertir del posible aumento de cargos, autorizó retirar el límite diario: `GOCHO_DAILY_LIMIT=0`. Permisos, controles de abuso y confirmaciones siguen aplicando; no se han habilitado todas las acciones administrativas. La conexión real de agenda fue verificada con sus tres consultas completadas; no se gastaron llamadas adicionales para el diagnóstico. Nueva clasificación de ofertas pendiente de la primera orden real del dueño, sin anunciar una prueba real que no se ha hecho.

Pantalla simplificada: escribir/enviar y respuesta dorada «RESPUESTA PARA TI», consultas rápidas sin IA, Más opciones y Ver historial cerrados. Enter envía y limpia; Shift+Enter añade una línea. Si falla se recupera la orden para reintentar. Los botones de confirmación están en la respuesta.

Acción adicional `create_offer`: extrae porcentaje y servicios (`men`, `kids`) más fechas de la misma orden. Si faltan datos pide la orden completa sin crear oferta. Solo descuentos porcentuales 1–90%, hasta 31 días y comienzo dentro de 90 días. Título/descripcion/condiciones ES/EN generados por plantillas fijas, no texto comercial inventado. No acumula con otros descuentos ni cambia precios de citas confirmadas. Presenta descuento, servicios, fechas y precios actuales para revisión.

Confirmar publicación revalida servicios activos, precios/nombres, zona, vigencia y propuesta de 15 minutos; comparte `offerData` con administración manual. Oferta activa y auditoría se guardan atómicamente con idempotencia y bloqueo 731204. Cliente ve la oferta durante su vigencia mediante sincronización existente. No se generan cobros ni se reescriben reservas. No publica por el solo hecho de pedir una propuesta ni edita/elimina ofertas existentes.

Verificado con 121 backend + 14 frontend y navegador aislado: oferta ausente antes de confirmar, presente en API del cliente después, precio histórico conservado, doble confirmación única, cambios de precios/servicios y caducidad rechazados. No hay acceso ilimitado del modelo: las demás acciones siguen restringidas.

Las secciones siguientes documentan el diseño/activación inicial; la indicación de activación pendiente corresponde a esa entrega anterior.

Panel privado: `/comanda/#gocho`. Comparte la base de RECA, no una copia operativa.

## Lo implementado
- Consultas reales de agenda (sin nombres/contactos), gastos pagados e ingresos recibidos registrados. Importes en centavos USD; movimientos anulados excluidos. No infiere cobros de citas atendidas ni beneficio contable/fiscal.
- Consultas directas sin IA disponibles aunque OpenAI no esté configurado.
- Órdenes de texto interpretadas por OpenAI mediante JSON restringido a `agenda`, `gastos`, `finanzas`, `weekend_off`, `create_offer`, `datetime`, `help`. Los resultados del negocio y la hora los construye el servidor a partir de datos reales; solo las respuestas generales de `help` las redacta el modelo.
- Sábado/domingo libre como **bloqueo temporal de agenda**, no cambio del horario semanal. Primero propuesta; ninguna cita se mueve/cancela. Si existe cualquier intervalo ocupado, se informa y no se puede confirmar. No se permite bloquear encima de reservas, retenciones vigentes o bloqueos.
- Confirmación expresa en un segundo POST: revisión de disponibilidad, caducidad de 15 minutos, zona horaria sin cambios y operación idempotente en transacción con el mismo bloqueo de concurrencia del calendario. Fechas futuras, máximo 90 días para preparar el fin de semana. Retirar el bloqueo desde Agenda.
- Auditoría privada de consultas, fallos, propuestas y acciones confirmadas en `gocho_requests`. Idempotencia evita repetir una llamada de IA por reintento con la misma clave. Consultas interrumpidas pasan a fallidas al consultar el historial después de 2 minutos; no se anuncian ejecutadas. El bloqueo y su auditoría se guardan juntos.
- Lecturas de agenda limpian automáticamente retenciones vencidas, igual que el resto del sistema; no alteran reservas confirmadas.

## Configuración privada — habilitada localmente

No se realizó ninguna compra ni llamada real de desarrollo fuera de la cuota/auditoría. El dueño ya efectuó consultas reales de agenda después de autorizar la activación. ChatGPT y el API de OpenAI pueden tener facturación separada.

1. Revisar precios del modelo y decidir el presupuesto/medio de pago en la cuenta de OpenAI. Crear una clave de proyecto para RECA con permisos mínimos aplicables. No compartirla en el chat ni introducirla como orden del asistente.
2. Copiar `backend/gocho-aiconfig.example.txt` al directorio privado del servidor como `gocho-ai.env` (localmente `.local/gocho-ai.env`). Archivo de permisos `600`, directorio privado `700`, nunca dentro de `prototipo`, medios o un repositorio público. Editar directamente en un editor local privado.
3. Completar `OPENAI_API_KEY`, revisar `GOCHO_MODEL=gpt-4.1-mini` y `GOCHO_DAILY_LIMIT=10`, y cambiar `GOCHO_ENABLED=true` **solo cuando se autorice activar el API y su gasto**. La configuración de entorno prevalece sobre el archivo.
4. Reiniciar el servidor y probar una consulta no sensible desde el panel dueño. No hay comprobación automática de clave que consuma llamadas al arrancar.

Límite de la aplicación: 10 llamadas naturales por dueño y día UTC por defecto (configurable de 1 a 50; 0 elimina el límite diario con autorización de gasto), incluidas llamadas fallidas; reserva transaccional previa al contacto con el proveedor. Comando máximo 1000 caracteres, salida del modelo máximo 800 tokens y tiempo de espera de 20 segundos. Consultas directas no consumen API. El modo sin límite diario muestra consumo real y advertencia de cargos en la UI. **Esto no es un límite en dólares**: revisar créditos, recargas automáticas, presupuestos y alertas del proveedor; un presupuesto/alerta de proyecto no garantiza por sí solo un corte de facturación. Nunca se ha prometido un coste mensual determinado.

## Protección y límites

- Solo dueño autenticado, origen y CSRF en escritura. Los clientes no acceden al historial ni al modelo.
- Se envían a OpenAI la orden escrita, hasta tres órdenes previas del mismo hilo durante 30 minutos y fecha/zona de referencia, junto al esquema y las instrucciones del clasificador. No se envían cuentas, contraseñas, claves, movimientos, notas financieras, agenda completa ni contactos del backend. Una orden escrita puede contener datos personales: no incluir datos innecesarios.
- La clave solo se usa desde el servidor, en HTTPS al endpoint fijo de OpenAI; no aparece en el frontend, el historial, las respuestas de error ni los mensajes al modelo. Se rechazan patrones de claves OpenAI y contraseñas pegadas como órdenes; no es un detector universal de secretos.
- `store:false` solicita no almacenar la conversación como recurso del API; no equivale a una garantía de retención cero frente a las políticas de seguridad del proveedor. Revisar términos/privacidad antes de uso comercial.
- Sin SQL generado por IA, ejecución de código, acceso a archivos, herramientas arbitrarias ni permisos para cambiar precios base, cuentas, finanzas o enviar mensajes. Únicamente puede proponer la creación de ofertas porcentuales; publicarlas requiere confirmación expresa. Intenciones/fechas se validan otra vez en servidor; periodo de consulta máximo 31 días.
- Contexto limitado: con threadId válido se envían hasta tres órdenes anteriores del mismo dueño/hilo, de los últimos 30 minutos. No se envían respuestas ni resultados de herramientas. Nueva conversación reinicia el hilo; no es memoria ilimitada ni conversación general sobre toda la base. Auditoría guardada privadamente en PostgreSQL; requiere política de retención y protección de backups antes de producción.
- API ausente, cuota agotada o fallo del proveedor no detienen las reservas ni las funciones normales de RECA.

## Verificación

`npm test` incluye pruebas de permisos, datos financieros, exclusión de anulados, idempotencia, cuotas, conflictos al confirmar, caducidad, cambio de zona y fin de semana DST de 47 horas. `npm run test:gocho` usa PostgreSQL aislado y proveedor **simulado solo en la prueba**, con Chromium/WebKit y anchos 320/390/768/1440. No escribe registros en la base comercial ni llama a OpenAI.

Pendiente: primera orden real de oferta con la nueva clasificación, ampliar funciones de forma controlada, HTTPS público y revisión legal/retención. La conexión real de agenda ya se verificó después de la activación autorizada; no implica que todos los cambios de la aplicación estén habilitados para la IA.
