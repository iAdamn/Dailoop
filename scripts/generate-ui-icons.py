"""Build Dailoop's four original vector symbols as a tiny offline font.

Tooling only: python -m pip install fonttools --target output/tooling/icon-font
Then: python scripts/generate-ui-icons.py
No font package or extra native renderer is added to the application.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'output/tooling/icon-font'))
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

# Original outlines on a 24-unit canvas. Winding cuts out the home/bell/folder
# interiors; the flame has a broad, quiet silhouette for the overlaid count.
PATHS = {
    'home': 'M2.5 11 L11.4 2.8 Q12 2.2 12.6 2.8 L21.5 11 L20.3 12.3 L19.2 11.3 V20.1 Q19.2 21 18.3 21 H14 V15.5 H10 V21 H5.7 Q4.8 21 4.8 20.1 V11.3 L3.7 12.3 Z M6.5 9.7 V19.3 H8.3 V14.6 Q8.3 13.8 9.1 13.8 H14.9 Q15.7 13.8 15.7 14.6 V19.3 H17.5 V9.7 L12 4.7 Z',
    'bell': 'M12 2.5 C15.5 2.5 18 5.2 18 8.7 V13.8 L20 17 V18 H4 V17 L6 13.8 V8.7 C6 5.2 8.5 2.5 12 2.5 Z M7.8 8.7 V14.3 L6.6 16.2 H17.4 L16.2 14.3 V8.7 C16.2 6.1 14.4 4.3 12 4.3 C9.6 4.3 7.8 6.1 7.8 8.7 Z M11.2 1 H12.8 V3.2 H11.2 Z M9.7 19.5 Q10 22 12 22 Q14 22 14.3 19.5 H12.6 Q12.3 20.5 12 20.5 Q11.7 20.5 11.4 19.5 Z',
    'folder': 'M3 4 H9 L11 6 H21 Q22 6 22 7 V19 Q22 20 21 20 H3 Q2 20 2 19 V5 Q2 4 3 4 Z M3.8 8 V18.2 H20.2 V7.8 H10.3 L8.3 5.8 H3.8 Z',
    'flame': 'M12 1 C13 5 18 5 18.5 10 C20 8 20.5 7 20.8 6 C23 10 23.5 14 22 18 C20.5 22 17 24 12 24 C5.5 24 2 19 3 14 C3.5 11 5 9 7 7 C6.8 11 8.5 12 9.5 10 C12 7 10 4 12 1 Z',
}

glyphs = {'.notdef': TTGlyphPen(None).glyph(), 'space': TTGlyphPen(None).glyph()}
for name, path in PATHS.items():
    pen = TTGlyphPen(None)
    parse_path(path, TransformPen(Cu2QuPen(pen, max_err=0.5), (1000 / 24, 0, 0, -1000 / 24, 0, 1000)))
    glyphs[name] = pen.glyph()
order = list(glyphs)
font = FontBuilder(1000, isTTF=True)
font.setupGlyphOrder(order)
font.setupCharacterMap({32: 'space', **{0xE001 + i: name for i, name in enumerate(PATHS)}})
font.setupGlyf(glyphs)
font.setupHorizontalMetrics({name: (1000, getattr(glyph, 'xMin', 0)) for name, glyph in glyphs.items()})
font.setupHorizontalHeader(ascent=1000, descent=0)
font.setupNameTable({'familyName': 'Dailoop Symbols', 'styleName': 'Regular', 'uniqueFontIdentifier': 'DailoopSymbols-1', 'fullName': 'Dailoop Symbols', 'psName': 'DailoopSymbols', 'version': 'Version 1.0', 'copyright': 'Original Dailoop outlines. MIT License.'})
font.setupOS2(sTypoAscender=1000, sTypoDescender=0, usWinAscent=1000, usWinDescent=0)
font.setupPost()
# Stable timestamps make regeneration byte-for-byte reproducible.
font.font['head'].created = font.font['head'].modified = 3864326400
font.font.recalcTimestamp = False
destination = ROOT / 'assets/icons/DailoopSymbols.ttf'
destination.parent.mkdir(parents=True, exist_ok=True)
font.save(destination)
print(f'{destination.name}: {destination.stat().st_size} bytes; four original vector symbols')
