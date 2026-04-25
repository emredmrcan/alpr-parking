## Camera tools
- ivcam
- droidcam


- Downloaded python 3.11
py --version

- Downloaded nodejs LTS
node --version
npm --version

- cd C:\path\to\your\project

- py -m venv .venv
.venv\Scripts\activate

- pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

- pip install -r requirements.txt
- pip install pyinstaller colorama

-------
cd /d C:\Users\ardam\PycharmProjects\alpr-parking
.venv\Scripts\activate

py -m PyInstaller build\alpr_engine.spec --distpath dist\_pyinstaller --workpath build\_work --noconfirm

rmdir /s /q dist\ALPRParking-1.0.0\app\alpr_engine
xcopy /e /i /y dist\_pyinstaller\alpr_engine dist\ALPRParking-1.0.0\app\alpr_engine

--------
PROCESS_INTERVAL_SEC=2.0
PROCESS_WIDTH=960
TORCH_THREADS=2
CV2_THREADS=2