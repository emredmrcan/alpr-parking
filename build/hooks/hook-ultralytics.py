# PyInstaller hook for ultralytics (YOLO)
#
# Ultralytics uses dynamic imports and ships YAML config files that must be
# included in the bundle.  collect_all() picks up everything.

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = collect_all("ultralytics")
