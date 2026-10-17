// node scripts/build-retweet-neighbours.cjs PATH_TO_RETWEETEDONCE_GML
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
const root=path.resolve(__dirname,'..'),input=process.argv[2];
if(!input)throw new Error('Pass the RetweetedOnce GML file.');
const text=await fs.readFile(input,'utf8'),nodes=JSON.parse(await fs.readFile(path.join(root,'data/nodes.json'),'utf8'));
const graphIds=new Map(),indices=new Map(nodes.map((n,i)=>[n.id,i]));
for(const m of text.matchAll(/\bnode\s*\[\s*id\s+(\d+)\s+label\s+"([^"]+)"/g))graphIds.set(+m[1],m[2]);
const neighbours=nodes.map(()=>new Map());let edges=0;
for(const m of text.matchAll(/\bedge\s*\[\s*source\s+(\d+)\s+target\s+(\d+)\s+weight\s+([\d.eE+-]+)\s*\]/g)){
 const a=indices.get(graphIds.get(+m[1])),b=indices.get(graphIds.get(+m[2])),w=+m[3];
 if(a===undefined||b===undefined)continue;
 if(!Number.isFinite(w)||w<=0)throw new Error('Invalid edge weight');
 edges++;if(a===b)continue;
 neighbours[a].set(b,(neighbours[a].get(b)||0)+w);
 neighbours[b].set(a,(neighbours[b].get(a)||0)+w);
}
if(graphIds.size!==202710||nodes.length!==164291||edges!==782974)throw new Error('Graph does not match the current atlas cohort.');
const rows=neighbours.map(n=>[...n].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,50));
for(let i=0;i<rows.length;i++)for(const[j,w]of rows[i]){
 if(i===j||neighbours[j].get(i)!==w)throw new Error('Invalid reciprocal connection');
}
const data={version:1,nodeCount:nodes.length,metric:'sum of retweets in both directions',limit:50,graph_sha256:crypto.createHash('sha256').update(text).digest('hex'),matched_directed_edges:edges,rows};
await fs.writeFile(path.join(root,'data/retweet-neighbours.json'),JSON.stringify(data));
console.log(JSON.stringify({authors:nodes.length,matchedEdges:edges,withoutConnections:rows.filter(r=>!r.length).length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
