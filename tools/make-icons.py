#!/usr/bin/env python3
"""Genera el set de iconos de la PWA (icon-192, icon-512, maskable, apple-touch, favicon)."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)

FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

# Colores de marca
C_TOP = (37, 99, 235)    # #2563eb
C_BOT = (14, 165, 233)   # #0ea5e9

def gradient(size):
    """Fondo con gradiente diagonal azul -> cyan."""
    img = Image.new('RGB', (size, size), C_TOP)
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            r = int(C_TOP[0] + (C_BOT[0] - C_TOP[0]) * t)
            g = int(C_TOP[1] + (C_BOT[1] - C_TOP[1]) * t)
            b = int(C_TOP[2] + (C_BOT[2] - C_TOP[2]) * t)
            px[x, y] = (r, g, b)
    return img

def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

def draw_symbol(img, size, ratio):
    """Dibuja el símbolo $ blanco centrado. ratio = alto del glifo / tamaño."""
    draw = ImageDraw.Draw(img)
    fsize = int(size * ratio)
    font = ImageFont.truetype(FONT_BOLD, fsize)
    text = '$'
    # medir
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1]
    # sombra suave
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.text((x, y + size * 0.012), text, font=font, fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.012))
    img.paste(Image.alpha_composite(img.convert('RGBA'), shadow).convert('RGB'), (0, 0))
    draw = ImageDraw.Draw(img)
    draw.text((x, y), text, font=font, fill=(255, 255, 255))
    return img

def make_icon(size, rounded=True, ratio=0.62, radius_ratio=0.22):
    img = gradient(size)
    img = draw_symbol(img, size, ratio)
    if rounded:
        mask = rounded_mask(size, int(size * radius_ratio))
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img.convert('RGBA')

# --- Iconos "any" (con esquinas redondeadas) ---
make_icon(192, rounded=True, ratio=0.62).save(os.path.join(OUT, 'icon-192.png'))
make_icon(512, rounded=True, ratio=0.62).save(os.path.join(OUT, 'icon-512.png'))

# --- Icono "maskable" (fondo a sangre, símbolo dentro de la zona segura) ---
make_icon(512, rounded=False, ratio=0.46).save(os.path.join(OUT, 'icon-maskable-512.png'))

# --- Apple touch icon (180) ---
make_icon(180, rounded=True, ratio=0.62).save(os.path.join(OUT, 'apple-touch-icon.png'))

# --- Favicon ---
fav = make_icon(64, rounded=True, ratio=0.66)
fav.save(os.path.join(OUT, 'favicon.png'))
fav.save(os.path.join(OUT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

print('Iconos generados en', os.path.abspath(OUT))
for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    print(' ', f, os.path.getsize(p), 'bytes')
