import socket, json, sys, itertools, subprocess, os, time, tempfile
# PATHS ARE ARGUMENTS, NOT LITERALS. The rig ROM lives in a THROWAWAY copy that is
# deleted when the measurement is done, so a committed literal would point at
# something that does not exist; and a sibling path in an executable line is what
# `check-peer-path-literals.mjs` refuses. The paths this run actually used are
# recorded as provenance in docs/reviews/2026-09-06-vertical-watched.md, which is
# a comment-tier record the gate exempts for exactly that reason.
#   usage: vertical-watched-drive.py <out.json> <rom> <oracle-aether binary>
OUT, ROM, BIN = sys.argv[1], sys.argv[2], sys.argv[3]
d=tempfile.mkdtemp(prefix="/tmp/vrig-")           # short path: SUN_LEN
sock=os.path.join(d,"o.sock")
p=subprocess.Popen([BIN,ROM,"--socket",sock],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
for _ in range(100):
    if os.path.exists(sock): break
    time.sleep(0.1)
else:
    sys.exit("server never created "+sock)
s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); s.connect(sock)
f=s.makefile("rwb"); _id=itertools.count(1)
def call(m,par=None,notify=False):
    msg={"jsonrpc":"2.0","method":m}
    if par is not None: msg["params"]=par
    if not notify: msg["id"]=next(_id)
    f.write((json.dumps(msg)+"\n").encode()); f.flush()
    if notify: return
    while True:
        r=json.loads(f.readline())
        if "id" in r:
            if "error" in r: raise SystemExit(f"{m} -> {r['error']}")
            return r["result"]
init=call("initialize",{"clientCapabilities":{"events":True}})
call("initialized",{},notify=True)
print("impl:",init.get("implementation"),"build:",init.get("serverBuild"),"methods:",len(init.get("methods",[])))
print("romPath:",call("emulator/status").get("romPath"))
def mem(a,n): return bytes.fromhex(call("emulator/read_memory",{"addr":a,"len":n})["bytes"][2:])
def vram(a,n): return bytes.fromhex(call("emulator/read_vram",{"addr":a,"len":n})["bytes"][2:])
def run(n): call("emulator/run_frames",{"frames":n})
run(600)
cam=mem("0xFFA730",4); vs=mem("0xFF88EA",2)
print("Camera_Y hi:",int.from_bytes(cam[0:2],'big'),"vscrollBG:",int.from_bytes(vs,'big'))
for addr in ("0xE000","0xE080","0xE100"):
    print("nametable",addr,vram(addr,16).hex())
call("emulator/press",{"buttons":["start"]}); run(3)
call("emulator/press",{"buttons":["start","c"]}); run(2)
call("emulator/release_all",{}); run(3)
ptr=mem("0xFFE91A",4)
print("BgAnim_Table_Ptr: 0x"+ptr.hex())
caps=[]
for i in range(4):
    run(40)
    step=int.from_bytes(mem("0xFF8F06",2),'big')
    caps.append({"label":f"cap{i+1}","step":step,
                 "band_hex":vram("0x8000",2048).hex(),"control_hex":vram("0x8800",32).hex()})
    print("capture",i+1,"step",step)
json.dump(caps,open(OUT,"w"))
p.terminate()
print("wrote",OUT)
