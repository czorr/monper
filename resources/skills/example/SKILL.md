---
icon: list-details
name: "Resumir página"
description: Cuando el usuario pide un resumen de la página actual, léela y devuelve los puntos clave en viñetas.
keywords: [resumir, resumen, summarize, TL;DR, puntos clave]
---

# Resumir página

Úsala cuando el usuario pida un **resumen** de la página que está viendo.

## Pasos

1. Llama a `read_page` para obtener el texto visible de la página.
2. Si el contenido es largo o está diferido, haz `scroll` hacia abajo y vuelve a `read_page` hasta cubrir lo relevante.
3. Sintetiza en **3–6 viñetas** los puntos clave, en el idioma del usuario.

## Reglas

- No inventes datos que no estén en la página.
- Si la página es un artículo, incluye el punto principal primero.
- Cierra con una línea de "En una frase: …" cuando ayude.
