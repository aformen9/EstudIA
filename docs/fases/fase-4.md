# Fase 4 — Apps descargables, landing, CI de releases e IA local embebida

**Objetivo:** cualquiera baja EstudIA desde una página (APK, dmg, exe) sin pasar por GitHub ni tiendas.

Prerrequisito: fase 3 aprobada.

## Antes de implementar (preguntar)
- Android: Tauri 2 mobile vs Capacitor (comparar con el código existente y **preguntar**).
- Firma de binarios: macOS (Apple Developer, USD 99/año) y Windows — **preguntar** (sin firma se puede, con avisos al instalar).
- Modelo local embebido por defecto (tamaño, licencia, calidad de tool calling en español) — proponer 2–3 y **preguntar**.

## Alcance
- `apps/desktop` (Tauri 2) envolviendo `apps/web`; auto-update.
- IA local embebida: sidecar con llama.cpp (o equivalente) + descarga opcional del modelo con progreso; se registra como proveedor "Local" de la fase 2.
- Android: APK.
- GitHub Actions: al crear un tag `vX.Y.Z` compila macOS/Windows/Linux/Android y publica en GitHub Releases.
- Landing (`apps/landing` o sección de la web): botones de descarga que detectan el sistema operativo, instrucciones para los avisos de "app no verificada", link a la PWA para iPhone.

## Criterios de aceptación
1. Un tag de prueba genera los 4 binarios en Releases sin intervención manual.
2. dmg instala y abre en macOS (documentar el paso de Gatekeeper si no está firmada); exe en Windows; APK en un Android real.
3. Login con Google funciona dentro de la app de escritorio y de Android (deep link de vuelta).
4. IA local embebida responde "¿qué puedo cursar?" sin internet.
5. Auto-update: instalar vX, publicar vX+1, la app ofrece actualizar.
