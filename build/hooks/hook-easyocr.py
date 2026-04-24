# PyInstaller hook for easyocr
#
# EasyOCR ships model config files and uses dynamic imports for detection/
# recognition backends.  collect_all() ensures nothing is missed.

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = collect_all("easyocr")
