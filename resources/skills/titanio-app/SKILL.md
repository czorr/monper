---
name: Titanio App
description: Usa esta skill para cualquier tarea en la web app de Titanio: navegar, buscar información y ejecutar acciones en Inbox, pedidos, clientes, productos y precios, rutas, calendario, reportes, To-Dos, equipo, agentes, llamadas, configuración y herramientas internas. Cárgala también si el usuario se refiere a la pantalla actual de Titanio sin nombrar la aplicación. No corresponde a los ajustes del navegador Titanio.
keywords: [Titanio, Titanio App, app.titanio.ai, app.titanio.dev, HireSeals, inbox, pedidos, clientes, precios, rutas, calendario, reportes, To-Dos, equipo, configuración]
author: Titanio
host: app.titanio.ai
---
# Titanio App

Eres el agente del navegador oficial de Titanio. Esta guía te permite operar su **web app** con la sesión del usuario. Carga esta skill antes de actuar en ella y consulta la sección correspondiente a la tarea. La navegación y los procedimientos están contrastados con `frontend/web-app` del monorepo el 21 de septiembre de 2026. La interfaz observada manda si una versión posterior cambia un control.

## 1. Entrar y orientarse

- Producción: `https://app.titanio.ai`. Desarrollo: `https://app.titanio.dev`. También existe el entorno local `https://local.app.hireseals.ai:5173`. Conserva el entorno que esté usando el usuario; nunca cambies de desarrollo a producción para sortear un error.
- Busca primero la pestaña de Titanio con `list_tabs`. Si el trabajo trata sobre lo que el usuario está viendo, usa esa pestaña. Sigue las reglas de pestañas del navegador; `page.goto` navega la pestaña activa, no crea otra.
- `/` conduce a `/inbox`. La barra izquierda muestra los módulos habilitados para la empresa; no todas las cuentas ven los mismos. Un error al cargar módulos no significa que no existan: usa el reintento visible.
- El selector de empresa está arriba en la barra lateral. El menú del usuario está abajo, en su nombre/avatar. Desde ahí se abren Configuración, opciones de apariencia, ayuda y cierre de sesión según la versión.
- Antes de escribir datos, verifica la empresa seleccionada, el registro concreto y, en Inbox, el buzón/canal. Cambiar de empresa cambia la sesión y el contexto de trabajo: espera a que termine y vuelve a leer la pantalla. No reutilices IDs ni formularios de la empresa anterior.
- La interfaz puede estar en español o inglés. Usa las etiquetas que veas; los nombres bilingües de esta guía son orientación, no selectores fijos.
- **Configuración de la web app** se abre dentro de la página. La herramienta `open_settings` abre los ajustes del **navegador** y no sirve para configurar la empresa, sus usuarios ni sus agentes.

## 2. Cómo operar y comprobar resultados

Tu herramienta principal es `run_js`, con `page` de titaniowright. No existe un global `titanio` que ejecute estas operaciones de negocio. Usa los controles de la página.

```js
// Leer la pestaña activa antes de elegir controles.
return await page.snapshotText();
```

Usa `page.clickRef(n)` y `page.fillRef(n, texto)` con referencias de la última observación, o selectores obtenidos de la página. Tras navegación, filtros, apertura de diálogos o cambio de conversación, vuelve a observar: las referencias anteriores pueden corresponder a otro control. `page.evaluate` permite leer el DOM y `page.waitForSelector`/`page.waitForText` esperar un estado real. No copies selectores inventados ni números de referencia de ejemplos.

- En menús personalizados, pulsa el control y luego la opción visible. `selectOption` solo corresponde a un `<select>` nativo. Los diálogos pueden estar fuera del contenedor de la pantalla; obsérvalos de nuevo.
- Busca por nombre, correo, SKU, fecha o folio y abre la coincidencia correcta. Recorre paginación o carga más resultados antes de concluir que algo no existe. No confundas lista filtrada vacía con ausencia de datos.
- Los editores de mensajes y reportes pueden ser `contenteditable`. Identifica el editor correcto, introduce el texto y vuelve a leerlo. Evita Enter en WhatsApp cuando todavía estás preparando un mensaje: puede enviarlo.
- Ejecuta la acción pedida y verifica el resultado guardado. Un borrador, una fila optimista, un botón pulsado o una petición aceptada no son una operación completada. Busca el estado final, el registro actualizado o el mensaje sin error; si una operación sigue pendiente, dilo así.
- Antes de repetir un envío, creación, captura o importación tras un error, comprueba si el primer intento produjo el registro. Usa el reintento de la operación fallida cuando exista para evitar duplicados.
- Puedes descubrir lecturas ya realizadas por la página con `page.resourceRequests({type:'fetch'})`. No asumas que `page.fetch` autentica todas las APIs: Titanio también usa autorización que la aplicación añade a sus peticiones. Si una lectura da 401/403, vuelve al flujo de sesión de la UI. No extraigas tokens, contraseñas ni secretos. Las escrituras documentadas aquí se realizan desde sus formularios.
- Para un archivo local, usa la capacidad de carga de archivos que realmente tengas o el selector del usuario. `run_js` no es una terminal ni tiene por sí solo acceso al sistema de archivos. Abrir el selector no equivale a subir un archivo.
- Para mapas o controles sin representación accesible, observa con la herramienta de captura del navegador y actúa sobre el control visible. No deduzcas coordenadas geográficas de píxeles.
- Respeta las confirmaciones de la aplicación y las reglas de autorización del agente. No añadas una confirmación a cada navegación o edición ordinaria. Si faltan datos necesarios, pregunta por esos datos concretos.

## 3. Mapa completo de pantallas

Las rutas siguientes son relativas al origen actual. La existencia de una ruta no concede acceso ni garantiza que esté habilitada para este tenant.

| Lugar | Ruta o entrada | Uso |
| --- | --- | --- |
| Inbox | `/inbox` | Conversaciones, respuestas, notas, asistente y contexto de pedidos. |
| Rutas | `/routes` | Planificación, optimización y ejecución de visitas. |
| Calendario | `/calendar` | Agenda temporal, citas y movimientos de visitas. |
| Clientes | `/customers` | Cartera de cuentas, creación, ficha y seguimiento. |
| Reportes | `/reports` | Biblioteca, carpetas, grabación y edición de reportes. |
| To-Dos | `/tasks` | Trabajo pendiente, agendado y cerrado. |
| Productos | `/products` | Catálogo por grupo comercial, precios e importaciones. |
| Producto | `/products/<productId>` | Detalle de producto; llega desde un enlace real. |
| Equipo de campo | `/field_team` | Indicadores y actividad de representantes. |
| Pedidos | `/orders`, `/orders/<orderId>` | Listado y detalle, documento y conversación asociada. |
| Dashboard | `/dashboard` | Resumen de indicadores, embudo, pedidos y actividad. |
| Ventas | `/sales` | Métricas y desglose del embudo por periodo. |
| Reportes de ventas | `/sales_reports` | Indicadores de ventas; distinto de los reportes de visitas. |
| Copilot | `/copilot`, `/copilot/<threadId>` | Conversaciones independientes con el copiloto. |
| Assistant | `/assistant` | Superficie anterior del asistente. |
| Agentes | `/ai_employees`, `/ai_employees/<aiEmployeeId>` | Agentes, ficha, actividad y cotizaciones. |
| Organizaciones | `/organizations`, `/organizations/<organizationId>` | Listado comercial anterior y detalle; no es el selector de tenant. |
| Números telefónicos | `/phones` | Listar, añadir y eliminar números. |
| Configuración | Menú del usuario → Configuración | Diálogo de ajustes de la web app. `/settings` es una entrada de compatibilidad. |
| Perfil | `/profile` | Pantalla de perfil; para ajustes actuales usa Configuración → General. |
| Ayuda | `/help`, `/help?article=<id>` | Ayuda integrada con búsqueda y artículos enlazables. |
| Escenarios | `/scenario`, `/scenario/<threadId>` | Crear escenarios desde conversaciones; herramienta interna. |
| Mapa anterior | `/map` | Exploración cartográfica; contiene clientes de ejemplo. Usa Rutas para guardar trabajo real. |
| Acceso | `/login`, `/sign_in`, `/sign_up` | Inicio de sesión y registro según el flujo mostrado. |
| Recuperación | `/forgot-password`, `/reset-password`, `/set-password` | Recuperar o establecer contraseña a través del flujo de acceso. |
| OAuth | `/oauth/select-tenant`, `/oauth/consent` | Selección de organización y consentimiento de una autorización en curso. |
| Enlaces compartidos | `/open` | Resolver enlaces de la aplicación; conserva el destino y contexto. |

Entradas anteriores: `/field_sales` redirige a la superficie de campo actual; `/notetaker` abre `/reports?record=true`; `/team` conduce a Configuración → Equipo. Sigue la redirección real en vez de buscar controles de versiones antiguas.

Vistas de demostración o incompletas: `/training`, `/support`, `/retention`, `/collections`, `/analytics`, `/action_items` y `/conversations/<conversationId>`. `/conversations` es el listado anterior. Las galerías `/artifacts`, `/internal/artifacts/v2`, `/internal/calls`, `/internal/error` y `/internal/whatsnew` son previews internos. Consulta la sección 12 antes de tratarlas como acciones de negocio.

## 4. Inbox: encontrar, responder y gestionar conversaciones

### Localizar la conversación

1. Abre Inbox y revisa empresa, canal y buzón. Existen canales WhatsApp, correo, API, webchat y teléfono según las integraciones disponibles.
2. Usa **Buscar…** encima de la lista. Escribe nombre del contacto, correo, asunto o fragmento relevante y abre el resultado tras revisar su vista previa.
3. La búsqueda admite `to:contacto`, `by:responsable` y `at:YYYY-MM-DD`, además de texto libre; pon entre comillas valores con espacios. `by:` se refiere al asignado, no al autor del mensaje. `at:` filtra la fecha de creación de la conversación en UTC, no cualquier fecha mencionada en el texto.
4. Comprueba los últimos mensajes y carga los anteriores si hacen falta. Abrir una conversación puede marcarla como leída.
5. Para ampliar resultados, quita el filtro de búsqueda y revisa los demás filtros. Las vistas del menú incluyen recibidos, enviados, spam y menciones. Los filtros adicionales incluyen departamento (todos/ventas/servicio), intención, actividad, solo no leídos y ocultar spam/transaccionales.

Un enlace de conversación puede incluir `/inbox?company=<tenantId>&account=<chatAccountId>&conversation=<displayId>`. Conserva los tres valores de un enlace real. El número visible de conversación no es el UUID de un pedido ni el ID de un hilo Copilot. También existe `view=received|sent|spam|mentions`.

### Responder o dejar una nota

1. En correo, pulsa **Responder** para abrir el editor si está cerrado. Comprueba **De**, **Para**, **CC** y **CCO**, especialmente al responder a todos o reenviar.
2. En WhatsApp, el editor está al pie. El menú `+` permite cambiar entre **Responder** y **Nota privada**. La nota es interna; el cambio de modo puede conservar el texto: revisa que no estés enviando una nota interna al cliente.
3. Escribe o corrige el borrador, revisa adjuntos y destinatarios. Usa la respuesta a un mensaje concreto cuando corresponda; no abras otra conversación para responder al mismo hilo.
4. Pulsa **Enviar** una vez. Espera a que termine, comprueba el mensaje y que no tenga **Mensaje no enviado**. El borrador ordinario se vacía al enviarse. Enviado no significa leído.
5. Si falla, usa **No enviado · Reintentar** en el mensaje fallido cuando aparezca; no reenvíes además desde el editor el mismo contenido.

La ventana de WhatsApp puede estar cerrada tras 24 horas. Usa **Seleccionar plantilla**, elige una plantilla aprobada del buzón y completa sus variables. No supongas que puedes habilitar una plantilla real desde la pantalla de plantillas de Configuración: actualmente esa pantalla es una demo.

El editor también ofrece adjuntos, emojis, dictado y notas de voz según el canal. Dictar texto y enviar una grabación son acciones distintas. Para correo, revisa el contenido citado y los destinatarios al usar responder a todos o reenviar. Nunca describas como enviado un borrador marcado **Redactado por IA**.

### Nueva conversación y gestión

- Usa el control de nueva conversación, selecciona canal y buzón, busca un contacto existente y comprueba su dirección. Si hace falta crear un contacto, usa el correo o teléfono válido del usuario; crear un contacto de Inbox no crea automáticamente una cuenta comercial en Clientes.
- En correo completa asunto, destinatarios, cuerpo y adjuntos. En WhatsApp puede requerirse plantilla. Comprueba el hilo creado antes de repetir.
- El menú de la fila y las acciones de selección múltiple permiten gestionar leído/no leído, prioridad, etiquetas, destacados, resolver/reabrir, posponer y eliminar según el control disponible. Posponer requiere elegir cuándo volver; resolver una conversación no confirma su pedido.
- Para operaciones en lote, revisa cuáles están seleccionadas y el resultado de cada operación si hubo fallos parciales. No presupongas que seleccionar lo visible selecciona toda la cuenta.
- El nombre/avatar abre la ficha del contacto. El botón del asistente abre el panel de trabajo; no equivale por sí mismo a activar/desactivar el agente de negocio.

### Asistente, sugerencias y pedidos dentro del hilo

- Abre el panel del asistente y lee su actividad, sugerencias y errores. Puedes pedir ajustes usando el contexto de la conversación abierta. Espera a que termine antes de editar un borrador que todavía está siendo generado.
- El control **Detalles** del negocio abre el contexto de cliente, productos/carrito, pedido y revisión de precios. Verifica al comprador: puede ser distinto de la persona que escribió el mensaje.
- Las sugerencias de inventario, cotización, precios y pedidos especiales son datos y acciones distintos. Lee los botones de la tarjeta y sus condiciones antes de aplicar un ajuste. Una consulta de precios o una respuesta de otra persona no modifica automáticamente el precio ni captura el pedido.
- **Capturar pedido** es una operación de pedido, no el botón ordinario de enviar mensaje. Revisa cliente, líneas, cantidades, precios y totales. Si se ofrece capturar y autorizar, comprende que hace ambas cosas y atiende la confirmación de diferencias de precio que muestre la UI.
- Después de capturar, espera el resultado. `submitted` significa enviado al sistema de registro y pendiente de su veredicto. `confirmed` significa aceptado; `rejected` y `review` son resultados distintos. Una captura en revisión no es una venta confirmada.
- Para tenants locales, la plataforma resuelve la entrega al sistema de registro inmediatamente; con un bridge/ERP el resultado llega de forma asíncrona. No repitas la captura por el simple hecho de seguir pendiente.
- El aviso al cliente con el folio se prepara después de la confirmación y de que exista ese folio. Comprueba el borrador y envíalo por el flujo correspondiente; capturar no equivale a haber enviado el aviso.
- Un pedido resuelto queda congelado en sus importes, partes y líneas. No inventes edición de un pedido congelado ni un historial de estados que la aplicación no conserve.
- Si falla una ejecución del asistente, usa su **Reintentar** cuando exista y revisa el nuevo resultado. No confundas reintentar al agente con reenviar un mensaje al cliente.

## 5. Clientes y seguimiento comercial

En `/customers`, busca la cuenta y abre su ficha. Revisa nombre, dirección y datos comerciales. Un representante puede ver únicamente sus cuentas; un responsable puede ver más.

**Crear cliente:** Nuevo cliente → nombre (mínimo dos caracteres) y dirección → datos opcionales de planificación (estado y frecuencia de visita) → métricas opcionales (ventas, potencial, crecimiento, capacidad, banner). Se puede crear desde un paso anterior con el nombre válido; no inventes métricas para completar campos opcionales. Después de crear se abre la ficha: comprueba que sea el registro nuevo. La asignación inicial usa el representante actual; el asistente de creación no ofrece reasignar arbitrariamente a otro representante.

**Ficha:** consulta las secciones de información comercial, visitas/reportes y citas. La frecuencia de visita tiene edición y guardado propios. **Ver reporte completo** abre `/reports?report=<id>`. **Programar cita** abre el formulario con ese cliente fijado. **Añadir a ruta** permite escoger un día de la semana disponible. Usa los controles de ubicación y mapas para consultar la dirección cuando estén presentes.

La ficha de Clientes se abre desde el listado y vive en el estado de la pantalla: no inventes un enlace `/customers/<id>` ni `?account=` para abrirla. Una cuenta sin ubicación puede impedir la planificación; informa del dato faltante y usa únicamente los controles de edición que estén expuestos.

## 6. Rutas y Calendario

**Rutas** organiza qué visitar y en qué orden. **Calendario** organiza a qué hora ocurre. La ayuda anterior puede llamar «Calendario» a ambas superficies; la planificación de rutas actual está en `/routes`.

### Preparar jornada y planificar

1. Verifica fecha, representante, zona horaria y empresa. En Rutas hay vistas `today`, `week`, `month` mediante `?view=`; Calendario ofrece `week` y `month`. Usa los botones de navegación de fechas, no una fecha inventada en la URL.
2. Si faltan valores de jornada, abre Configuración → Venta en campo: días y horas laborales, zona horaria, origen y punto de regreso. Guarda y vuelve a la semana que corresponde.
3. Para crear una ruta concreta usa el control de creación y completa los datos que pide el diálogo. Para **Armar mi semana**, abre la semana objetivo y revisa en **Armar esta semana** el periodo y la jornada antes de pulsar **Armarla**.
4. Armar agrega cuentas a las que les toca visita y puede reordenar las existentes. **Sólo reordenar** reorganiza sin agregar cuentas. Lee el resultado: cuentas colocadas, sin ubicación, sin día disponible, sin capacidad o con conflictos.
5. Comprueba las columnas de los días. Una operación parcial puede haber guardado visitas. Si falló la optimización de un día, revisa su ruta y usa **Optimizar este día**; no vuelvas a construir toda la semana a ciegas.

### Operar visitas y citas

- Abre un día o una visita para ver el detalle. Usa sus acciones para modificar horario/estado, añadir o quitar paradas, cambiar origen/regreso o jornada, y optimizar cuando se ofrezcan.
- En Rutas, reordenar visitas cambia su secuencia. En Calendario, arrastrar a otra hora reprograma la visita; comprueba día, hora y conflictos después. Prefiere los campos de edición si están disponibles para un cambio exacto.
- Crear cita permite elegir cliente, fecha/hora y los demás datos del formulario. Desde Clientes el cliente ya está fijado; desde un hueco del calendario la fecha/hora pueden estar prellenadas. Verifica esos valores antes de guardar.
- La creación rápida de un cliente desde la agenda es una creación real. Busca antes la cuenta para no duplicarla.
- Usa los estados de inicio, visita realizada o eliminación únicamente cuando correspondan al trabajo pedido. No marques visitas como realizadas por haber abierto sus fichas ni para limpiar avisos.
- Si una ruta muestra solo una vista previa sin acciones persistentes, no la presentes como una ruta guardada. El mapa antiguo `/map` no sustituye el flujo de Rutas.

## 7. Reportes, grabaciones y carpetas

La pantalla actual `/reports` es una biblioteca. Tiene búsqueda, carpetas, vistas y paginación; permite agrupar por cliente o fecha y ordenar. Algunos artículos de ayuda describen la lista lateral anterior: usa los controles de la biblioteca que veas.

- **Abrir:** busca el reporte, comprueba cliente/fecha/título y ábrelo. `/reports?report=<id>` abre uno conocido; no asumas que una búsqueda de biblioteca examina todo el texto de todas las visitas.
- **Organizar:** Nuevo folder/carpeta crea una carpeta. Sus menús permiten las operaciones disponibles de nombre/color/ubicación/eliminación. Mueve reportes desde sus menús o el selector de carpeta del documento; el arrastre también está soportado. Comprueba el destino. La navegación admite `folder=<id>`.
- **Nuevo reporte:** abre la superficie de grabación (`/reports?record=true`), elige cliente antes de empezar, título y carpeta. Inicia la grabación y usa pausa/reanudar cuando corresponda; al detenerla se sube el audio y se procesa el reporte. Espera a que termine y abra el documento guardado. Las notas humanas se conservan por separado del texto generado. Si falla el guardado final, conserva la pantalla y usa el reintento disponible. No salgas descartando audio pendiente. Requiere la participación del usuario para audio y permisos cuando corresponda; nunca simules una visita grabada.
- **Editar documento:** corrige únicamente el texto pedido dentro de **La visita**. Los cambios se guardan al salir del editor; haz clic fuera y espera **Guardado**. No busques un botón Guardar inexistente para ese editor. La barra de formato aparece al seleccionar texto y `/` al principio de un párrafo vacío abre bloques.
- **Mis notas:** es otra área debajo del documento, con guardado independiente. No significa que solo el usuario pueda verla. Para trabajo accionable crea un To-Do, no una nota que parezca una tarea gestionada.
- Si el guardado no se confirma, conserva el documento abierto y vuelve a enfocar/salir del área para reintentar. No recargues perdiendo cambios que aún no se han guardado.
- **Eliminar reporte** usa una confirmación que advierte también sobre tareas de seguimiento relacionadas. No uses la papelera para editar ni muevas un documento a una carpeta para simular que se eliminó.

## 8. To-Dos

`/tasks` contiene **Pendientes**, **Agendados** y **Cerrados**. Filtros: búsqueda, cuenta, prioridad y propios/delegados. Los enlaces admiten `tab=pending|scheduled|closed` y `customer=<id>`.

**Crear:** pulsa **Nuevo** (o `+` en pantalla estrecha; `c` fuera de campos también abre el formulario). Completa **¿Qué hay que hacer?**, detalle opcional, cuenta, prioridad, vencimiento y fecha/hora de agenda según lo pedido. El título es obligatorio. La cuenta debe elegirse antes de crear: el detalle guardado no ofrece cambiarla.

- **Vence** es la fecha límite. **Agendar** es cuándo se hará el trabajo. Son campos diferentes: una tarea puede vencer el viernes y estar agendada el martes.
- El selector de agenda aplica la hora al elegir el día: introduce primero la hora si es necesario. Quitar de la agenda no elimina la tarea.
- Sin agenda queda en Pendientes, aunque tenga vencimiento. Con agenda queda en Agendados. Hechas o canceladas están en Cerrados; cancelado no significa realizado.
- Después de **Crear**, verifica el título en la pestaña correcta; la pantalla no necesariamente cambia de pestaña automáticamente. Limpia filtros antes de crear otra copia.
- Abre la tarea para editar los campos disponibles, completarla, cancelarla, reabrirla, cambiar prioridad/fechas o eliminarla. Comprueba su nuevo estado y la pestaña donde terminó. Una fila que desaparece de Pendientes puede haberse movido a Agendados o Cerrados.

## 9. Productos, precios y pedidos

### Catálogo e importaciones de precios

En `/products`, el panel izquierdo selecciona **precio de lista** o un **grupo comercial**. El panel derecho muestra el catálogo y precios de ese ámbito; no es una lista independiente por contacto.

1. Selecciona primero el grupo correcto. Usa la búsqueda de grupos y, para comprobar su alcance, el control de clientes junto al encabezado.
2. Busca producto por los campos admitidos, aplica filtros de estado/inventario y recorre páginas. Revisa SKU, unidad, disponibilidad y precio del grupo; no mezcles precio de lista con un precio específico.
3. Para importar precios, usa **Subir** en el encabezado del grupo y elige el archivo `.xlsx`. El grupo seleccionado determina a quién se aplican los precios; el archivo no cambia ese ámbito.
4. Espera la previsualización y revisa altas, cambios, sin cambios, retirados, desconocidos y omitidos. Confirma solo el archivo/ámbito solicitado o descarta la propuesta.
5. Tras confirmar, espera el estado aplicado y el catálogo actualizado. La aceptación inicial es asíncrona: no significa que las filas ya se hayan publicado. Consulta **Historial** para revisar importaciones y autor/fecha/archivo cuando estén disponibles.
6. El menú de más opciones ofrece **Limpiar** cuando el ámbito cobra precios propios. Esa acción elimina sus precios propios; no es un filtro ni equivale a eliminar el grupo o sus clientes. Comprueba el estado resultante.

El catálogo también expone edición de destinatarios de roles de pedido por producto cuando corresponde. Abre el control de rol de esa fila, revisa el valor heredado/override, guarda el destinatario o elimina el override para heredar. Para la regla general ve a Configuración → Roles de pedidos. No inventes controles de alta/baja de productos o edición de inventario solo porque exista el catálogo.

### Pedidos y métricas

- En `/orders`, usa los filtros visibles, fechas y búsqueda para localizar un pedido. Abre su detalle y revisa estado, comprador, partidas y resumen. **Descargar** aparece si existe documento; **Conversación** abre el Inbox asociado con sus IDs reales.
- El detalle actual es principalmente de consulta. La captura se realiza desde el contexto del hilo en Inbox, no mediante un supuesto botón universal «Nuevo pedido» en el listado.
- Usa `/dashboard`, `/sales` y `/sales_reports` para métricas y desglose por periodo. En Ventas hay filtros diario/semanal/mensual y selección de etapa del embudo. Expresa siempre empresa, periodo, moneda y filtros de la cifra que informes.
- Una venta computable corresponde a un pedido **confirmed**. No sumes cotizaciones o pedidos submitted como ventas confirmadas. Si una vista muestra datos de demostración o no tiene datos, no uses esos números como resultados reales.
- `/organizations` es un listado comercial anterior: abre el detalle desde la fila, porque necesita datos de navegación y puede mostrar «Organización no encontrada» si entras por URL directamente. Permite consultar datos fiscales/contacto, dirección, compañía/sucursal y productos asociados; no sirve para crear un tenant.

## 10. Configuración de la web app y administración

Abre el menú de usuario → **Configuración**. El diálogo tiene buscador. Puedes abrir una sección conservando la ruta actual mediante el parámetro `settings=general|team|order-roles|integrations|whatsapp|phone|workday`. Por ejemplo, `/inbox?settings=team`. Conserva los demás parámetros de contexto cuando ya existan. Cerrar el diálogo elimina ese parámetro.

### General

Incluye perfil, empresa, contraseña, autenticación de dos factores, idioma y sonidos. En cada tarjeta usa su formulario y verifica el resultado; una tarjeta no guarda necesariamente las otras. Apariencia clara/oscura/sistema está en el menú del usuario. Para credenciales, usa el flujo protegido del navegador o deja al usuario completar el secreto; nunca leas valores de contraseña ni códigos de recuperación. La URL de API del agente es una opción interna visible para ciertos usuarios, no una forma de habilitar permisos.

### Equipo

Visible para administradores de plataforma o propietarios/administradores de la organización. Se refiere a la organización seleccionada; no la confundas con Equipo de campo.

- Busca miembros por nombre, correo o teléfono y filtra por estado de acceso.
- **Añadir** abre el alta: nombre, correo y teléfono son obligatorios. El formulario muestra un rol de usuario fijo, no un selector para crear administradores. Comprueba la fila y el estado de incorporación después.
- El menú de cada miembro puede ofrecer editar teléfono, reenviar bienvenida o eliminar. Solo aparecen las acciones permitidas para ese miembro. El reenvío manda una comunicación real.
- Revisa la confirmación de eliminación y el resultado. La retirada puede quedar pendiente; no afirmes que terminó si la UI lo indica así. No inventes una edición de rol para un miembro existente si no está expuesta.

### Roles de pedidos

La sección aparece cuando la empresa tiene Inbox. Configura los destinatarios de **Buyer**, **Pricing** y **Warehouse**: nombre y resolución por atributo del producto, buzón fijo o sucursal del cliente según el formulario. Para buzón introduce nombre/correo; para sucursal elige la sucursal y sus destinatarios. Guarda cada rol y verifica la definición. Los permisos de edición pueden ser más restringidos que los de lectura. Estos son destinatarios operativos, no roles de acceso de usuarios ni una autorización universal para cambiar precios.

### Integraciones y WhatsApp

- Integraciones muestra un catálogo de proveedores. Lee el estado real y la acción habilitada de cada tarjeta antes de conectar o desconectar. Para WhatsApp Business hay consulta de conexión/verificación/número/calidad y desconexión; la presencia de una tarjeta de otro proveedor no prueba que su conexión esté implementada.
- Sigue el flujo OAuth o ventana del proveedor si se abre y vuelve a comprobar el estado. Un callback o una ventana cerrada no demuestran una integración completada.
- **WhatsApp → Plantillas** utiliza actualmente datos de ejemplo y cambios locales de UI. Crear, editar o eliminar ahí no publica una plantilla en Meta. Para enviar una plantilla real usa las aprobadas que carga el compositor de Inbox.

### Teléfono / Voice Lab

En Configuración → Teléfono se elige entre los perfiles disponibles **Sales**, **FieldSales** y **Storefront**, se configuran preferencias de voz y se puede iniciar una llamada telefónica o web. Completa los datos requeridos por el perfil y revisa el destinatario; el teléfono usa formato internacional `+` y dígitos. Una llamada en cola o conectando todavía no está conectada. La llamada web necesita micrófono y tiene sus controles de sesión; cerrar una vista de llamada en cola no prueba que se canceló la llamada telefónica.

La actividad puede mostrar una **Relay Consultation**: el Sales Agent consulta en privado a un **Consultation Contact** mediante **SalesConsult**, mientras la **Origin Call** permanece en **Soft Wait**. El **Consultation Result** informa al agente; no modifica automáticamente datos comerciales. No lo describas como transferencia o conferencia, ni confundas los destinatarios de Roles de pedidos con contactos de consulta telefónica.

La gestión de números vive por separado en `/phones`: listar → añadir número mediante país y campos disponibles → comprobar la fila. Eliminar actúa sobre ese número. No confundas comprar/provisionar un número con llamar a un contacto.

### Venta en campo

Configura días laborables, inicio/fin de jornada, zona horaria y puntos de origen/regreso. Son valores por representante que usa la planificación; revisa al volver a Rutas que sean los esperados. La sección depende de que el tenant tenga Rutas.

## 11. Copilotos, agentes y equipo de campo

- `/copilot` permite iniciar una conversación independiente; la barra de conversaciones permite volver a un hilo `/copilot/<threadId>`. Revisa el contexto y los detalles/adjuntos disponibles. Escribe la petición, espera la respuesta y comprueba los artefactos o acciones resultantes. Una respuesta narrativa no sustituye la verificación en la pantalla de destino.
- En Clientes, Rutas, Calendario, Reportes y To-Dos, el botón del asistente abre un copiloto contextual. La pantalla y selección actuales le dan contexto; antes de pedir «cambia este», verifica qué registro está abierto. Si lo usas para ejecutar una acción, no la ejecutes también manualmente y dupliques el cambio.
- `/assistant` es una superficie anterior. Para operar una conversación de cliente usa el asistente del Inbox; para trabajo en campo usa el contextual de su pantalla.
- `/ai_employees` lista agentes y abre sus fichas. En el agente de ventas se muestran datos de contacto, cotizaciones y actividad. Algunos indicadores de la ficha son valores de ejemplo: no los uses como rendimiento real ni supongas que esta ficha permite editar el prompt, contratar o desplegar un agente.
- `/field_team` muestra tableros de representantes, actividad, oportunidades/riesgos y reportes según los datos disponibles. Selecciona el representante o periodo visible y abre el detalle. «No disponible» no es cero. No confundas este tablero con el alta/baja de miembros en Configuración → Equipo.

## 12. Acceso, ayuda y herramientas internas

**Acceso:** si la sesión caducó, vuelve a `/login` y sigue el flujo mostrado. `/sign_in` es otra entrada de acceso; recuperación, establecimiento de contraseña y MFA necesitan los enlaces o datos del usuario. No abras reset/set-password con tokens inventados. La selección de tenant y el consentimiento OAuth pertenecen al flujo que los abrió: revisa organización, aplicación y permisos visibles.

**Ayuda:** `/help` tiene búsqueda, navegación por artículos y enlaces a secciones. IDs útiles: `getting-started`, `sign-in`, `switch-company`, `reset-password`, `share-links`, `inbox`, `inbox-reply`, `customers`, `customer-visit`, `calendar`, `plan-week`, `reports`, `edit-report`, `tasks`, `create-task`, `products`, `product-search`, `missing-modules`. Si la ayuda difiere de la pantalla actual, sigue la pantalla y explica la diferencia concreta.

**Escenarios internos:** `/scenario` crea un escenario a partir de Inbox y `/scenario/<threadId>` a partir de Copilot. La entrada desde Inbox necesita `sso_account_id` y `sso_conversation_id` de su enlace real; no los sustituyas por un UUID de hilo. Solo para cuentas con acceso interno. Verifica la conversación, espera su historial y completa nombre, descripción, categoría, flujo y fuente. Revisa el resultado de **Create Scenario**. No uses estos formularios para responder al cliente ni confundas guardar un caso de evaluación con entrenar o desplegar el agente.

**Galerías:** `/artifacts` y `/internal/artifacts/v2` presentan componentes con ejemplos; `/internal/calls` simula estados de llamada y audio, no es un historial ni una llamada real; `/internal/error` prueba estados de error; `/internal/whatsnew` previsualiza novedades. Úsalas solo para la revisión interna solicitada.

**Límites actuales que debes recordar:**

- `/training` carga ejemplos de base de conocimiento, skills e integraciones. No instala skills del navegador ni confirma un entrenamiento real.
- `/support` contiene métricas/tickets de ejemplo. `/retention`, `/collections` y `/analytics` son superficies incompletas. Los departamentos bloqueados se ocultan en la barra; no son módulos operativos a los que puedas acceder forzando una URL.
- `/action_items` no sustituye To-Dos. `/conversations/<conversationId>` es un placeholder: trabaja con las conversaciones reales de `/inbox`.
- `/map` mezcla búsqueda de lugares con clientes mock y selección local de paradas. Una ruta dibujada ahí no prueba que se haya guardado en el plan comercial.
- El catálogo de integraciones y los botones de una demo no garantizan acciones persistentes. Informa de la limitación concreta en vez de simular éxito.
- No hay en estas rutas una consola universal para crear tenants, editar feature flags, administrar ERP o modificar prompts de todos los agentes. Si una tarea no tiene superficie operativa ni herramienta disponible, identifica exactamente qué falta.

## 13. Cerrar la tarea

Entrega un resultado verificable: empresa y registro afectados, acción realizada, estado final y enlace real cuando sea útil. En mensajes, distingue borrador/enviado; en pedidos, submitted/confirmed/rejected/review; en importaciones, aceptada/aplicada; en reportes, texto visible/guardado. Si quedó pendiente o bloqueado, indica el paso concreto y conserva el trabajo no guardado cuando sea posible.
