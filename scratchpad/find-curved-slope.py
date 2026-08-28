import os, struct
AEON='/home/volence/sonic_hacks/aeon'
ED=os.path.join(AEON,'games/sonic4/data/editor/ojz/act1')
COLL=os.path.join(AEON,'games/sonic4/data/collision/base')

hm=open(os.path.join(COLL,'heightmaps.bin'),'rb').read()
ang=open(os.path.join(COLL,'angles.bin'),'rb').read()
sol=open(os.path.join(COLL,'solidity.bin'),'rb').read()

def s8(b): return b-256 if b>127 else b
profiles=[]
for i in range(256):
    h=[s8(hm[i*16+c]) for c in range(16)]
    a=ang[i]
    profiles.append({'h':h,'angle':a,'hasAngle':(a&1)==0,'sol':['none','top','sides-bottom','all'][sol[i]&3]})
def is_air(p): return p['sol']=='none' and all(v==0 for v in p['h'])
solidCount=1
for i in range(255,0,-1):
    if not is_air(profiles[i]):
        solidCount=i+1; break

def deg(p):
    if not p['hasAngle']: return None
    return round(p['angle']/256*360)%360

GW=3
WIN=8   # 8x8 collision cells = 128x128 world px
out=[]
for sec in range(9):
    fp=os.path.join(ED,'section_%d.collattr.bin'%sec)
    if not os.path.exists(fp): continue
    words=struct.unpack('>65536H', open(fp,'rb').read())
    ntfp=os.path.join(ED,'section_%d.tiles.bin'%sec)
    nt=struct.unpack('>65536H', open(ntfp,'rb').read()) if os.path.exists(ntfp) else None
    shapes=[[0]*128 for _ in range(128)]
    degs=[[None]*128 for _ in range(128)]
    for cy in range(128):
        for cx in range(128):
            w=words[(2*cy)*256 + (2*cx)]
            s=w&0x3FF
            shapes[cy][cx]=s
            if 0<s<solidCount:
                degs[cy][cx]=deg(profiles[s])
    used={}
    for cy in range(128):
        for cx in range(128):
            if shapes[cy][cx]: used[shapes[cy][cx]]=used.get(shapes[cy][cx],0)+1
    for cy in range(0,128-WIN):
        for cx in range(0,128-WIN):
            angs=set(); solidn=0; nz=0
            for j in range(WIN):
                for i in range(WIN):
                    d=degs[cy+j][cx+i]
                    if shapes[cy+j][cx+i]:
                        solidn+=1
                    if d is not None:
                        angs.add(d)
                        if d!=0: nz+=1
            if len(angs)>=4 and nz>=6:
                cov=0
                if nt:
                    for j in range(WIN*2):
                        for i in range(WIN*2):
                            idx=(2*cy+j)*256 + (2*cx+i)
                            if (nt[idx]&0x7FF)!=0: cov+=1
                out.append((len(angs),nz,cov,solidn,sec,cx,cy,sorted(angs)))
out.sort(key=lambda t:(-t[0],-t[2],-t[1]))
print('solidCount',solidCount,'candidates',len(out))
seen=[]
for b in out:
    na,nz,cov,solidn,sec,cx,cy,angs=b
    # dedupe overlapping windows
    if any(s==sec and abs(x-cx)<8 and abs(y-cy)<8 for s,x,y in seen): continue
    seen.append((sec,cx,cy))
    wx=(sec%GW)*2048+cx*16; wy=(sec//GW)*2048+cy*16
    cwx=wx+WIN*16//2; cwy=wy+WIN*16//2
    print('sec=%d cell=(%d,%d) worldTL=(%d,%d) centre=(%d,%d) distinctAng=%d nz=%d solid=%d/%d artcov=%d/%d angles=%s'%(
        sec,cx,cy,wx,wy,cwx,cwy,na,nz,solidn,WIN*WIN,cov,(WIN*2)**2,angs))
    if len(seen)>=20: break
