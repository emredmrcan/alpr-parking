"""User-facing strings for API responses (no internal IDs or stack traces).

The language follows the request's ``Accept-Language`` header (``en`` or ``tr``);
the frontend sends its active UI language. Anything else falls back to English.
"""

from __future__ import annotations

from contextvars import ContextVar

SUPPORTED_LANGS = ("en", "tr")
DEFAULT_LANG = "en"

_current_lang: ContextVar[str] = ContextVar("current_lang", default=DEFAULT_LANG)

MESSAGES: dict[str, dict[str, str]] = {
    "barrier_failed": {
        "en": "The barrier command could not be completed. Check the gate settings and connection.",
        "tr": "Bariyer komutu tamamlanamadı. Kapı ayarları ve bağlantıyı kontrol edin.",
    },
    "validation_error": {
        "en": "The submitted data is invalid. Please check the fields.",
        "tr": "Gönderilen bilgiler geçersiz. Lütfen alanları kontrol edin.",
    },
    "gate_not_found": {"en": "Gate not found.", "tr": "Kapı bulunamadı."},
    "gate_required_for_barrier": {
        "en": "A gate must be selected when the barrier is to be opened.",
        "tr": "Bariyer açılacaksa kapı seçimi zorunludur.",
    },
    "plate_already_active": {
        "en": "This plate already has an open session. Use the exit action.",
        "tr": "Bu plaka için zaten açık bir oturum var. Çıkış işlemini kullanın.",
    },
    "no_active_session_for_plate": {
        "en": "No active session found for this plate.",
        "tr": "Bu plaka için kayıtlı aktif oturum bulunamadı.",
    },
    "session_not_found": {"en": "Session not found.", "tr": "Oturum bulunamadı."},
    "session_not_active": {
        "en": "This session is already closed or in an invalid state.",
        "tr": "Bu oturum zaten kapatılmış veya geçersiz durumda.",
    },
    "subscription_not_found": {"en": "Subscription not found.", "tr": "Abonelik bulunamadı."},
    "subscription_overlap_create": {
        "en": (
            "This plate already has an active subscription in the selected date range. "
            "Try renewing or deactivating the existing subscription."
        ),
        "tr": (
            "Bu plaka için seçilen tarih aralığında zaten aktif bir abonelik var. "
            "Mevcut aboneliği yenilemeyi veya devre dışı bırakmayı deneyin."
        ),
    },
    "subscription_overlap_update": {
        "en": "This plate already has another active subscription in the selected date range.",
        "tr": "Bu plaka için seçilen tarih aralığında zaten aktif başka bir abonelik var.",
    },
    "camera_source_in_use": {
        "en": 'Gate "{label}" already uses this camera source. Please change it before continuing.',
        "tr": '"{label}" kapısı zaten bu kamera kaynağını kullanıyor. Devam etmeden önce lütfen değiştirin.',
    },
    "invalid_barrier_driver": {"en": "Invalid barrier type.", "tr": "Geçersiz bariyer tipi."},
    "relay_requires_port": {
        "en": "A COM port is required when relay is selected (e.g. COM3).",
        "tr": "Relay seçildiğinde COM port zorunludur (ör. COM3).",
    },
    "ip_requires_url": {
        "en": "A URL is required when IP barrier is selected.",
        "tr": "IP bariyer seçildiğinde URL zorunludur.",
    },
    "camera_open_failed": {
        "en": "Could not open the camera source. Check the index or address.",
        "tr": "Kamera kaynağı açılamadı. Numara veya adresi kontrol edin.",
    },
    "camera_no_frame": {
        "en": "Could not grab an image from the camera.",
        "tr": "Kameradan görüntü alınamadı.",
    },
    "camera_encode_failed": {
        "en": "Could not encode the camera frame as JPEG.",
        "tr": "Kamera karesi JPEG'e dönüştürülemedi.",
    },
    "price_rule_not_found": {"en": "Pricing rule not found.", "tr": "Fiyat kuralı bulunamadı."},
    "unsupported_file_type": {
        "en": "Unsupported file type. Upload a JPEG, PNG, WebP or BMP image.",
        "tr": "Desteklenmeyen dosya türü. JPEG, PNG, WebP veya BMP yükleyin.",
    },
    "image_too_large": {"en": "Image exceeds the 20 MB limit.", "tr": "Görüntü 20 MB sınırını aşıyor."},
}


def parse_accept_language(header: str | None) -> str:
    """Pick the best supported language from an ``Accept-Language`` header."""
    if not header:
        return DEFAULT_LANG
    candidates: list[tuple[float, str]] = []
    for part in header.split(","):
        piece = part.strip()
        if not piece:
            continue
        tag, _, params = piece.partition(";")
        quality = 1.0
        params = params.strip()
        if params.startswith("q="):
            try:
                quality = float(params[2:])
            except ValueError:
                quality = 0.0
        candidates.append((quality, tag.strip().lower().split("-")[0]))
    for _, lang in sorted(candidates, key=lambda c: -c[0]):
        if lang in SUPPORTED_LANGS:
            return lang
    return DEFAULT_LANG


def set_language(lang: str) -> None:
    _current_lang.set(lang if lang in SUPPORTED_LANGS else DEFAULT_LANG)


def msg(key: str, **params: object) -> str:
    """Return the message for ``key`` in the current request's language."""
    entry = MESSAGES[key]
    text = entry.get(_current_lang.get()) or entry[DEFAULT_LANG]
    return text.format(**params) if params else text


def barrier_operator_notes(success: bool) -> str | None:
    """Notes returned to the operator UI; keep generic — raw driver errors stay in DB only."""
    if success:
        return None
    return msg("barrier_failed")
