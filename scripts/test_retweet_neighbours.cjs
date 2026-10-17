const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.argv[2]||path.resolve(__dirname,'..');
const nodes=JSON.parse(fs.readFileSync(path.join(root,'data/nodes.json')));
const data=JSON.parse(fs.readFileSync(path.join(root,'data/retweet-neighbours.json')));
assert.equal(data.rows.length,nodes.length);assert.equal(data.nodeCount,nodes.length);assert.equal(data.matched_directed_edges,782974);
let empty=0,short=0;
for(const[rowIndex,row]of data.rows.entries()){
 assert.ok(row.length<=50);const seen=new Set();let previous=Infinity;
 for(const[index,weight]of row){assert.ok(Number.isInteger(index)&&index>=0&&index<nodes.length&&index!==rowIndex);assert.ok(Number.isFinite(weight)&&weight>0&&weight<=previous);assert.ok(!seen.has(index));seen.add(index);previous=weight;}
 if(!row.length)empty++;if(row.length<10)short++;
}
assert.equal(fs.readFileSync(path.join(root,'anonymous/data/retweet-neighbours.json'),'utf8'),fs.readFileSync(path.join(root,'data/retweet-neighbours.json'),'utf8'));
console.log(JSON.stringify({status:'PASS',authors:nodes.length,empty,fewerThan10:short,checks:'valid indices, unique neighbours, no self links, descending positive weights, identical anonymous rankings'}));
