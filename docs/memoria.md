# Memoria del agente

Ficheros markdown que **escribe el propio agente** y que el usuario puede leer y editar, en
Settings → Memory o en su carpeta con el editor que quiera.
[`src/main/memoria.ts`](../src/main/memoria.ts).

## Por qué ficheros y no `@mastra/memory`

El primer intento fue otra cosa: guardar el TEXTO de cada página visitada para buscar el
historial por contenido. Se descartó en cuanto se enseñó — el pendiente que ponía "Memory" en la
checklist no era eso. Memoria es lo que el agente aprende, no un índice de lo que leíste.

Ya con el modelo correcto, `@mastra/core/memory` (1.52) trae solo la parte abstracta —
`MastraMemory`, las constantes de *working memory*, los helpers de tags. La implementación con
almacenamiento vive en `@mastra/memory`, que arrastra adaptadores y una base de datos. Para lo
que hace falta —que el agente recuerde cosas entre sesiones— un puñado de `.md` en una carpeta
hace lo mismo y además:

- **Se puede abrir a mano.** Una memoria que el usuario no puede leer es una caja negra que
  decide cosas sobre él. Aquí es texto plano, en su carpeta, y la UI la enseña entera.
- Es la misma forma que ya tienen las skills: se lee igual, se prueba igual y comparten el
  renderizador de markdown (`settings/markdown.tsx`, extraído justo por esto).
- Se versiona, se copia y se borra con el Finder.

## Qué entra en el prompt

**Solo `MEMORY.md`**, y recortado a 8 KB. Es la memoria de trabajo: un índice que apunta a los
demás ficheros, que el agente abre con `memory_read` cuando los necesita. Si entrara todo en cada
turno, la memoria costaría dinero en cada mensaje y acabaría comiéndose la ventana de contexto —
justo el problema que viene a resolver.

Dos detalles con test detrás:

- El índice **recién sembrado no entra**. Meter una plantilla vacía en cada turno gasta tokens y
  le dice al modelo que hay memoria cuando no la hay.
- Apagada en los ajustes, no aporta nada y las cuatro tools contestan que está desactivada.

## Las tools

`memory_list`, `memory_read`, `memory_write` (sobrescribe: hay que leer antes para añadir) y
`memory_delete`. Se inyectan como `MemoryControl` en vez de importar el módulo, igual que el
control del navegador y el de ajustes: así `mastra.ts` se sigue probando sin tocar el disco.

## `rutaSegura` es la función que importa

Las rutas de escritura las decide **un modelo de lenguaje**, al que se le puede colar cualquier
cosa desde una web que esté leyendo. Sin esta comprobación, un
`memory_write('../../vault.secrets.json', …)` sale de la carpeta y llega al vault.

Se compara la ruta **ya resuelta**, no la cadena: `notas/../../fuera.md` parece inocente y no lo
es. Y solo se aceptan `.md`, porque abrir la puerta a cualquier extensión convierte la memoria en
un sistema de ficheros donde el agente puede dejar cosas ejecutables.

El test recorre siete formas reales de escaparse y, además de comprobar que se rechazan,
**mira que el fichero no exista fuera**: la primera comprobación podría pasar y el fichero
haberse escrito igual.

## Es del perfil

`rutaDePerfil('memory')`: lo que Monper sabe de ti en "Trabajo" no es lo de "Personal". Ver
[incognito-y-perfiles.md](incognito-y-perfiles.md).

## Pendiente

- **Memoria episódica** (el `episodic/` de la referencia): un log por día que el agente resume y
  poda. Hoy solo hay memoria duradera.
- Retención configurable ("Never forget" y compañía). Sin memoria episódica no hay nada que
  caducar, así que el ajuste llegaría vacío.
- Que el agente pode `MEMORY.md` solo cuando se acerque al techo, en vez de recortarlo al vuelo.
