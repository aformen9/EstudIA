# Fase 5 (opcional) — IA local en el celular y MCP local

**Objetivo:** IA sin internet también en Android, y MCP local en escritorio para que Claude Desktop lea los originales.

Prerrequisito: fase 4 aprobada y decisión de Agu de seguir con esto.

## Alcance (a confirmar con Agu antes de empezar)
- Android: motor local (llama.cpp para Android o equivalente) con un modelo ≤ 2 GB; medir RAM, batería y velocidad en un celular de gama media y **reportar antes de decidir si se publica**.
- MCP local (fase 3b): servidor dentro de la app de escritorio, instalable en Claude Desktop como extensión `.mcpb`, con acceso a los originales guardados localmente (lectura) y a las mismas herramientas.

## Criterios de aceptación
1. Medición en un Android real documentada (tokens/s, RAM, batería por 10 min de uso).
2. Claude Desktop con la extensión instalada abre y resume un PDF local de una materia.
