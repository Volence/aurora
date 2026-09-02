import os, struct, sys
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
from suite_paths import sibling_path   # the suite's 4-step precedence, one derivation
AEON=str(sibling_path('aeon'))
ED=os.path.join(AEON,'games/sonic4/data/editor/ojz/act1')
COLL=os.path.join(AEON,'games/sonic4/data/collision/base')
hm=open(os.path.join(COLL,'heightmaps.bin'),'rb').read()
ang=open(os.path.join(COLL,'angles.bin'),'rb').read()
def s8(b): return b-256 if b>127 else b
def deg(i):
    a=ang[i]
    return None if (a&1) else round(a/256*360)%360

sec=int(sys.argv[1]); cx0=int(sys.argv[2]); cy0=int(sys.argv[3]); W=int(sys.argv[4]); H=int(sys.argv[5])
words=struct.unpack('>65536H', open(os.path.join(ED,'section_%d.collattr.bin'%sec),'rb').read())
nt=struct.unpack('>65536H', open(os.path.join(ED,'section_%d.tiles.bin'%sec),'rb').read())
print('shape ids (16px cells), row = cy')
for cy in range(cy0,cy0+H):
    row=[]
    for cx in range(cx0,cx0+W):
        w=words[(2*cy)*256+(2*cx)]
        s=w&0x3FF
        row.append('%4d'%s if s else '   .')
    print('cy=%3d '%cy + ''.join(row))
print()
print('angles (deg), . = air, x = no-angle')
for cy in range(cy0,cy0+H):
    row=[]
    for cx in range(cx0,cx0+W):
        w=words[(2*cy)*256+(2*cx)]
        s=w&0x3FF
        if not s: row.append('   .')
        else:
            d=deg(s)
            row.append('   x' if d is None else '%4d'%d)
    print('cy=%3d '%cy + ''.join(row))
print()
print('flips/solidity  (X=xflip Y=yflip, digit=solidity)')
for cy in range(cy0,cy0+H):
    row=[]
    for cx in range(cx0,cx0+W):
        w=words[(2*cy)*256+(2*cx)]
        s=w&0x3FF
        if not s: row.append('   .')
        else:
            row.append(' %s%s%d'%('X' if w&0x400 else '-','Y' if w&0x800 else '-',(w>>12)&3))
    print('cy=%3d '%cy + ''.join(row))
print()
print('art nonzero per 16px cell (of 4 tiles)')
for cy in range(cy0,cy0+H):
    row=[]
    for cx in range(cx0,cx0+W):
        n=0
        for ty in range(2):
            for tx in range(2):
                if nt[(2*cy+ty)*256+(2*cx+tx)]&0x7FF: n+=1
        row.append('%4d'%n)
    print('cy=%3d '%cy + ''.join(row))
