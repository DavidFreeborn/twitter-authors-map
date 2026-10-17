const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const root=process.argv[2]||path.resolve(__dirname,'..'),elements=new Map();
function fake(){return {children:[],style:{},classList:{contains:()=>false,add(){},remove(){},toggle(){}},textContent:'',value:'',set innerHTML(v){this.children=[];},get innerHTML(){return '';},setAttribute(){},addEventListener(){},append(...els){this.children.push(...els);},appendChild(el){this.children.push(el);},replaceChildren(...els){this.children=els;}};}
const element=id=>{if(!elements.has(id)){const el=fake();el.value=id==='sentiment-select'?'net':id==='emotion-select'?'joy':'2';elements.set(id,el);}return elements.get(id);};
const context=vm.createContext({document:{addEventListener(){},getElementById:element,createElement:fake,querySelectorAll:()=>[]},window:{addEventListener(){}},Float32Array,Set,Map,Number,console});
const run=s=>vm.runInContext(s,context);
run(fs.readFileSync(path.join(root,'app.js'),'utf8'));
const data=JSON.parse(fs.readFileSync(path.join(root,'data/nodes.json'))),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const before=hash(data);context.dataset=data;
context.labelData=JSON.parse(fs.readFileSync(path.join(root,'data/community_labels.json'))).communities;
const idx=fs.readFileSync(path.join(root,'data/layout3d_indices.bin'));
context.indices=Array.from({length:idx.length/4},(_,i)=>idx.readUInt32LE(i*4));
run('nodes=dataset;communityLabels=labelData;TOPIC_NAMES=Array.from({length:12},(_,i)=>"Topic "+i);visible3D=new Float32Array(nodes.length);indices.forEach(i=>visible3D[i]=1);colors=new Float32Array(nodes.length*3);initialiseFocusControls();');
assert.deepEqual(Array.from(run('topicOrder')),[8,2,5,9,11,6,10,1,4,0,3,7],'largest-first topic order');
assert.deepEqual(element('topic-select').children.map(x=>x.value),[8,2,5,9,11,6,10,1,4,0,3,7],'membership picker uses same order');
const check=(predicate)=>{
 const mask=Array.from(run('focusMask')),selected=data.filter(predicate);
 assert.equal(run('focusTotals.count'),selected.length);
 assert.deepEqual(mask,data.map(n=>predicate(n)?1:0));return mask;
};
run("toggleGroup('topic',2,true);toggleGroup('topic',9,true)");
const retained=check(n=>[2,9].includes(n.dt));assert.equal(run('focusTotals.count'),50753);assert.equal(run('focusTotals.in3d'),49280);
for(const mode of ['community','dominant_topic','sentiment','topic_membership','emotion']){
 run("colorMode='"+mode+"';updateColors()");
 assert.deepEqual(Array.from(run('focusMask')),retained,'lens preserves exact author set');
 assert.ok(Array.from(run('colors')).every(Number.isFinite),'finite colours');
 if(['community','dominant_topic'].includes(mode)){
   const rows=element('legend').children,counts=rows.map(r=>Number(r.children[3].textContent.replaceAll(',','')));
   assert.deepEqual(counts,[...counts].sort((a,b)=>b-a),'rendered legend largest first');
   assert.equal(counts.reduce((a,b)=>a+b,0),data.length,'legend covers every author');
   assert.equal(rows.filter(r=>r.children[0].checked).length,mode==='dominant_topic'?2:0,'ticks belong to source lens');
 }
}
run("toggleGroup('community','0',true)");check(n=>n.c===0);assert.equal(run('focusKind'),'community','new categorical selection replaces old selection');
run("toggleGroup('community','4',true)");check(n=>[0,4].includes(n.c));
run("colorMode='dominant_topic';updateColors()");check(n=>[0,4].includes(n.c));
run("toggleGroup('topic',8,true)");check(n=>n.dt===8);
run("toggleGroup('topic',8,false)");check(()=>true);assert.equal(run('focusIsActive()'),false,'last untick restores all');
run("toggleGroup('community','tail',true)");check(n=>!context.labelData[String(n.c)]);
run('clearFocus()');check(()=>true);
assert.equal(hash(data),before,'No analytical values changed');
run("toggleGroup('topic',2,true)");
const calls=[];context.capture=p=>calls.push(p.focusPass);context.clearDepth=()=>calls.push('depth');
run('regl={clear:clearDepth};drawFocusedCloud(capture,{},true)');
assert.deepEqual(calls,[0,'depth',1],'selected authors draw over context in 3D');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const removed of ['focus-options','focus-rule','focus-threshold','focus-display','legend-tabs','legend-hint','colour-by'])assert.ok(!html.includes('id="'+removed+'"'),'removed UI stays absent');
assert.ok(!html.includes('More options')&&!html.includes('Focus on authors'));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,'unique DOM IDs');
console.log(JSON.stringify({status:'PASS',authors:data.length,topicOrder:Array.from(run('topicOrder')),checks:'sorted complete legends and picker; exact retained authors across all5lenses; source ticks; new-lens replacement; OR; last untick; clear; tail; unchanged data; 3Ddepth; removed controls absent'}));
