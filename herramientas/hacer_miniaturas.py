"""Genera las miniaturas livianas que usa la pared de fotos.

El panel (/admin) ya crea la miniatura de cada foto que se sube: este script es
solo para arreglos a mano (por ejemplo, si se copió una foto directo a la carpeta).

Para cada foto en fotos/<carpeta>/NN.jpg crea fotos/<carpeta>/mini/NN.jpg
(640 px de ancho como máximo). La foto grande se sigue usando al abrirla.
Si una foto no tiene miniatura, el sitio usa la grande: no se rompe nada.

Uso (desde la carpeta portfolio-sabrina):
    python herramientas/hacer_miniaturas.py

Necesita Pillow:  pip install Pillow
"""
import os
import sys

from PIL import Image, ImageOps

ANCHO_MAX, ALTO_MAX = 640, 960
CALIDAD = 78

raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fotos")
raiz = os.path.normpath(raiz)
hechas = saltadas = 0
total_kb = 0

for carpeta in sorted(os.listdir(raiz)):
    origen = os.path.join(raiz, carpeta)
    if not os.path.isdir(origen):
        continue
    destino = os.path.join(origen, "mini")
    for nombre in sorted(os.listdir(origen)):
        if not nombre.lower().endswith((".jpg", ".jpeg")):
            continue
        ruta = os.path.join(origen, nombre)
        salida = os.path.join(destino, os.path.splitext(nombre)[0] + ".jpg")
        if os.path.exists(salida) and os.path.getmtime(salida) >= os.path.getmtime(ruta):
            saltadas += 1
            total_kb += os.path.getsize(salida) / 1024
            continue
        os.makedirs(destino, exist_ok=True)
        img = Image.open(ruta)
        icc = img.info.get("icc_profile")
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((ANCHO_MAX, ALTO_MAX), Image.LANCZOS)
        opciones = dict(quality=CALIDAD, optimize=True, progressive=True)
        if icc:
            opciones["icc_profile"] = icc
        img.save(salida, "JPEG", **opciones)
        hechas += 1
        total_kb += os.path.getsize(salida) / 1024

print(f"Miniaturas nuevas: {hechas} · ya estaban: {saltadas} · peso total: {total_kb / 1024:.1f} MB")
sys.exit(0)
