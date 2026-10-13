import json
from pathlib import Path
from update_topic_colours import match_colours

# The threshold is strict, directional, and evaluated before rounding.
ids = ['a', 'b', 'c', 'd', 'e']
rows = [[1, 0]] * 5
colours, matches = match_colours(ids, rows, dict(a=0,b=0,c=0,d=1,e=1), ['blue','orange'], ['green','pink'])
assert colours[0] == 'green' and matches[0]['overlap_fraction'] == .60
colours, matches = match_colours(ids, rows, dict(a=0,b=0,c=0,d=0,e=1), ['blue','orange'], ['green','pink'])
assert colours[0] == 'blue'
colours, matches = match_colours(ids[:4], [[1,0],[1,0],[0,1],[0,1]], dict.fromkeys(ids[:4],0), ['blue'], ['green','pink'])
assert colours == ['blue','blue']  # Shared inheritance is intentional.

root=Path(__file__).resolve().parents[1]
t=json.loads((root/'data/topics-8.json').read_text())
summary=json.loads((root/'data/build_summary.json').read_text())
matches=t['metadata']['colour_matching']['matches']
assert [m['topic'] for m in matches if m['inherited']] == [1,2,4,5,7]
for m in matches:
 assert m['inherited'] == (m['shared_authors']*5 > m['authors']*3)
 if m['inherited']:assert t['colours'][m['topic']] == summary['topic_colours'][m['reference_topic']]
assert len(set(t['colours'])) == 7
print('PASS: strict 60% boundary, direction, shared inheritance, exact reference colours, seven distinct colours.')
