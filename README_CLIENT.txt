============================================================
 ALPR PARKING SYSTEM — QUICK START GUIDE
============================================================

FIRST TIME SETUP
----------------
1. Unzip the ALPRParking folder to any location (e.g. C:\ALPRParking\).
2. Open the ALPRParking folder.
3. Double-click  START.bat
4. Wait about 20–30 seconds. The system will open automatically in your
   web browser.
5. Follow the on-screen setup instructions (language, database, camera).


STARTING THE SYSTEM
-------------------
   → Double-click  START.bat
   → Wait about 20–30 seconds.
   → The app opens automatically in your browser.

If the browser does not open automatically:
   → Open any browser (Chrome, Edge, Firefox)
   → Go to:  http://localhost:8000


STOPPING THE SYSTEM
-------------------
   → Double-click  STOP.bat
   → Or close the two black command windows (Server and Engine).


ADDING A CAMERA
---------------
1. Make sure the system is running (START.bat).
2. Open:  http://localhost:8000/gates
3. Click "Add Gate" and follow the wizard.
4. Enter the camera index (0 = first USB camera, 1 = second USB camera)
   or the RTSP/HTTP URL for a network camera.


TROUBLESHOOTING
---------------

Problem: START.bat opens and closes immediately.
Solution: Right-click START.bat → "Run as administrator".

Problem: "Server did not start within 60 seconds."
Solution: Check that port 8000 is not used by another program.
          Open Task Manager, look for alpr_server.exe, check its window.

Problem: Camera shows "No plates detected" constantly.
Solution: • Make sure the camera is connected and lit correctly.
          • Try a higher DETECTION_CONFIDENCE value in config\.env.
          • Aim the camera at the licence plate from a distance of 1–4 metres.

Problem: Plates are detected but look wrong (e.g. "34ABC1" reads as "34ARC1").
Solution: Improve lighting. Avoid direct sunlight or strong shadows on the plate.
          Lower the OCR_CONFIDENCE value slightly (e.g. 0.25) in config\.env.

Problem: The barrier does not open.
Solution: • Make sure the USB relay board is connected.
          • Open config\.env and set BARRIER_PORT to the correct COM port.
          • Check Device Manager for the COM port number.

Problem: Windows Defender shows a warning when starting.
Solution: Click "More info" → "Run anyway". This is a known PyInstaller behaviour.
          Contact your IT department if you need a signed executable.


CONFIGURATION FILE
------------------
Settings are stored in:   config\.env

You can edit this file with Notepad to change:
  - Camera detection sensitivity  (DETECTION_CONFIDENCE, OCR_CONFIDENCE)
  - CPU / GPU inference           (ALPR_DEVICE, OCR_DEVICE — see below)
  - Scan frequency / CPU load     (PROCESS_INTERVAL_SEC, PROCESS_WIDTH)
  - Barrier COM port              (BARRIER_PORT)
  - Barrier type                  (BARRIER_TYPE: dummy / relay / ip)
  - Database type                 (DATABASE_TYPE: sqlite / postgresql)
  - Log verbosity                 (LOG_LEVEL: INFO / DEBUG)

GPU / high CPU usage (optional):
  - ALPR_DEVICE=auto   uses NVIDIA GPU for plate detection when available
  - OCR_DEVICE=auto    uses GPU for character recognition when available
  - Set both to cpu on machines without a GPU build
  - OCR_USE_DET=false and OCR_USE_CLS=false reduce CPU when YOLO already finds the plate
  - PROCESS_INTERVAL_SEC=2.0 lowers CPU with two cameras (default in template)

After editing config\.env, restart the system (STOP.bat → START.bat).


DATA LOCATION
-------------
  Database:  config\alpr_parking.db
  Images:    uploads\

Back up these two locations regularly.


SUPPORT
-------
For technical assistance, contact your system provider.

============================================================
