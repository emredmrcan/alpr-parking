# PyInstaller hook for timm (PyTorch Image Models)
#
# timm is pulled in by EasyOCR and uses dynamic architecture loading.

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = collect_all("timm")
