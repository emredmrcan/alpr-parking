from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/translations", tags=["translations"])

TRANSLATIONS_DIR = Path(__file__).resolve().parents[2] / "translations"
SUPPORTED_LANGS = {"tr", "en"}
DEFAULT_LANG = "tr"


class LanguageInfo(BaseModel):
    lang: str
    name: str


class AvailableLanguagesOut(BaseModel):
    default: str
    languages: list[LanguageInfo]


@lru_cache(maxsize=8)
def _load_translation(lang: str) -> dict[str, Any]:
    path = TRANSLATIONS_DIR / f"{lang}.json"
    if not path.exists():
        raise FileNotFoundError(lang)
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def _get_or_default(lang: str) -> dict[str, Any]:
    try:
        return _load_translation(lang)
    except FileNotFoundError:
        return _load_translation(DEFAULT_LANG)


@router.get("", response_model=AvailableLanguagesOut, summary="List available languages")
def list_languages() -> AvailableLanguagesOut:
    langs: list[LanguageInfo] = []
    for lang in sorted(SUPPORTED_LANGS):
        try:
            data = _load_translation(lang)
            langs.append(LanguageInfo(lang=lang, name=data["meta"]["name"]))
        except (FileNotFoundError, KeyError):
            pass
    return AvailableLanguagesOut(default=DEFAULT_LANG, languages=langs)


@router.get("/{lang}", summary="Get all UI strings for a language")
def get_translations(lang: str) -> dict[str, Any]:
    if lang not in SUPPORTED_LANGS:
        raise HTTPException(
            status_code=404,
            detail=f"Language '{lang}' not supported. Available: {sorted(SUPPORTED_LANGS)}",
        )
    return _get_or_default(lang)


@router.get("/{lang}/{namespace}", summary="Get a specific namespace (e.g. common, nav, dashboard)")
def get_namespace(lang: str, namespace: str) -> dict[str, Any]:
    if lang not in SUPPORTED_LANGS:
        raise HTTPException(
            status_code=404,
            detail=f"Language '{lang}' not supported.",
        )
    data = _get_or_default(lang)
    if namespace not in data:
        raise HTTPException(
            status_code=404,
            detail=f"Namespace '{namespace}' not found in language '{lang}'.",
        )
    return data[namespace]
