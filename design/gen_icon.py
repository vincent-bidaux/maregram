import math

W = H = 1024
BASELINE = 650
AMPLITUDE = 205
PERIODS = 1.5

def wave_y(x_frac):
    phase = x_frac * PERIODS * 2 * math.pi - math.pi / 2
    return BASELINE - AMPLITUDE * math.cos(phase)

N = 400
EXT = 0.06  # extend path beyond canvas so round line-caps get clipped, not visible
pts = []
for i in range(N + 1):
    xf = -EXT + (1 + 2 * EXT) * i / N
    x = xf * W
    y = wave_y(xf)
    pts.append((x, y))

path = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)

troughs = []
for i in range(1, len(pts) - 1):
    if pts[i][1] > pts[i - 1][1] and pts[i][1] > pts[i + 1][1] and 0 <= pts[i][0] <= W:
        troughs.append(pts[i])

red_x, red_y = min(troughs, key=lambda p: abs(p[0] - W / 2))

thr_amber_y = BASELINE + AMPLITUDE * 0.62
thr_purple_y = BASELINE + AMPLITUDE * 0.76
thr_green_y = BASELINE + AMPLITUDE * 0.95

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <defs>
    <linearGradient id="bg" x1="10%" y1="0%" x2="75%" y2="100%">
      <stop offset="0%" stop-color="#2a557a"/>
      <stop offset="45%" stop-color="#153a58"/>
      <stop offset="100%" stop-color="#0a1c2e"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="{W}" height="{H}" fill="url(#bg)"/>
  <line x1="0" y1="{thr_amber_y:.1f}" x2="{W}" y2="{thr_amber_y:.1f}" stroke="#f5a623" stroke-width="10" stroke-dasharray="18 26" opacity="0.9"/>
  <line x1="0" y1="{thr_purple_y:.1f}" x2="{W}" y2="{thr_purple_y:.1f}" stroke="#c77dff" stroke-width="10" stroke-dasharray="18 26" opacity="0.85"/>
  <line x1="0" y1="{thr_green_y:.1f}" x2="{W}" y2="{thr_green_y:.1f}" stroke="#4ade80" stroke-width="10" stroke-dasharray="18 26" opacity="0.8"/>
  <path d="{path}" fill="none" stroke="#5ec4ea" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="{red_x:.1f}" cy="{red_y:.1f}" r="46" fill="#e2554f" stroke="#0a1c2e" stroke-width="14"/>
</svg>'''

with open("/Users/vincent/Downloads/maree-la-rochelle/design/icon-master.svg", "w") as f:
    f.write(svg)
print("red dot at", red_x, red_y)
