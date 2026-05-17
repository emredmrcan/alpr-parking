"""Tests for device resolution helpers (no GPU required)."""

from __future__ import annotations

import os
import unittest
from unittest import mock

from utils.device_config import (
    env_bool,
    format_alpr_device,
    resolve_alpr_device,
    resolve_ocr_use_cuda,
)


class TestEnvBool(unittest.TestCase):
    def test_defaults(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertTrue(env_bool("MISSING", True))
            self.assertFalse(env_bool("MISSING", False))

    def test_truthy(self) -> None:
        with mock.patch.dict(os.environ, {"FLAG": "yes"}):
            self.assertTrue(env_bool("FLAG", False))


class TestResolveAlprDevice(unittest.TestCase):
    def test_explicit_cpu(self) -> None:
        with mock.patch.dict(os.environ, {"ALPR_DEVICE": "cpu"}):
            self.assertEqual(resolve_alpr_device(), "cpu")

    @mock.patch("utils.device_config.torch_cuda_available", return_value=False)
    def test_auto_without_cuda(self, _mock_cuda: mock.MagicMock) -> None:
        with mock.patch.dict(os.environ, {"ALPR_DEVICE": "auto"}):
            self.assertEqual(resolve_alpr_device(), "cpu")

    @mock.patch("utils.device_config.torch_cuda_available", return_value=True)
    def test_auto_with_cuda(self, _mock_cuda: mock.MagicMock) -> None:
        with mock.patch.dict(os.environ, {"ALPR_DEVICE": "auto"}):
            self.assertEqual(resolve_alpr_device(), 0)

    @mock.patch("utils.device_config.torch_cuda_available", return_value=False)
    def test_cuda_requested_but_unavailable(self, _mock_cuda: mock.MagicMock) -> None:
        with mock.patch.dict(os.environ, {"ALPR_DEVICE": "cuda"}):
            self.assertEqual(resolve_alpr_device(), "cpu")


class TestResolveOcrUseCuda(unittest.TestCase):
    def test_explicit_cpu(self) -> None:
        with mock.patch.dict(os.environ, {"OCR_DEVICE": "cpu"}):
            self.assertFalse(resolve_ocr_use_cuda())

    @mock.patch("utils.device_config.ort_cuda_available", return_value=False)
    def test_auto_without_ort_cuda(self, _mock_ort: mock.MagicMock) -> None:
        with mock.patch.dict(os.environ, {"OCR_DEVICE": "auto"}):
            self.assertFalse(resolve_ocr_use_cuda())

    @mock.patch("utils.device_config.ort_cuda_available", return_value=True)
    def test_auto_with_ort_cuda(self, _mock_ort: mock.MagicMock) -> None:
        with mock.patch.dict(os.environ, {"OCR_DEVICE": "auto"}):
            self.assertTrue(resolve_ocr_use_cuda())


class TestFormatAlprDevice(unittest.TestCase):
    def test_formats(self) -> None:
        self.assertEqual(format_alpr_device("cpu"), "cpu")
        self.assertEqual(format_alpr_device(0), "cuda:0")


if __name__ == "__main__":
    unittest.main()
