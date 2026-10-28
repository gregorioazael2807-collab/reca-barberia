# Bibliotecas RECA: videos y música

## Corrección actual
El dueño rechazó los 10 clips Commons iniciales. Archivados (no eliminados físicamente); sustituidos en biblioteca por 10 clips modernos de Mixkit con Stock Video Free License, no Restricted. Fichas/condiciones comprobadas, revisión visual y pruebas de reproducción. Se mantienen fuentes, créditos y modificaciones; creador no identificado no se inventa. Solo biblioteca privada de recursos del proyecto RECA y videos elegidos para mostrar en la app: no servicio de stock, reventa, redistribución de originales ni descargas masivas. Condiciones: https://mixkit.co/license/#videoFree y https://mixkit.co/terms/.

Por solicitud expresa, `musicAutoplay:true`: cliente con sesión intenta reproducir pista elegida al entrar. El navegador puede bloquear sonido; fallback Activar música con gesto. Silenciar/pausa respetados con preferencia local por cuenta/dispositivo; volumen inicial 35%. No sortear políticas de autoplay ni prometer reproducción sin toque universal. Dueño tiene ajuste en Música y API privada PUT /api/admin/music/playback. Comanda mantiene reproducción manual. Biblioteca/subidas no cambian pista publicada salvo elección explícita.

`--replace-videos` importa 10 clips nuevos, archiva los anteriores Commons y habilita la configuración solicitada; aborta si hubiera un anterior publicado, sin romper activos. Este lote no tenía ninguno publicado; selecciones Inicio/Registro intactas. Bloqueo de transacción 731204 compartido con otros cambios.

`media_library` guarda archivos y metadatos privados del dueño: clase, título, URL local, duración, permisos, fuente/autor/licencia, modificaciones y miniatura cuando existe. No aparece íntegra en `/api/public`; solo la selección y sus créditos. `/api/admin/library` y seleccionar/archivar requieren dueño, origen válido y CSRF para cambios.

## Retirar selecciones
DELETE /api/admin/videos/:slot oculta el video y limpia selección/crédito; no vuelve automáticamente al original. `hiddenWelcomeVideos` viaja en site/public. PUT con nueva selección o null (restaurar original) desoculta explícitamente.

DELETE /api/admin/library/:id/use limpia solo selecciones que todavía coincidan, con bloqueo/transacción: música o ambos slots de video. No borrar una selección posterior por una solicitud vieja; 409 si ya no coincide. Permisos de dueño/origen/CSRF. UI: Quitar música de toda la app, Quitar de la app y Quitar video de esta pantalla. Archivar sigue separado y no permitido mientras activo; archivos físicos conservados.

Sincronización cliente existente; no interrumpir formularios pendientes. Pausar reproductor de video que se retire y previews al cambiar sección en comanda. Reproductor de música externo a #app persiste salvo retiro de pista.

## Uso
- Menú **Galería de videos** y **Biblioteca de música**: búsqueda, reproducción previa, subir archivos, elegir para la app, retirar de biblioteca.
- Las subidas quedan registradas. Desmarcar **Usar al guardar** para guardar sin publicar; las selecciones actuales no se alteran al importar el lote.
- Música MP3/M4A hasta 20 MB/10 minutos; MP4 H.264 hasta 30 MB/60 segundos. Permiso del dueño obligatorio para subidas. Inspección estructural, no antivirus/decodificación exhaustiva.
- Selección con créditos originales; renombrar una pista no sustituye el título original atribuido. Cada dispositivo conserva control de reproducción; intento automático configurable y limitado por navegador, sin audio en directo. El reproductor de fondo persiste al navegar.
- No se archiva un archivo actualmente seleccionado. Retirada lógica, archivos conservados: limpieza, cuotas y revocación física de URLs pendientes.

## Lote inicial: 10 + 10 (videos posteriormente rechazados/archivados)
Diez pistas instrumentales de jazz/funk, Kevin MacLeod / Incompetech: Local Forecast - Elevator, George Street Shuffle, Airport Lounge, Lobby Time, Funkorama, Dispersion Relation, Bass Vibes, Mining by Moonlight, Montauk Point y Funky Chunk. La web del autor ofrece CC BY 4.0; mantener autor, título, fuente, licencia y conversión a M4A en créditos. No incluye canciones de Dr. Dre/Snoop Dogg.

Diez archivos distintos de Wikimedia Commons: Lady barber Ghana, Barber 1/2/3, barbería tradicional Okigwe, práctica Tokio, proceso de corte para caballeros, cortes de reclutas US Marines, barbería histórica 1934 y cine de barbería 1908. CC BY/CC BY-SA/dominio público según cada fuente; guardar licencia exacta y autor. Fragmentos de hasta 30 segundos en H.264 sin audio para evitar superposición con música. El de Marines usa el segmento 350–380 s, revisado visualmente para mostrar cortes, no el inicio de recepción de reclutas. Videos históricos identificados como tales, no estilos modernos ni trabajos/local/clientes de RECA.

Fuentes y licencias visibles en cada tarjeta; al elegir un video/pista los créditos pasan a la app (incluido registro). CC BY-SA se mantiene para el fragmento/miniatura derivados; no afirmar que la licencia del medio cambia la del código de la aplicación. Las licencias de copyright publicadas no garantizan derechos de imagen/model release, marcas ni aprobación comercial: revisar el uso concreto antes de publicidad/producción. Material externo siempre rotulado como no producido por RECA. No se debe borrar o ocultar la atribución.

## Importación explícita
`node backend/import-media-library.mjs .local/stock-manifest.json`: exactamente 10 pistas/10 videos, fuentes HTTPS de Incompetech/Commons y licencias admitidas, hashes comprobados, inspección y miniaturas normalizadas. Copia a UUID en uploads, inserta en una transacción; revierte archivos nuevos si falla. Idempotencia por clase/fuente. No descarga por API ni cambia settings públicos. El manifiesto y preparación/FFmpeg están en `.local/`; no hay un servicio externo de búsqueda en la app ni búsquedas simuladas.

Respaldos PostgreSQL/uploads incluyen biblioteca, MP4, M4A/MP3 y miniaturas WEBP. Pruebas usan bases/directorios aislados y archivos reales de prueba. Verificar restauración y copia externa cifrada antes de producción.
