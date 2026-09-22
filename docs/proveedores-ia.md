# Conexiones de IA

`titanio.jsonc`, en `app.getPath('userData')`, es la fuente de las conexiones de IA.
Ajustes → Providers muestra la ruta y permite abrir el archivo con el editor del sistema.
La interfaz escribe el mismo archivo; admite comentarios y comas finales.

```jsonc
{
  "provider": {
    "titanio": {
      "name": "Titanio AI",
      "kind": "openai",
      "options": {
        "baseURL": "https://ai.titanio.ai/openai/v1",
        "apiKey": "{env:VLLM_API_KEY}",
      },
      "models": {
        "gemma-4-26b-a4b-it": { "name": "Gemma 4" },
      },
    },
  },
}
```

- `kind`: `openai` (Chat Completions) o `anthropic` (Messages). No carga paquetes `npm`.
- `options.baseURL`: base de la API, incluyendo `/v1` si el servicio lo requiere.
  Omitirla utiliza la API oficial del protocolo elegido.
- `options.apiKey`: referencia `{env:NOMBRE}` o `{vault:ID}`. La UI genera las referencias
  al vault al guardar claves. No se admiten claves literales en el archivo.
- Las variables deben existir en el entorno **del proceso de Titanio**; no se cargan `.env`.
- `models`: mapa de modelos. La clave es su ID; `id` permite un alias de configuración con
  otro ID de despliegue. `name` es el nombre visible. Una lista no vacía sustituye el catálogo.
- Sin modelos explícitos se consulta `/models`; los endpoints personalizados nunca heredan
  modelos de OpenAI o Anthropic que posiblemente no ofrecen.
- Los campos adicionales se conservan al editar. Límites y variantes del formato de
  OpenCode **no se aplican al agente** en esta implementación.

## Edición y errores

La UI ofrece conexiones oficiales, OpenRouter y endpoints personalizados, credenciales del
vault o del entorno, edición de modelos y búsqueda de modelos en una conexión guardada.
“Credenciales configuradas” no afirma que la API key funcione. “Buscar modelos” hace una
petición real al catálogo, sin enviar mensajes al modelo.

Un observador recarga el archivo tras guardados externos, incluidos reemplazos atómicos.
Ajustes actualiza su lista automáticamente. Cada editor guarda la revisión con la que se
abrió: si cambió el archivo, se rechaza el guardado y se pide reabrir la conexión.
Un archivo inválido mantiene la última configuración válida en memoria, muestra el error
en Ajustes y bloquea escrituras desde la UI hasta corregirlo.

Las conexiones existentes se migran una vez desde la metadata del vault, conservando IDs
y referencias a claves cifradas. `chat.json` sigue guardando la selección del chat.
Eliminar una conexión no elimina su secreto del vault: puede estar referenciado por otra.

## Verificación sin navegador

`pnpm test:ai-config` prueba migración, referencias de entorno, edición que conserva
comentarios y modelos, conflictos con el editor externo, JSONC inválido, validación y
creación/eliminación. Usa un doble de Electron y no abre ventanas ni llama a APIs reales.
