# El puente MCP: tu web logueada, para cualquier IA

## Por qué esto y no otra cosa

El diagnóstico ya decía que el único foso real es *"un agente que ya vive dentro de tus
sesiones"*. Lo que faltaba ver es que esa capacidad estaba **encerrada en nuestra propia
ventana de chat**.

El navegador es el único software de tu máquina que ya está autenticado en todo lo que usas, y
era el único que no lo exponía a nada. Por eso existe una industria entera construyendo
integraciones y apps OAuth para datos que ya están renderizados en una pestaña con tu sesión
abierta. Toda la IA del mundo choca con el mismo muro: lee la web pública y se acabó.

Monper ya cruza ese muro. El puente lo convierte en interfaz.

**Y no compite con Chrome.** Chrome no puede hacer esto aunque quiera: exponer las sesiones del
usuario a procesos locales es exactamente lo que su modelo de amenazas prohíbe, y sería
regalarle a la competencia el acceso que ellos monetizan. Es una de las pocas cosas que
estructuralmente solo puede hacer un navegador pequeño y del lado del usuario.

## Las piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| `remote.ts` | main | El servidor local con token. Ya existía; se le añadió trabajar en pestañas **de fondo** (`tabId`, `background`), `waitLoad` y la autorización por cliente. |
| `packages/monper-mcp` | paquete npm | Servidor MCP por stdio, **sin dependencias**. Traduce herramientas de alto nivel a los verbos del servidor local. |
| Settings → MCPs | renderer | El interruptor, lo que concede dicho sin adornos, y la config para pegar. |

## Decisiones que no hay que deshacer

- **Segundo plano por defecto.** Si un agente externo te roba el foco cada vez que lee algo, no
  puedes usar el navegador mientras trabaja — y entonces da igual que trabaje. Por eso
  `newTab` recibe `background` y todos los verbos aceptan `tabId`.
- **Herramientas de tarea, no de ratón.** `click(text)` y `fill(label)`, no coordenadas. Un
  modelo piensa en "el botón de Descargar", y una tool de coordenadas le obliga a pedir un
  screenshot antes de cada acción: más tokens, más latencia y más fallos.
- **`read_page` poda el DOM.** `innerText` del body trae el menú, el pie, el banner de cookies
  y el chat de soporte. En un contexto de LLM eso son miles de tokens de ruido que además
  tapan la respuesta.
- **Un fallo de herramienta vuelve como `isError`, no como error de JSON-RPC.** Así lo lee el
  modelo y puede corregir; un error de protocolo lo consume el cliente y el modelo nunca se
  entera de por qué falló.
- **La autorización se cachea como PROMESA, no como booleano.** Un agente encadena tools y
  llegan varias peticiones a la vez: con un booleano salían cinco diálogos.
- **Un "no" no se cachea.** Si rechazaste por sorpresa, tienes que poder decir que sí después.
- **`fill` rechaza los campos de contraseña.** Los secretos son del usuario y del vault. Ni
  nuestra IA ni la de nadie los escribe. Ver [vault-architecture.md](vault-architecture.md).
- **`mcp:enable` va por `isInternalSender`.** `monperTab` es el preload de **contenido**: existe
  también en cualquier web que cargues. Sin ese filtro, una página podría encender el puente y
  quedarse conduciendo tu navegador. Lo fija `tests/security.spec.ts`.

## Qué está probado

[`tests/mcp.spec.ts`](../tests/mcp.spec.ts) recorre la cadena entera —cliente ⇢ stdio ⇢ HTTP
local ⇢ Monper ⇢ página— porque cada tramo puede estar bien y el conjunto no funcionar. El test
central monta un sitio que **solo entrega su contenido si la petición trae la cookie de
sesión**: si el texto llega, llegó autenticado. Es exactamente lo que ningún agente en la nube
puede hacer, y por eso es la prueba que importa.

También: que abrir en segundo plano no roba el foco (y que `foreground: true` sí), que un fallo
vuelve como `isError`, y que `fill` nunca escribe en un campo de contraseña.

## Lo que falta

- **Skills como herramientas.** Hoy se exponen 6 verbos genéricos. El siguiente paso es que una
  skill grabada por demostración aparezca como una tool propia y tipada (`get_invoices(month)`),
  para que el cliente no tenga que reinventar el recorrido cada vez.
- **Un techo de gasto/acciones por cliente**, para que un agente en bucle no navegue mil veces.
- **Registro de lo que hizo cada cliente**, en la línea de los recibos verificables del agente.
