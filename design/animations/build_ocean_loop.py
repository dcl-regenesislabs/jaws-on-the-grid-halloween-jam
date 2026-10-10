"""Animate the existing ocean artwork into a seamless four-second video.

Requires imageio-ffmpeg. No generated intermediate frames are kept in assets.
"""
from pathlib import Path
import subprocess
import imageio_ffmpeg

root = Path(__file__).resolve().parents[2]
out = root / 'assets/videos/cinematic-ocean.mp4'
out.parent.mkdir(exist_ok=True)
# All temporal frequencies are integer multiples of the four-second period.
# The sky stays quiet; the surface rolls and underwater light gently refracts.
phase = '2*PI*T/4'
water = 'min(1,max(0,(Y/H-0.12)*14))'
dx = f'clip(X+({water})*(3*sin(Y/28+{phase})+1.5*sin(Y/65-2*{phase})),0,W-1)'
dy = f'clip(Y+({water})*(2.7*sin(X/105+{phase})+1.3*sin(X/53-2*{phase})),0,H-1)'
light = f'(1+0.018*({water})*sin(X/90+Y/120-{phase}))'
# geq writes 8-bit planes: unclamped highlights above 255 wrap into dark/
# saturated speckles before H.264 encoding. Clamp before quantization.
channels = ':'.join(f"{c}='clip({c}({dx},{dy})*{light},0,255)'" for c in ['r', 'g', 'b'])
subprocess.run([
    imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loop', '1', '-framerate', '24',
    '-i', str(root / 'assets/images/cinematic-ocean.png'), '-t', '4',
    '-vf', 'scale=1280:556,geq=' + channels, '-an', '-c:v', 'libx264',
    '-preset', 'medium', '-crf', '18', '-maxrate', '3500k', '-bufsize', '7000k',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(out)
], check=True)
