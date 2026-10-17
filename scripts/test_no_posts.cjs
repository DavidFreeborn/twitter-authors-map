const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=process.argv[2]||path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const redirect=fs.readFileSync(path.join(root,'no-posts.html'),'utf8');
assert.match(redirect,/content="0;url=anonymous\/"/);
const html=fs.readFileSync(path.join(root,'anonymous/index.html'),'utf8');
assert.match(html,/data-anonymous="true"/);
assert.equal(fs.readFileSync(path.join(root,'anonymous/app.js'),'utf8'),source);
function panel(anonymous,state){
 const elements=new Map(),requests=[];
 const context=vm.createContext({document:{currentScript:{dataset:anonymous?{anonymous:'true'}:{}},addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',classList:{remove(){}}});return elements.get(id);}},window:{addEventListener(){}},console,fetch(url){requests.push(url);return new Promise(()=>{});}});
 const run=s=>vm.runInContext(s,context);run(source);
 run("authorMetrics=new Map([['123456789012345678',[100,200,30,4,5]]]);examplePostsState="+JSON.stringify(state)+";examplePosts={'123456789012345678':['1','selection','original','PRIVATE POST TEXT']};showAuthorPanel({id:'123456789012345678',c:4,dt:2,dp:0.7,sp:0.5,sn:0.3,sg:0.2});");
 const result=elements.get('author-panel-body').innerHTML;
 run("examplePostsState='idle';loadExamplePosts()");return {result,requests};
}
for(const state of ['idle','loading','ready','failed']){
 const identified=panel(false,state),anonymous=panel(true,state);
 assert.ok(identified.result.includes('123456789012345678'));
 assert.ok(!anonymous.result.includes('123456789012345678'));
 assert.ok(!anonymous.result.includes('PRIVATE POST TEXT'));
 assert.ok(!anonymous.result.includes('Example post'));
 assert.equal(anonymous.requests.length,0);
 assert.equal(identified.requests.length,1);
 for(const label of ['Followers','Lifetime posts','Posts analysed','Retweets sent','Retweets received','Sentiment scores','Emotion scores','Dominant topic','Closest retweet connections'])assert.ok(anonymous.result.includes(label),label);
}
const originals=new Set(JSON.parse(fs.readFileSync(path.join(root,'data/nodes.json'))).map(n=>String(n.id)));
const allowed=new Set(['nodes.json','author-metrics.json','topics-8.json','build_summary.json','community_labels.json','layout3d.bin','layout3d_indices.bin','layout3d_meta.json','retweet-neighbours.json']);
function scan(value,file,trail=''){
 if(typeof value==='string')assert.ok(!originals.has(value),'Original ID in '+file+':'+trail);
 else if(Array.isArray(value))value.forEach((x,i)=>scan(x,file,trail+'.'+i));
 else if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){if(!(file==='community_labels.json'&&trail==='communities'))scan(k,file,trail);scan(v,file,trail?trail+'.'+k:k);}
}
for(const file of fs.readdirSync(path.join(root,'anonymous/data'))){assert.ok(allowed.has(file),'Unexpected anonymous asset: '+file);if(file.endsWith('.json'))scan(JSON.parse(fs.readFileSync(path.join(root,'anonymous/data',file))),file);}
console.log('PASS: legacy redirect, shared UI, anonymous author details, no post requests, no original IDs or post assets.');
