"""User-facing Turkish strings for API responses (no internal IDs or stack traces)."""

from __future__ import annotations


def barrier_operator_notes(success: bool) -> str | None:
    """Notes returned to the operator UI; keep generic — raw driver errors stay in DB only."""
    if success:
        return None
    return "Bariyer komutu tamamlanamadı. Kapı ayarları ve bağlantıyı kontrol edin."
