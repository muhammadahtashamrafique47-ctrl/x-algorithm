#!/usr/bin/env bash
# Rebuild the whole Short from scratch: assets -> narration timeline -> audio mix -> video.
# Requires: python3 with pillow, numpy, imageio-ffmpeg (pip install -r requirements.txt)
set -euo pipefail
cd "$(dirname "$0")/render"

echo "== 1/4 assets"
python3 assets.py

echo "== 2/4 narration timeline + VO master"
python3 timeline.py

echo "== 3/4 music bed, SFX, -14 LUFS mix"
python3 audio.py

echo "== 4/4 video render + mux"
python3 render.py
python3 thumb.py

echo
echo "done:"
ls -lh ../video ../audio/mix_master.wav
