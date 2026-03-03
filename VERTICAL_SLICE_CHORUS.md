# Vertical Slice MVP: Edición y análisis IA de un coro

Este documento define un vertical slice del DAW limitado a un único objetivo funcional:
**editar un coro** y **analizarlo con IA** (sin generar cambios automáticos).

## 1) Alcance del vertical slice

Incluye únicamente:
- Edición MIDI del coro (notas, duración, velocity).
- Validación armónica del coro contra el `ProjectDocument`.
- Análisis IA del coro (explicación + sugerencias no aplicadas).

Excluye explícitamente:
- Edición del resto de secciones.
- Generación global de canción.
- Audio/mixing/mastering.
- Automatizaciones y plugins.

---

## 2) Funcionalidades mínimas

## 2.1 Carga y foco de sección
1. Cargar `ProjectDocument` por `projectId`.
2. Resolver cuál es el coro activo (`section.type == "chorus"`).
3. Cargar únicamente clips/notas asociadas a ese coro.

## 2.2 Edición MIDI del coro
4. Editar nota individual:
   - `pitch`
   - `durationTicks`
   - `velocity`
5. Mover nota en el tiempo dentro del coro (`startTicks`).
6. Crear y borrar nota dentro del coro.
7. Undo/redo local por transacción de edición.

## 2.3 Restricciones de consistencia
8. Impedir que una nota quede fuera de límites del coro (o recortar por política).
9. Validar coherencia armónica con `chordId` activo del coro:
   - modo `strict`: rechazar nota fuera del acorde.
   - modo `assist`: permitir pero marcar warning/sugerencia.
10. Persistir cambios en el mismo `ProjectDocument` (misma estructura JSON).

## 2.4 Análisis IA del coro (read-only)
11. Ejecutar análisis del coro actual:
   - resumen armónico del coro.
   - curva de tensión del coro.
   - detección de repetición excesiva.
12. Explicar “qué está pasando musicalmente” en lenguaje claro.
13. Proponer 3-5 mejoras del coro (manual_only, no auto-apply).
14. Registrar señales implícitas básicas:
   - qué sugerencias se ignoran.
   - qué tipos de edición se repiten.

---

## 3) Endpoints backend necesarios

## 3.1 Proyecto y sección
1. `GET /projects/{projectId}`
   - Devuelve `ProjectDocument` completo + `revision`.

2. `GET /projects/{projectId}/sections/chorus`
   - Devuelve metadatos del coro activo (`sectionId`, rango de compases, chords).

## 3.2 Edición MIDI del coro
3. `POST /projects/{projectId}/chorus/edits/validate`
   - Entrada: lista de operaciones (`createNote`, `updateNote`, `deleteNote`, `moveNote`) + `revision`.
   - Salida: validación, warnings armónicos, preview de impacto.

4. `POST /projects/{projectId}/chorus/edits/commit`
   - Entrada: operaciones validadas + `revision`.
   - Salida: `ProjectDocument` actualizado, `newRevision`, `changeIds`.

5. `POST /projects/{projectId}/chorus/edits/undo`
   - Revierte última transacción del coro.

6. `POST /projects/{projectId}/chorus/edits/redo`
   - Reaplica transacción revertida.

## 3.3 IA del coro
7. `POST /projects/{projectId}/chorus/ai/insights`
   - Entrada: snapshot de coro (o usa revision actual).
   - Salida: `InsightReport` focalizado en coro.

8. `POST /projects/{projectId}/chorus/ai/suggestions`
   - Entrada: snapshot + contexto de preferencias.
   - Salida: `SuggestionSet` (manual_only).

9. `POST /projects/{projectId}/chorus/ai/signals`
   - Entrada: señales implícitas (p.ej. "suggestion_ignored", "pattern_reedited").
   - Salida: confirmación + versión de perfil actualizada.

## 3.4 Contratos mínimos compartidos
- Todas las mutaciones requieren `revision` para control de concurrencia.
- Todas las respuestas de commit devuelven `newRevision`.
- Errores de dominio estandarizados:
  - `RevisionConflict`
  - `HarmonyViolation`
  - `SectionBoundaryViolation`
  - `InvalidMidiRange`

---

## 4) Estados frontend imprescindibles

## 4.1 Estado de documento
1. `projectSnapshot`
   - copia del `ProjectDocument` actual.
2. `revision`
   - versión activa para validación/commit.
3. `activeChorusSectionId`
   - coro que se está editando/analisando.

## 4.2 Estado de edición MIDI
4. `selectedNotes[]`
5. `pendingEdits[]`
   - cola local de operaciones aún no commiteadas.
6. `validationResult`
   - errores/warnings de restricciones.
7. `undoStack[]` / `redoStack[]`

## 4.3 Estado armónico del coro
8. `activeChordMap`
   - mapeo tiempo->acorde para validar edición.
9. `harmonicMode`
   - `strict | assist` (en este slice no hace falta `free`).

## 4.4 Estado IA del coro
10. `chorusInsights`
11. `chorusSuggestions[]`
12. `suggestionFeedbackQueue[]`
   - señales implícitas por enviar (`accepted`, `ignored`, `edited_after_suggestion`).

## 4.5 Estado de red/flujo
13. `loadStatus` (`idle | loading | ready | error`)
14. `saveStatus` (`idle | validating | saving | saved | conflict | error`)
15. `aiStatus` (`idle | analyzing | ready | error`)

---

## 5) Flujo mínimo de extremo a extremo

1. Frontend carga proyecto y resuelve `activeChorusSectionId`.
2. Usuario edita notas del coro en local (`pendingEdits`).
3. Frontend pide `validate`; si OK, permite `commit`.
4. Backend persiste cambios en mismo JSON y devuelve `newRevision`.
5. Frontend dispara `ai/insights` + `ai/suggestions` para el coro.
6. Usuario aplica manualmente cambios sugeridos (si quiere).
7. Frontend envía señales implícitas a `ai/signals`.

Con este flujo se valida el valor completo del vertical slice: edición real del coro + análisis IA útil sin automatismos destructivos.
