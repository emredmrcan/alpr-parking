from __future__ import annotations

"""Camera utility endpoints — currently: USB discovery only.

The endpoint probes indices 0..MAX_CAMERAS_TO_PROBE-1 in parallel so that
dead indices (which block for ~2 s each) don't serialize the whole scan.
On Windows, CAP_DSHOW is used to avoid the MSMF cold-start delay.
"""

import base64
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import cv2
from fastapi import APIRouter

from api.schemas import CameraDiscoveryItem

router = APIRouter(prefix="/cameras", tags=["cameras"])

MAX_CAMERAS_TO_PROBE = 10
_THUMB_WIDTH = 160
_JPEG_QUALITY = 70
# Many cameras return black frames for the first few reads while auto-exposure
# adjusts.  Discarding this many frames gives a properly-exposed thumbnail.
_WARMUP_FRAMES = 5


def _probe_camera(index: int) -> CameraDiscoveryItem:
    """Try to open the camera at *index*, grab a properly-exposed frame, and return a result."""
    if sys.platform == "win32":
        cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
    else:
        cap = cv2.VideoCapture(index)

    if not cap.isOpened():
        cap.release()
        return CameraDiscoveryItem(index=index, available=False)

    # Discard warm-up frames so auto-exposure can settle
    for _ in range(_WARMUP_FRAMES):
        cap.read()

    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        return CameraDiscoveryItem(index=index, available=False)

    h, w = frame.shape[:2]
    scale = _THUMB_WIDTH / w
    thumb = cv2.resize(frame, (_THUMB_WIDTH, int(h * scale)))
    encoded_ok, buf = cv2.imencode(".jpg", thumb, [cv2.IMWRITE_JPEG_QUALITY, _JPEG_QUALITY])
    if not encoded_ok:
        return CameraDiscoveryItem(index=index, available=True, resolution=f"{w}x{h}")

    b64 = base64.b64encode(buf).decode()
    return CameraDiscoveryItem(
        index=index,
        available=True,
        resolution=f"{w}x{h}",
        thumbnail_b64=b64,
    )


@router.post(
    "/discover",
    response_model=list[CameraDiscoveryItem],
    summary="Probe connected USB cameras and return thumbnails",
)
def discover_cameras() -> list[CameraDiscoveryItem]:
    """
    Probe camera indices 0–9 in parallel (ThreadPoolExecutor) and return results
    sorted by index.  Available cameras include a 160-px-wide JPEG thumbnail
    encoded as base64.  The scan typically completes in under 5 seconds even
    when several indices are unused.
    """
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(_probe_camera, i): i for i in range(MAX_CAMERAS_TO_PROBE)}
        results = [f.result() for f in as_completed(futures)]
    return sorted(results, key=lambda r: r.index)
