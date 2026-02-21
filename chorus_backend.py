"""FastAPI backend mínimo para el vertical slice de edición/análisis de coro.

Incluye almacenamiento en memoria de ProjectDocument y endpoints base con placeholders.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


class EditOperation(BaseModel):
    op: Literal["createNote", "updateNote", "deleteNote", "moveNote"]
    noteId: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class ChorusValidateRequest(BaseModel):
    revision: int
    operations: List[EditOperation] = Field(default_factory=list)


class ChorusValidateResponse(BaseModel):
    projectId: str
    sectionId: str
    revision: int
    valid: bool
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    previewImpact: Dict[str, Any] = Field(default_factory=dict)


class ChorusInsightsRequest(BaseModel):
    revision: int
    context: Dict[str, Any] = Field(default_factory=dict)


class ChorusInsightsResponse(BaseModel):
    projectId: str
    sectionId: str
    revision: int
    globalNarrative: str
    sectionInsights: List[Dict[str, Any]] = Field(default_factory=list)
    riskFlags: List[str] = Field(default_factory=list)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_demo_project(project_id: str) -> Dict[str, Any]:
    return {
        "schemaVersion": "1.0.0",
        "projectId": project_id,
        "revision": 1,
        "updatedAt": utc_now_iso(),
        "global": {
            "title": "Demo Chorus Slice",
            "bpm": 92,
            "timeSignature": {"numerator": 4, "denominator": 4},
            "key": {"tonic": "D", "mode": "minor"},
            "style": "barroco",
            "totalBars": 32,
        },
        "structure": {
            "sectionOrder": ["sec_intro_1", "sec_chorus_1", "sec_outro_1"],
            "sections": [
                {"sectionId": "sec_intro_1", "type": "intro", "startBar": 1, "barLength": 8},
                {"sectionId": "sec_chorus_1", "type": "chorus", "startBar": 9, "barLength": 16},
                {"sectionId": "sec_outro_1", "type": "outro", "startBar": 25, "barLength": 8},
            ],
        },
        "harmony": {
            "sectionProgressions": [
                {
                    "sectionId": "sec_chorus_1",
                    "cadenceType": "authentic_perfect",
                    "tensionLevel": 0.82,
                    "chords": [],
                }
            ]
        },
        "midi": {"tracks": [], "clips": [], "notes": []},
        "aiMeta": {"changeHistory": [], "editOwnership": []},
    }


PROJECTS: Dict[str, Dict[str, Any]] = {
    "demo": build_demo_project("demo"),
}

app = FastAPI(title="Chorus Vertical Slice API", version="0.1.0")


def get_project_or_404(project_id: str) -> Dict[str, Any]:
    project = PROJECTS.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def find_chorus_section_or_404(project: Dict[str, Any]) -> Dict[str, Any]:
    sections = project.get("structure", {}).get("sections", [])
    chorus = next((section for section in sections if section.get("type") == "chorus"), None)
    if not chorus:
        raise HTTPException(status_code=422, detail="Project has no chorus section")
    return chorus


@app.get("/projects/{projectId}")
def get_project(projectId: str) -> Dict[str, Any]:
    """Devuelve el ProjectDocument completo desde memoria."""
    return get_project_or_404(projectId)


@app.post("/projects/{projectId}/chorus/edits/validate", response_model=ChorusValidateResponse)
def validate_chorus_edits(projectId: str, request: ChorusValidateRequest) -> ChorusValidateResponse:
    """Valida operaciones del coro con reglas mínimas placeholder."""
    project = get_project_or_404(projectId)
    chorus = find_chorus_section_or_404(project)

    current_revision = int(project.get("revision", 0))
    if request.revision != current_revision:
        return ChorusValidateResponse(
            projectId=projectId,
            sectionId=chorus["sectionId"],
            revision=current_revision,
            valid=False,
            errors=["RevisionConflict"],
            previewImpact={},
        )

    warnings: List[str] = []
    for op in request.operations:
        if op.op == "updateNote" and "pitch" in op.payload:
            warnings.append("Placeholder: harmonic validation not implemented")
            break

    return ChorusValidateResponse(
        projectId=projectId,
        sectionId=chorus["sectionId"],
        revision=current_revision,
        valid=True,
        warnings=warnings,
        errors=[],
        previewImpact={
            "operationsCount": len(request.operations),
            "affectedSection": chorus["sectionId"],
            "mode": "placeholder",
        },
    )


@app.post("/projects/{projectId}/chorus/ai/insights", response_model=ChorusInsightsResponse)
def chorus_ai_insights(projectId: str, request: ChorusInsightsRequest) -> ChorusInsightsResponse:
    """Entrega insights básicos del coro con contenido placeholder."""
    project = get_project_or_404(projectId)
    chorus = find_chorus_section_or_404(project)

    current_revision = int(project.get("revision", 0))
    if request.revision != current_revision:
        raise HTTPException(status_code=409, detail="RevisionConflict")

    return ChorusInsightsResponse(
        projectId=projectId,
        sectionId=chorus["sectionId"],
        revision=current_revision,
        globalNarrative="Placeholder: el coro presenta tensión media-alta y cierre estable.",
        sectionInsights=[
            {
                "sectionId": chorus["sectionId"],
                "whatHappens": "Se identifica una región de coro activa para análisis.",
                "whyItFeelsLikeThat": "Placeholder sin análisis armónico profundo.",
                "evidence": {
                    "bars": [chorus.get("startBar"), chorus.get("startBar", 0) + chorus.get("barLength", 0) - 1],
                    "cadenceType": "placeholder",
                },
            }
        ],
        riskFlags=["Placeholder: repetitive_pattern_check_pending"],
    )
