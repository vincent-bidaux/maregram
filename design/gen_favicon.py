import math

W = H = 256
BASELINE = 165
AMPLITUDE = 62
PERIODS = 1.0  # single wave: simpler, bolder, reads well at 16px

def wave_y(x_frac):
    phase = x_frac * PERIODS * 2 * math.pi
    return BASELINE - AMPLITUDE * math.cos(phase)

N = 200
EXT = 0.08
pts = []
for i in range(N + 1):
    xf = -EXT + (1 + 2 * EXT) * i / N
    x = xf * W
    y = wave_y(xf)
    pts.append((x, y))

path = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)

troughs = [p for i, p in enumerate(pts[1:-1], 1)
           if p[1] > pts[i - 1][1] and p[1] > pts[i + 1][1] and 0 <= p[0] <= W]
red_x, red_y = min(troughs, key=lambda p: abs(p[0] - W / 2))

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <defs>
    <linearGradient id="bg" x1="15%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#2a557a"/>
      <stop offset="100%" stop-color="#0a1c2e"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="{W}" height="{H}" fill="url(#bg)"/>
  <path d="{path}" fill="none" stroke="#5ec4ea" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="{red_x:.1f}" cy="{red_y:.1f}" r="26" fill="#e2554f" stroke="#0a1c2e" stroke-width="8"/>
</svg>'''

with open("/Users/vincent/Downloads/maree-la-rochelle/design/favicon-master.svg", "w") as f:
    f.write(svg)
print("red dot at", red_x, red_y)
