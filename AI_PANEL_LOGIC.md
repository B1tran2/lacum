# Lógica del panel de IA para el DAW (sin UI)

Este documento define la lógica, responsabilidades y flujos de un panel de IA que analiza el `ProjectDocument` sin modificarlo automáticamente.

## 1) Objetivo del panel

El panel debe funcionar como **analista y copiloto musical**:
- Lee el estado actual del proyecto.
- Interpreta estructura, armonía y comportamiento de edición.
- Explica al usuario qué ocurre musicalmente.
- Propone alternativas (nunca aplica cambios por sí solo).
- Aprende de señales implícitas para mejorar recomendaciones futuras.

## 2) Principios de arquitectura

- **Read-only sobre el proyecto**: acceso de solo lectura al `ProjectDocument`.
- **Sugerencias no destructivas**: salida en forma de propuestas, no parches aplicados.
- **Razonamiento trazable**: cada sugerencia debe incluir “por qué”.
- **Contexto musical + contexto de usuario**: combinar teoría musical y hábitos de edición.
- **Separación de responsabilidades**: análisis, explicación, recomendación y aprendizaje en módulos independientes.

## 3) Entradas y salidas

### Entradas
- `ProjectDocument` completo:
  - `global`
  - `structure`
  - `harmony`
  - `midi`
  - `aiMeta`
- Contexto de sesión:
  - historial corto de consultas del usuario.
  - foco actual (sección, track o compás activo si disponible).

### Salidas
- `InsightReport` (explicación de estado musical actual).
- `SuggestionSet` (alternativas priorizadas, no aplicadas).
- `LearningUpdate` (actualización de preferencias implícitas del usuario).

## 4) Componentes lógicos y responsabilidades

## 4.1 ProjectSnapshotReader
Responsabilidad:
- Cargar una instantánea consistente del `ProjectDocument`.
- Validar que la revisión sea coherente (`revision`, `updatedAt`).
- Entregar datos normalizados al pipeline de análisis.

## 4.2 StructureAnalyzer
Responsabilidad:
- Analizar forma global de la canción:
  - orden y duración de secciones.
  - patrones de repetición/variación.
  - equilibrio de densidad estructural (intro/verso/coro/puente/outro).

Salida clave:
- resumen estructural legible por humanos.
- alertas de forma (p.ej., coro sin contraste suficiente).

## 4.3 HarmonyAnalyzer
Responsabilidad:
- Analizar progresiones por sección:
  - funciones tonales y grados.
  - tipo de cadencia por cierre de sección.
  - nivel de tensión armónica y su curva temporal.
- Detectar puntos de interés:
  - repeticiones armónicas excesivas.
  - resoluciones débiles.
  - falta de diferenciación verso/coro.

Salida clave:
- diagnóstico armónico por sección.
- hipótesis de mejora justificadas musicalmente.

## 4.4 MidiEditBehaviorAnalyzer
Responsabilidad:
- Analizar comportamiento de edición del usuario en `aiMeta.changeHistory` y ownership:
  - qué notas/chords edita con frecuencia.
  - qué secciones casi no toca.
  - qué sugerencias históricas terminan retenidas.

Salida clave:
- perfil de preferencias implícitas (con confianza).
- señales de aceptación/rechazo de ideas musicales.

## 4.5 MusicalExplainer
Responsabilidad:
- Convertir análisis técnicos en explicaciones claras.
- Responder preguntas tipo:
  - “¿Qué está pasando en el coro?”
  - “¿Por qué se siente plano el verso?”

Formato recomendado:
- Hecho observado.
- Interpretación musical.
- Evidencia (sección, acorde, métrica).

## 4.6 SuggestionEngine (no-aplicativo)
Responsabilidad:
- Generar alternativas sin mutar el proyecto.
- Tipos de propuestas:
  - estructurales (ajuste de longitud o repetición de secciones).
  - armónicas (cadencias alternativas, tensión en coro, variación en puente).
  - MIDI locales (rango, duración o dinámica sugerida para mejorar fraseo).

Regla crítica:
- cada propuesta debe incluir impacto esperado y costo musical.

## 4.7 PreferenceLearner
Responsabilidad:
- Aprender de señales implícitas del usuario (sin IA conversacional avanzada):
  - **se mantiene** una sección generada → señal positiva.
  - **se edita repetidamente** un patrón → posible desalineación con preferencias.
  - **se revierte** un tipo de cambio → señal negativa.
- Actualizar un perfil de preferencias versionado.

## 4.8 RecommendationRanker
Responsabilidad:
- Priorizar sugerencias combinando:
  - relevancia musical (problema real detectado).
  - afinidad con preferencias implícitas.
  - diversidad (evitar recomendaciones redundantes).

## 5) Flujo end-to-end del panel

1. **Snapshot**: `ProjectSnapshotReader` captura `ProjectDocument`.
2. **Análisis paralelo**:
   - `StructureAnalyzer`
   - `HarmonyAnalyzer`
   - `MidiEditBehaviorAnalyzer`
3. **Fusión de hallazgos** en un `MusicStateModel` interno.
4. **Explicación** con `MusicalExplainer`.
5. **Generación de alternativas** con `SuggestionEngine`.
6. **Priorización** con `RecommendationRanker`.
7. **Aprendizaje implícito** con `PreferenceLearner`.
8. **Salida**: `InsightReport + SuggestionSet + LearningUpdate`.

## 6) Contratos de datos internos

## 6.1 MusicStateModel (interno)
Campos mínimos:
- `structureSummary`
- `harmonySummary`
- `tensionCurve`
- `repetitionScore`
- `sectionContrastScore`
- `userEditProfile`
- `confidence`

## 6.2 InsightReport
Campos sugeridos:
- `globalNarrative`: texto breve del estado musical.
- `sectionInsights[]`:
  - `sectionId`
  - `whatHappens`
  - `whyItFeelsLikeThat`
  - `evidence`
- `riskFlags[]` (si aplica): monotonía, resolución débil, etc.

## 6.3 SuggestionSet
Campos sugeridos:
- `suggestions[]` con:
  - `suggestionId`
  - `targetScope` (global/section/chord/clip)
  - `proposal`
  - `rationale`
  - `expectedImpact`
  - `musicalTradeOff`
  - `priority`
  - `confidence`
  - `applyMode: "manual_only"`

## 6.4 LearningUpdate
Campos sugeridos:
- `preferenceDeltas[]`
- `signalsUsed[]`
- `confidenceChange`
- `modelVersion`

## 7) Reglas para explicar “qué está pasando musicalmente”

Cada explicación debe:
1. Referenciar sección concreta (`intro`, `verso`, `coro`, `puente`, `outro`).
2. Referenciar evidencia armónica (cadencia, grado, tensión).
3. Indicar consecuencia perceptiva (“más estable”, “más expectativa”, “menos contraste”).
4. Evitar lenguaje ambiguo sin soporte.

Ejemplo de patrón lógico:
- Observación: “El coro repite la misma célula armónica del verso”.
- Evidencia: “mismos grados funcionales y misma cadencia final”.
- Efecto: “se reduce percepción de clímax”.

## 8) Reglas para proponer mejoras (sin aplicar)

- Las propuestas deben ser **opcionales** y **reversibles** en costo cognitivo.
- Proponer máximo 3–5 alternativas prioritarias por ciclo para evitar ruido.
- Balancear entre:
  - 1 mejora de alto impacto.
  - 1 mejora conservadora.
  - 1 alternativa creativa.
- Nunca alterar automáticamente JSON ni escribir cambios de proyecto.

## 9) Aprendizaje por señales implícitas

## 9.1 Señales positivas
- Elementos generados que permanecen tras varias revisiones.
- Secciones exportadas sin edición relevante.
- Cambios sugeridos que el usuario replica manualmente.

## 9.2 Señales negativas
- Borrado repetido de cierto tipo de recurso armónico.
- Reversiones frecuentes tras cambios de tensión/cadencia.
- Ajustes constantes contra una misma recomendación previa.

## 9.3 Mecanismo de actualización
- Mantener vector de preferencias por dimensiones:
  - densidad armónica.
  - nivel de tensión en coro.
  - gusto por dominantes secundarias.
  - tolerancia a variación entre repeticiones.
- Actualizar con decaimiento temporal (lo reciente pesa más).

## 10) Gobernanza y seguridad de recomendaciones

- **No-autowrite**: prohibido escribir en `midi`, `harmony` o `structure`.
- **Trazabilidad**: cada sugerencia conserva origen de evidencia.
- **Determinismo parcial**: mismo snapshot debe producir ranking estable (salvo desempate controlado).
- **Control de confianza**: si confianza baja, panel prioriza explicación sobre prescripción.

## 11) Integración con web/backend

- Servicio stateless para análisis por snapshot.
- Cache opcional por `projectId + revision` para eficiencia.
- Perfil de preferencias persistido separado del documento principal, con enlace por `projectId`.
- API sugerida:
  - `POST /ai/insights` (input: snapshot) → `InsightReport`
  - `POST /ai/suggestions` → `SuggestionSet`
  - `POST /ai/learn` → `LearningUpdate`

## 12) Extensibilidad futura

Listo para incorporar luego:
- análisis de audio (transientes, espectro, mezcla).
- recomendaciones de mastering.
- adaptación a estilos híbridos (orquestal + lo-fi).
- evaluación de consistencia entre MIDI y audio renderizado.

---

Con este diseño, el panel de IA actúa como sistema experto: entiende el proyecto,
explica su estado musical, sugiere alternativas con fundamento y aprende del usuario,
sin modificar automáticamente el `ProjectDocument`.
