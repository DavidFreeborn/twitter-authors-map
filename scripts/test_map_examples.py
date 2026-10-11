"""Regression for deterministic selection, missing authors and retweet fallback."""
import csv,json,subprocess,sys,tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    (root/'authors.csv').write_text('author_id\na\nb\nc\nd\n')
    rows=[
      {'author_id':'a','id':'9','type':'retweeted','processed_text':'Artificial intelligence painting software exciting digital creativity'},
      {'author_id':'a','id':'8','type':'original','processed_text':'Artists discuss software painting'},
      {'author_id':'a','id':'7','type':'original','processed_text':'Artificial intelligence transforms creative painting workflows'},
      {'author_id':'b','id':'6','type':'retweeted','processed_text':'Artificial intelligence software creates colourful images'},
      {'author_id':'c','id':'5','type':'original','processed_text':'the and of'},
      {'author_id':'outside','id':'4','type':'original','processed_text':'Unrelated author writes illustrative lengthy sentence'},
      {'author_id':'d','id':'3','type':'quoted','processed_text':'Artists discuss software painting'},
      {'author_id':'d','id':'2','type':'replied_to','processed_text':'Artificial intelligence transforms creative painting workflows'},
    ]
    (root/'posts.jsonl').write_text('\n'.join(json.dumps(r) for r in rows))
    subprocess.run([sys.executable,str(Path(__file__).with_name('build_map_examples.py')),
      '--authors',str(root/'authors.csv'),'--posts',str(root/'posts.jsonl'),'--output',str(root/'result.json')],check=True)
    result=json.loads((root/'result.json').read_text())
    assert result['n_total']==4 and result['n']==3 and result['none_available']==1
    assert result['posts']['a'][0]=='7'
    assert result['posts']['b'][2]=='retweeted'
    assert result['posts']['d'][2]=='quoted'
    assert 'outside' not in result['posts'] and 'c' not in result['posts']
print('PASS: original preference, distinct-token ranking, quote priority, labelled retweet fallback, eligibility and missing-example accounting.')
