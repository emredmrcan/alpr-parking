# PyInstaller hook for rapidocr_onnxruntime
#
# RapidOCR ships ONNX model files and config inside the package directory.
# collect_all() ensures the model binaries and package data are bundled.

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = collect_all("rapidocr_onnxruntime")
