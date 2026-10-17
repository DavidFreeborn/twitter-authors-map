const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const root=process.argv[2]||path.resolve(__dirname,'..'),elements=new Map();
function fake(){return {children:[],style:{},classList:{toggle(){},remove(){},contains:()=>false},textContent:'',value:'',set innerHTML(v){this.children=[];this.html=v;},get innerHTML(){return this.html||'';},setAttribute(){},addEventListener(){},append(...els){this.children.push(...els);},appendChild(el){this.children.push(el);},replaceChildren(...els){this.children=els;this.value=String(els[0]?.value??'');}};}
function element(id){if(!elements.has(id))elements.set(id,fake());return elements.get(id);}
const data=JSON.parse(fs.readFileSync(path.join(root,'data/nodes.json')));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex'),before=hash(data);
let fail=false;
const context=vm.createContext({document:{addEventListener(){},getElementById:element,createElement:fake,querySelectorAll:()=>[]},window:{addEventListener(){}},Float32Array,Set,Map,Number,console:{log(){},error(){}},fetch:async url=>{if(fail)throw new Error('simulated offline');return {ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,url.split('?')[0])))}}});
const run=s=>vm.runInContext(s,context);run(fs.readFileSync(path.join(root,'app.js'),'utf8'));
context.dataset=data;context.summaryData=JSON.parse(fs.readFileSync(path.join(root,'data/build_summary.json')));context.labelData=JSON.parse(fs.readFileSync(path.join(root,'data/community_labels.json'))).communities;
run('nodes=dataset;summary=summaryData;TOPIC_NAMES=summary.topic_labels;communityLabels=labelData;nodeIndexById=new Map(nodes.map((n,i)=>[n.id,i]));colors=new Float32Array(nodes.length*3);initialiseFocusControls();');
element('sentiment-select').value='net';element('emotion-select').value='joy';element('measure-select').value='followers';
(async()=>{
  run("toggleGroup('topic',2,true);toggleGroup('topic',9,true)");const mask=Array.from(run('focusMask'));
  element('topic-model-select').value='8';fail=true;await run('changeTopicModel()');assert.equal(run('activeTopicModel'),'12');assert.deepEqual(Array.from(run('focusMask')),mask);assert.equal(element('topic-model-select').disabled,false);
  fail=false;element('topic-model-select').value='8';await run('changeTopicModel()');assert.equal(run('activeTopicModel'),'8');assert.equal(run('TOPIC_NAMES.length'),8);assert.deepEqual(Array.from(run('focusMask')),mask,'model switches retain exact selection');
  assert.equal(run('topicSizes.reduce((a,b)=>a+b,0)'),data.length);
  assert.deepEqual(Array.from(run('topicSizes')),[8576,11671,6178,2845,5303,29850,93585,6283]);
  run("colorMode='dominant_topic';updateColors()");assert.equal(element('legend').children.filter(r=>r.children[0].checked).length,0,'no misleading ticks in another model');
  run("toggleGroup('topic',7,true)");const selected=Array.from(run('focusMask'));assert.equal(run('focusTotals.count'),6283);assert.equal(run('focusModel'),'8');
  element('topic-model-select').value='12';await run('changeTopicModel()');assert.deepEqual(Array.from(run('focusMask')),selected);
  run("toggleGroup('topic',2,true)");assert.equal(run('focusTotals.count'),39681);assert.equal(run('focusModel'),'12');
  assert.equal(run('Object.keys(MEASURES).length'),5);
  assert.ok(!fs.readFileSync(path.join(root,'index.html'),'utf8').includes('value="concentration"'));
  assert.equal(element('topic-model-status').hidden,true,'no persistent success text');
  await run('loadAuthorMetrics()');assert.equal(run('authorMetrics.size'),data.length);
  assert.equal(run("nodes.every(n=>measureValue(n,'retweets_sent')+measureValue(n,'retweets_received')===n[F.fullDegree])"),true,'directions sum exactly to old weighted degree');
  for(const key of ['followers','lifetime_posts','analysed_posts','retweets_sent','retweets_received']){
    element('measure-select').value=key;run("colorMode='author_measure';updateColors()");assert.ok(Array.from(run('colors')).every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert.equal(run('focusTotals.count'),39681);
  }
  context.badPayload={ids:[data[0].id],values:[[1,2,3]]};assert.throws(()=>run('alignLens(badPayload,3)'),/mismatch/);
  run('showAuthorPanel(nodes[0])');assert.ok(element('author-panel-body').innerHTML.includes('Followers (when recorded)'));assert.ok(element('author-panel-body').innerHTML.includes('12 topics'));
  assert.equal(hash(data),before,'all original author values immutable');
  console.log('PASS: 164,291 IDs, 8/12 topic switching, exact selection retention/replacement, all five numeric measures, offline rollback/retry, details and immutable original data.');
})().catch(e=>{console.error(e);process.exitCode=1});
