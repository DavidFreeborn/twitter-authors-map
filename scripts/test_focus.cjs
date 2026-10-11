const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const root=process.argv[2],elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='sentiment-select'?'net':id==='emotion-select'?'joy':'2',style:{},classList:{contains:()=>false},textContent:'',innerHTML:''});return elements.get(id);};
const context=vm.createContext({document:{addEventListener(){},getElementById:element,querySelectorAll:()=>[]},window:{},Float32Array,Set,Number,console});
const run=s=>vm.runInContext(s,context);
run(fs.readFileSync(path.join(root,'app.js'),'utf8'));
const data=JSON.parse(fs.readFileSync(path.join(root,'data/nodes.json'))),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const before=hash(data);context.dataset=data;
context.labelData=JSON.parse(fs.readFileSync(path.join(root,'data/community_labels.json'))).communities;
const idx=fs.readFileSync(path.join(root,'data/layout3d_indices.bin'));
context.indices=Array.from({length:idx.length/4},(_,i)=>idx.readUInt32LE(i*4));
run('nodes=dataset;communityLabels=labelData;TOPIC_NAMES=Array.from({length:12},(_,i)=>"Topic "+i);visible3D=new Float32Array(nodes.length);indices.forEach(i=>visible3D[i]=1);colors=new Float32Array(nodes.length*3);updateLegend=()=>{};');
const check=(expression,predicate)=>{
 run(expression+';applyFocus()');
 const selected=data.filter(predicate),actual=run('focusTotals.count');
 assert.equal(actual,selected.length);
 for(let i=0;i<data.length;i++)assert.equal(run('focusMask')[i],predicate(data[i])?1:0);
 return actual;
};
assert.equal(check("focusTopics=new Set([2,9]);focusRule='dominant';focusCommunity='all'",n=>[2,9].includes(n.dt)),50753);
assert.equal(run('focusTotals.in3d'),49280);
const focusBefore=Array.from(run('focusMask'));
for(const mode of ['community','dominant_topic','sentiment','topic_membership','emotion']){
 run("colorMode='"+mode+"';updateColors()");
 assert.deepEqual(Array.from(run('focusMask')),focusBefore,'lens preserves exact selection');
 assert.ok(Array.from(run('colors')).every(Number.isFinite),'finite colours');
}
check("focusCommunity='0'",n=>[2,9].includes(n.dt)&&n.c===0);
check("focusCommunity='all';focusRule='membership';focusThreshold=.3",n=>n.t2>=.3||n.t9>=.3);
check("focusThreshold=1",n=>n.t2>=1||n.t9>=1);
assert.equal(run('focusTotals.count'),0,'empty selection');
check("focusTopics=new Set();focusCommunity='tail'",n=>!context.labelData[String(n.c)]);
run('clearFocus()');assert.equal(run('focusTotals.count'),data.length);
assert.equal(run('focusIsActive()'),false);
assert.equal(hash(data),before,'No author or analytical value changed');
run("focusTopics=new Set([2]);focusRule='dominant';focusCommunity='all';applyFocus();");
const calls=[];context.capture=p=>calls.push(p.focusPass);context.clearDepth=()=>calls.push('depth');
run('regl={clear:clearDepth};focusDisplay="dim";drawFocusedCloud(capture,{},true)');
assert.deepEqual(calls,[0,'depth',1],'context first, then depth clear and selected authors');
calls.length=0;run('focusDisplay="hide";drawFocusedCloud(capture,{},false)');assert.deepEqual(calls,[1]);
calls.length=0;run('focusTopics.clear();drawFocusedCloud(capture,{},true)');assert.deepEqual(calls,[-1]);
const start=performance.now();for(let i=0;i<10;i++)run('focusTopics=new Set([2,9]);focusRule="membership";focusThreshold=.3;applyFocus()');
console.log(JSON.stringify({status:'PASS',authors:data.length,selectionOR:50753,in3D:49280,meanMaskRecomputeMs:(performance.now()-start)/10,checks:'OR, AND, thresholds, empty, tail, clear, all five lenses, immutable data, depth-pass isolation'}));

