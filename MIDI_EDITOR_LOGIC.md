# Lógica interna del editor MIDI web (sin UI)

Este documento define la lógica, flujo y responsabilidades de un editor MIDI web para el DAW.
El objetivo es manipular el mismo modelo JSON del proyecto sin romper estructura ni armonía.

## 1) Principios de diseño

- **Modelo canónico único**: el editor solo lee/escribe sobre el `ProjectDocument` compartido.
- **Separación de capas**:
  - Dominio musical (secciones, armonía, notas, reglas).
  - Casos de uso (editar nota, mover bloque, cuantizar).
  - Persistencia (cargar/guardar JSON).
- **Validación por transacción**: cada cambio se valida antes de aplicarse.
- **Invariantes armónicas**: si una acción rompe reglas, se rechaza o se corrige automáticamente.
- **Historial mínimo**: cada cambio relevante deja rastro para undo/redo y auditoría.

## 2) Entradas y salidas del editor

### Entradas
- `ProjectDocument` JSON completo.
- Comandos de edición MIDI (crear, mover, redimensionar, cambiar velocity).
- Opciones de edición (snap, cuantización, rango permitido, modo estricto armónico).

### Salidas
- `ProjectDocument` actualizado (misma estructura).
- Eventos de dominio (p.ej. `NoteEdited`, `HarmonyConstraintViolation`).
- Registro en `aiMeta.changeHistory` y metadatos de ownership (`lastEditedBy=user`).

## 3) Componentes lógicos y responsabilidades

## 3.1 ProjectRepository
Responsabilidad:
- Cargar el JSON del proyecto.
- Guardar el JSON actualizado.
- Versionar con `revision` incremental.

Reglas:
- Escritura atómica.
- Conflicto de revisión si el documento cambió en paralelo.

## 3.2 TimelineIndexer
Responsabilidad:
- Resolver posición musical (bar/beat/tick) y mapear notas a sección/clip.
- Indexar notas por:
  - `sectionId`
  - `chordId`
  - `trackId`
  - rango temporal

Uso:
- Acelera búsquedas para edición masiva y validación contextual.

## 3.3 MidiEditService
Responsabilidad:
- Aplicar operaciones sobre notas:
  - `createNote`
  - `updateNotePitch`
  - `updateNoteDuration`
  - `updateNoteVelocity`
  - `moveNote`
  - `deleteNote`

Regla central:
- Toda operación pasa por `ConstraintEngine` antes de persistir.

## 3.4 ConstraintEngine
Responsabilidad:
- Hacer cumplir invariantes musicales/técnicos.

Invariantes técnicas:
- `durationTicks > 0`
- `0 <= velocity <= 127`
- `0 <= pitch <= 127`
- Nota dentro del rango de su clip/sección (o recortar según política).

Invariantes armónicas:
- Nota debe pertenecer al acorde de su `chordId` en modo estricto.
- Si no pertenece:
  - **modo strict**: rechazar operación.
  - **modo assist**: autoajustar a tono armónico más cercano (snap armónico).
- No permitir cambio de `sectionId` si rompe el orden estructural.

## 3.5 HarmonyGuard
Responsabilidad:
- Proteger la estructura armónica declarada en `harmony.sectionProgressions`.
- Validar consistencia entre:
  - `note.sectionId` ↔ sección de timeline.
  - `note.chordId` ↔ acorde activo en ese tiempo.
- Exponer utilidades:
  - `getActiveSection(tick)`
  - `getActiveChord(sectionId, tick)`
  - `isPitchAllowed(chordId, pitch)`

## 3.6 ChangeSet / TransactionManager
Responsabilidad:
- Agrupar cambios de edición en transacciones.
- Aplicar todo o nada (commit/rollback).
- Generar eventos de dominio y diffs mínimos.

## 3.7 HistoryService
Responsabilidad:
- Undo/redo lógico (sin UI).
- Registrar cambios relevantes en:
  - `aiMeta.changeHistory`
  - `aiMeta.editOwnership`

## 4) Flujo de edición (end-to-end)

1. **Cargar proyecto** desde `ProjectRepository`.
2. **Construir índices** (`TimelineIndexer`).
3. Llegan comandos de edición MIDI.
4. `MidiEditService` genera un `ChangeSet`.
5. `ConstraintEngine` + `HarmonyGuard` validan cambios.
6. Si validan:
   - aplicar cambios en memoria,
   - actualizar ownership/historial,
   - incrementar `revision`,
   - guardar JSON.
7. Si fallan:
   - rollback,
   - devolver error de dominio tipado.

## 5) Operaciones principales y reglas

## 5.1 Editar pitch
Entrada: `noteId`, `newPitch`.

Validaciones:
- rango MIDI válido.
- coherencia armónica con `chordId` activo.

Resultado:
- actualiza `pitch`.
- marca entidad como editada por usuario.

## 5.2 Editar duración
Entrada: `noteId`, `newDurationTicks`.

Validaciones:
- duración positiva.
- no sobrepasar límites de sección/clip según política.
- no invadir acorde siguiente en modo estricto de armonía por acorde.

## 5.3 Editar velocity
Entrada: `noteId`, `newVelocity`.

Validaciones:
- 0..127.
- opcional: normalización por sección (p.ej. coro más intenso).

## 5.4 Mover nota
Entrada: `noteId`, `deltaTicks`, `deltaPitch`.

Validaciones:
- sección destino válida.
- acorde destino válido.
- si cambia de sección, recalcular `sectionId` y `chordId`.

## 5.5 Edición por bloque
Entrada: conjunto de `noteIds` + transformación.

Reglas:
- aplicar en transacción.
- validar por nota y luego validación global del bloque.
- rollback completo si hay ruptura crítica.

## 6) Políticas para “no romper estructura armónica”

Definir política configurable en runtime:

- `harmonicMode: strict | assist | free`
  - **strict**: solo notas del acorde o extensiones permitidas.
  - **assist**: permite nota externa pero la corrige/sugiere ajuste.
  - **free**: permite todo, pero emite warning de inconsistencia.

- `sectionBoundaryPolicy: clamp | split | reject`
  - **clamp**: recorta nota al final de sección.
  - **split**: divide nota en dos secciones.
  - **reject**: rechaza operación.

- `cadenceProtection: on | off`
  - si `on`, protege últimos compases de cadencia contra cambios de pitch fuera de función.

## 7) Sincronización con el modelo JSON

Campos que se actualizan en cada commit:
- `midi.notes[]` (pitch/duración/velocity/start/chord/section si aplica).
- `revision`, `updatedAt`.
- `aiMeta.editOwnership` (lastEditedBy=user).
- `aiMeta.changeHistory` (entrada resumida por operación/transacción).

Nunca modificar desde el editor MIDI:
- definición de `structure.sectionOrder` salvo caso de uso estructural explícito.
- `harmony.sectionProgressions` salvo modo de edición armónica explícito separado.

## 8) Errores de dominio (contract)

Tipos sugeridos:
- `NoteNotFound`
- `InvalidMidiRange`
- `SectionBoundaryViolation`
- `HarmonyViolation`
- `RevisionConflict`
- `TransactionFailed`

Todos los errores deben incluir:
- `code`
- `message`
- `entityId`
- `context` (sectionId, chordId, valores previos/nuevos)

## 9) Compatibilidad web + backend

- Documento JSON serializable y transportable por API.
- Operaciones expresadas como comandos idempotentes con `projectId` + `revision`.
- Validación puede correr en cliente (precheck) y servidor (enforcement).
- El servidor es fuente de verdad para evitar corrupción del proyecto.

## 10) Extensibilidad prevista

Preparado para crecer hacia:
- audio clips (validación por transientes/warp).
- automatizaciones (CC MIDI y parámetros).
- plugins e instrumentos virtuales por track.
- mastering (reglas de loudness/metadatos de export).

La clave es mantener el editor MIDI como consumidor del modelo canónico,
con reglas armónicas desacopladas en `ConstraintEngine + HarmonyGuard`.
