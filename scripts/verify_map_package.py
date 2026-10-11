"""Validate the complete release package without modifying data."""
import hashlib,json,math,re,sys
from pathlib import Path
from array import array
root=Path(sys.argv[1]); data=root/'data'
nodes=json.loads((data/'nodes.json').read_text(encoding='utf-8'))
s=json.loads((data/'build_summary.json').read_text(encoding='utf-8'))
labels=json.loads((data/'community_labels.json').read_text(encoding='utf-8'))
meta=json.loads((data/'layout3d_meta.json').read_text(encoding='utf-8'))
examples=json.loads((data/'representative_posts.json').read_text(encoding='utf-8'))
ids={n['id'] for n in nodes}
assert len(nodes)==len(ids)==s['matched_authors']==164291
assert all(isinstance(i,str) and i.isdigit() for i in ids)
assert set(examples['posts']) <= ids
assert examples['n_total']==len(nodes)
assert examples['n']==len(examples['posts'])
assert examples['n']+examples['none_available']==len(nodes)
assert all(len(r)==4 and r[0].isdigit() and r[3].strip() and len(r[3])<=280 for r in examples['posts'].values())
assert len(s['topic_labels'])==8
for n in nodes:
    assert all(math.isfinite(n[k]) for k in ['x','y','sp','sn','sg']+[f't{i}' for i in range(8)])
    assert abs(sum(n[f't{i}'] for i in range(8))-1)<1e-4
    assert 0 <= n['dt'] < 8
counts={}
for n in nodes: counts[str(n['c'])]=counts.get(str(n['c']),0)+1
for k,r in labels['communities'].items(): assert r['n_authors']==counts[k]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(data/'nodes.json')==meta['viewer_nodes_sha256']
assert sha(data/'layout3d.bin')==meta['coordinates']['sha256']
assert sha(data/'layout3d_indices.bin')==meta['render_indices']['sha256']
coords=array('f');coords.frombytes((data/'layout3d.bin').read_bytes())
indices=array('I');indices.frombytes((data/'layout3d_indices.bin').read_bytes())
assert len(coords)==len(nodes)*3 and all(math.isfinite(x) for x in coords)
assert len(indices)==len(set(indices))==meta['rendered_node_count']==161035
assert max(indices)<len(nodes)
for html in [root/'index.html',root/'labels.html']:
    for link in re.findall(r'(?:href|src)="([^"]+)"',html.read_text(encoding='utf-8')):
        if link.startswith(('http:','https:','data:','#')): continue
        assert (root/link.split('?')[0]).exists(),link
print(json.dumps({'authors':len(nodes),'3d_authors':len(indices),'topics':len(s['topic_labels']),
 'examples':examples['n'],'no_informative_example':examples['none_available'],
 'checks':'Exact IDs; numeric fields; topic sums; community sizes; coordinates and indices hashes; complete links; example coverage and excerpts.'},indent=2))
