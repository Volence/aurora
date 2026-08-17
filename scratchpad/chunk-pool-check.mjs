import * as fs from 'node:fs'; import * as path from 'node:path'; import * as os from 'node:os';
import { build } from 'esbuild';
const REPO='/home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan6';
const entry=`export { s1Adapter } from ${JSON.stringify(path.join(REPO,'src/core/project/s1/index.ts'))};`;
const outfile=path.join(os.tmpdir(),`chk-${process.pid}.mjs`);
await build({stdin:{contents:entry,resolveDir:REPO,sourcefile:'e.ts',loader:'ts'},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent'});
const {s1Adapter}=await import(`file://${outfile}`); fs.rmSync(outfile,{force:true});
const root='/home/volence/sonic_hacks/s1disasm';
const fa={async exists(r){return fs.existsSync(path.join(root,r))},async read(r){return new Uint8Array(fs.readFileSync(path.join(root,r)))},async list(r){return fs.readdirSync(path.join(root,r))}};
const h=await s1Adapter.open(fa); const seen=new Set();
for(const ref of h.levels.list().filter(r=>r.available)){ if(seen.has(ref.zone))continue; seen.add(ref.zone);
  const d=await h.levels.read(ref);
  console.log(ref.zone, 'chunks='+d.chunks.length, 'blocks='+d.blocks.length, '|', d.sourceRefs.chunks ?? JSON.stringify(Object.entries(d.sourceRefs).filter(([k])=>/chunk|256/i.test(k))));
}
