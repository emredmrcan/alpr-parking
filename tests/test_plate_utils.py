import unittest

from utils.plate_utils import clean_tr_plate, validate_tr_plate


class TestPlateUtils(unittest.TestCase):
    def test_preserves_legitimate_tr_in_letter_group(self) -> None:
        cleaned = clean_tr_plate("34TR1234")
        self.assertEqual(cleaned, "34TR1234")
        is_valid, normalized = validate_tr_plate(cleaned)
        self.assertTrue(is_valid)
        self.assertEqual(normalized, "34TR1234")

    def test_strips_tr_prefix_noise_only(self) -> None:
        cleaned = clean_tr_plate("TR34TR1234")
        self.assertEqual(cleaned, "34TR1234")
        is_valid, normalized = validate_tr_plate(cleaned)
        self.assertTrue(is_valid)
        self.assertEqual(normalized, "34TR1234")

    def test_strips_tri_trf_prefix_noise(self) -> None:
        tri_cleaned = clean_tr_plate("TRI34ABC123")
        trf_cleaned = clean_tr_plate("TRF06ABC123")
        self.assertEqual(tri_cleaned, "34ABC123")
        self.assertEqual(trf_cleaned, "06ABC123")
        self.assertTrue(validate_tr_plate(tri_cleaned)[0])
        self.assertTrue(validate_tr_plate(trf_cleaned)[0])

    def test_digit_section_ocr_correction(self) -> None:
        cleaned = clean_tr_plate("34AB1S34")
        self.assertEqual(cleaned, "34AB1534")
        is_valid, normalized = validate_tr_plate(cleaned)
        self.assertTrue(is_valid)
        self.assertEqual(normalized, "34AB1534")


if __name__ == "__main__":
    unittest.main()
