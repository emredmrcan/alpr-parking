import cv2
import re
import numpy as np

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

    # Step 3: Denoise
    # denoised = cv2.fastNlMeansDenoising(gray, h=10)

    # Step 4: Thresholding
    # thresh = cv2.adaptiveThreshold(denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
    #                                cv2.THRESH_BINARY, 11, 2)

    return gray

def validate_tr_plate(text):
    """
    Validates if the text matches standard Turkish License Plate formats.

    Rules:
    - Starts with Province Code: 01-81
    - Followed by 1-3 letters (A-Z, excluding common exclusions if strict,
      but Turkish plates use most Latin characters except Ç, Ş, İ, Ö, Ü, Ğ).
    - Ends with 2-4 digits.
    - Total length usually between 7 and 9 characters.
    """
    # Remove any non-alphanumeric characters
    clean_text = re.sub(r'[^A-Z0-9]', '', text.upper())

    # Common OCR misreadings of the blue stripe (TR + part of the blue region)
    stripe_noise = ["TRI", "TRF", "TR", "T R I", "T R F", "T R"]
    for noise in stripe_noise:
        clean_text = clean_text.replace(noise.replace(" ", ""), "")

    if len(clean_text) < 5:
        return False, clean_text

    # Validate Province Code (First 2 digits 01-81)
    province_code_str = clean_text[:2]
    if not province_code_str.isdigit():
        return False, clean_text

    province_code = int(province_code_str)
    if not (1 <= province_code <= 81):
        return False, clean_text

    # Turkish plate patterns:
    # 1. 00 A 0000 or 00 A 00000 (00 A 1234, 00 A 12345)
    # 2. 00 AA 000 or 00 AA 0000 (00 AA 123, 00 AA 1234)
    # 3. 00 AAA 00 or 00 AAA 000 (00 AAA 12, 00 AAA 123)

    # Simplified regex for Turkish formats:
    # ^(Province)(Letters)(Digits)$
    # Letters are typically 1 to 3 characters.
    # Digits are typically 2 to 4 characters (sometimes 5 for older ones).

    # We exclude Q, W, X as they are generally not used in standard plates.
    # We also exclude Turkish specific chars which were already removed by re.sub.
    patterns = [
        r'^[0-8][0-9][A-PR-VYZ][0-9]{4,5}$',       # 34 A 1234(5)
        r'^[0-8][0-9][A-PR-VYZ]{2}[0-9]{3,4}$',    # 34 AA 123(4)
        r'^[0-8][0-9][A-PR-VYZ]{3}[0-9]{2,3}$'     # 34 AAA 12(3)
    ]

    for pattern in patterns:
        if re.match(pattern, clean_text):
            return True, clean_text

    return False, clean_text
