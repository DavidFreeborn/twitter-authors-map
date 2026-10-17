// Build the anonymous viewer from the same UI source as the identified viewer.
// Run: node scripts/build-anonymous.cjs
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
const root=path.resolve(__dirname,'..'),out=path.join(root,'anonymous');
await fs.mkdir(path.join(out,'data'),{recursive:true});
const nodes=JSON.parse(await fs.readFile(path.join(root,'data/nodes.json'),'utf8'));
const ids=new Map(nodes.map(n=>[String(n.id),crypto.randomUUID()]));
const cleanNodes=nodes.map(n=>({...n,id:ids.get(String(n.id))}));
const nodeText=JSON.stringify(cleanNodes);
await fs.writeFile(path.join(out,'data/nodes.json'),nodeText);
for(const name of ['author-metrics.json','topics-8.json']){
const data=JSON.parse(await fs.readFile(path.join(root,'data',name),'utf8'));
data.ids=data.ids.map(id=>{const next=ids.get(String(id));if(!next)throw new Error('Unmatched author in '+name);return next;});
await fs.writeFile(path.join(out,'data',name),JSON.stringify(data));
}
for(const name of ['build_summary.json','community_labels.json','layout3d.bin','layout3d_indices.bin','retweet-neighbours.json']){
await fs.copyFile(path.join(root,'data',name),path.join(out,'data',name));
}
const meta=JSON.parse(await fs.readFile(path.join(root,'data/layout3d_meta.json'),'utf8'));
meta.viewer_nodes_sha256=crypto.createHash('sha256').update(nodeText).digest('hex');
meta.privacy='Author identifiers replaced with random internal keys.';
await fs.writeFile(path.join(out,'data/layout3d_meta.json'),JSON.stringify(meta));
let html=await fs.readFile(path.join(root,'index.html'),'utf8');
html=html.replace('<script src="app.js','<script data-anonymous="true" src="app.js')
.replace('placeholder="Search IDs, topics, example posts…"','placeholder="Search topics and communities…"')
.replace('aria-label="Search authors, topics and example posts"','aria-label="Search topics and communities"')
.replace('<title>','<title>Anonymous ');
await fs.writeFile(path.join(out,'index.html'),html);
for(const name of ['app.js','labels.html','METHODS.md'])await fs.copyFile(path.join(root,name),path.join(out,name));
await fs.cp(path.join(root,'vendor'),path.join(out,'vendor'),{recursive:true});
const allowed=new Set(['author-metrics.json','topics-8.json','nodes.json','build_summary.json','community_labels.json','layout3d.bin','layout3d_indices.bin','retweet-neighbours.json','layout3d_meta.json']);
for(const name of await fs.readdir(path.join(out,'data')))if(!allowed.has(name))throw new Error('Unexpected anonymous asset: '+name);
const scan=(value,file)=>{
if(typeof value==='string'&&ids.has(value))throw new Error('Original author ID in '+file);
if(Array.isArray(value))value.forEach(v=>scan(v,file));
else if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){if(!(file==='community_labels.json' && /^\d+$/.test(k)))scan(k,file);scan(v,file);}
};
for(const name of allowed)if(name.endsWith('.json'))scan(JSON.parse(await fs.readFile(path.join(out,'data',name),'utf8')),name);
console.log('Anonymous viewer rebuilt and checked: '+nodes.length+' authors; no original author IDs or post assets.');
})().catch(e=>{console.error(e);process.exitCode=1;});
