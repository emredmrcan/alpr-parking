import cv2
import re
import numpy as np

# ── OCR correction maps ───────────────────────────────────────────────────────

# In the DIGIT section: letters that look like digits
_LETTER_TO_DIGIT = {
    'O': '0',
    'I': '1',
    'L': '1',
    'S': '5',
    'B': '8',
    'G': '6',
    'Z': '2',
    'T': '7',
    'A': '4',
    'E': '3',
}

# Valid plate letters (A-Z excluding Q, W, X which are not used on Turkish plates)
_VALID_PLATE_LETTERS = set('ABCDEFGHIJKLMNOPRSTUVYZ')

# Stripe noise OCR produces from the blue EU/TR band on the left of the plate
_STRIPE_NOISE = ['TRI', 'TRF', 'TR']


def _strip_raw(text: str) -> str:
    """Remove non-alphanumeric chars, uppercase, strip TR stripe noise."""
    clean = re.sub(r'[^A-Z0-9]', '', text.upper())
    for noise in _STRIPE_NOISE:
        clean = clean.replace(noise, '')
    return clean


def clean_tr_plate(raw_ocr: str) -> str:
    """
    Correct OCR errors using Turkish plate structure rules.

    Turkish plate format: NN [1-3 LETTERS] [2-5 DIGITS]
    where NN is a province code 01-81.

    After the letter group is complete (max 3 letters or first real digit
    encountered), every remaining character is expected to be a digit.
    Any letter that looks like a digit in that position is substituted
    (O→0, I→1, S→5, B→8, G→6, Z→2, T→7, A→4, E→3).

    Examples
    --------
    34FRKO52  →  34FRK052   (O after 3-letter group must be 0)
    06ABC123  →  06ABC123   (already clean)
    34AB1S34  →  34AB1534   (S in digit section → 5)
    """
    text = _strip_raw(raw_ocr)

    if len(text) < 5:
        return text

    # Province code must be two digits
    if not text[:2].isdigit():
        return text

    province = text[:2]
    rest = text[2:]

    # Collect letter group: up to 3 valid plate letters
    # Stop as soon as we hit a real digit (that signals start of digit section)
    letter_chars: list[str] = []
    i = 0
    while i < len(rest) and len(letter_chars) < 3:
        ch = rest[i]
        if ch.isalpha():
            letter_chars.append(ch)
            i += 1
        elif ch.isdigit() and len(letter_chars) >= 1:
            # First genuine digit after at least one letter → digit section starts
            break
        else:
            # Digit before any letter encountered — skip (edge case)
            i += 1

    # Everything from i onward is the digit section
    digit_raw = rest[i:]

    # Apply OCR correction in the digit section
    digit_clean: list[str] = []
    for ch in digit_raw:
        if ch.isdigit():
            digit_clean.append(ch)
        elif ch in _LETTER_TO_DIGIT:
            digit_clean.append(_LETTER_TO_DIGIT[ch])
        else:
            digit_clean.append(ch)

    return province + ''.join(letter_chars) + ''.join(digit_clean)


def preprocess_plate(plate_img):
    """
    Preprocess the license plate image for better OCR results.
    """
    if plate_img is None or plate_img.size == 0:
        return None

    # Step 1: Resize
    height, width = plate_img.shape[:2]
    plate_img = cv2.resize(plate_img, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC)

    # Step 2: Grayscale
    gray = cv2.cvtColor(plate_img, cv2.COLOR_BGR2GRAY)

    return gray


def validate_tr_plate(text: str) -> tuple[bool, str]:
    """
    Validate and lightly normalise a plate string.

    Call clean_tr_plate() first for full OCR correction, then pass the result
    here for structural validation.

    Returns (is_valid, normalised_text).
    """
    clean_text = _strip_raw(text)

    if len(clean_text) < 5:
        return False, clean_text

    # Province code 01-81
    province_code_str = clean_text[:2]
    if not province_code_str.isdigit():
        return False, clean_text

    province_code = int(province_code_str)
    if not (1 <= province_code <= 81):
        return False, clean_text

    # Turkish plate patterns (spaces removed):
    # 99 X 9999  / 99 X 99999
    # 99 XX 999  / 99 XX 9999
    # 99 XXX 99  / 99 XXX 999
    patterns = [
        r'^[0-8][0-9][A-PR-VYZ][0-9]{4,5}$',
        r'^[0-8][0-9][A-PR-VYZ]{2}[0-9]{3,4}$',
        r'^[0-8][0-9][A-PR-VYZ]{3}[0-9]{2,3}$',
    ]

    for pattern in patterns:
        if re.match(pattern, clean_text):
            return True, clean_text

    return False, clean_text
