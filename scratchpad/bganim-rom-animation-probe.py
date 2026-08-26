import socket, json, sys, itertools
SOCK="/run/user/1000/aurora-band.sock"
DOC=sys.argv[1]
s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); s.connect(SOCK)
f=s.makefile("rwb"); _id=itertools.count(1)
def call(m,p=None,notify=False):
    msg={"jsonrpc":"2.0","method":m}
    if p is not None: msg["params"]=p
    if not notify: msg["id"]=next(_id)
    f.write((json.dumps(msg)+"\n").encode()); f.flush()
    if notify: return None
    while True:
        line=f.readline()
        if not line: raise SystemExit("server closed")
        r=json.loads(line)
        if "id" in r: 
            if "error" in r: raise SystemExit(f"{m} -> {r['error']}")
            return r["result"]
init=call("initialize",{"clientCapabilities":{"events":True}})
call("initialized",{},notify=True)
print(f"[handshake] {init.get('serverName')} {len(init.get('methods',[]))} methods")

# the 8 authored banks, packed from row-major NIBBLES to 4bpp bytes (the documented trap)
doc=json.load(open(DOC))
band=doc["anims"][0] if "anims" in doc else doc["bands"][0]
phases=band["phases"]
def pack(tile): return bytes(((tile[i]&0xF)<<4)|(tile[i+1]&0xF) for i in range(0,len(tile),2))
banks=[b"".join(pack(t) for t in ph) for ph in phases]
print(f"[doc] {len(banks)} banks x {len(banks[0])} B; distinct banks = {len(set(banks))}")
if len(set(banks))==1: raise SystemExit("VACUOUS: all banks identical")

BASE=0x8000; N=len(banks[0])
def vram(addr,n):
    out=b""
    while n>0:
        k=min(4096,n)
        out+=bytes.fromhex(call("emulator/read_vram",{"addr":hex(addr+len(out)),"len":k})["bytes"][2:])
        n-=k
    return out
# locate the band: it must equal one of the banks somewhere; try BASE first
call("emulator/run_frames",{"frames":120})
cur=vram(BASE,N)
if cur not in banks:
    print(f"[locate] VRAM 0x{BASE:04X} matches no bank; searching VRAM for bank art...")
    whole=vram(0,0x10000); found=[hex(whole.find(b)) for b in banks if whole.find(b)>=0]
    print(f"[locate] banks found at: {found or 'NOWHERE'}")
    raise SystemExit("band art not at the expected base — reporting rather than guessing")
seen=[]
for i in range(24):
    cur=vram(BASE,N)
    idx=[j for j,b in enumerate(banks) if b==cur]
    st=call("emulator/status")
    seen.append(idx[0] if idx else None)
    print(f"  frame {st['frame']:6d}  bank={idx[0] if idx else 'NO-MATCH'}")
    call("emulator/run_frames",{"frames":8})
uniq=sorted({x for x in seen if x is not None})
print(f"\n[result] samples={len(seen)} no-match={seen.count(None)} distinct banks visited={uniq}")
print("[verdict] ANIMATES" if len(uniq)>1 and seen.count(None)==0 else "[verdict] NOT ANIMATING / unmatched")
