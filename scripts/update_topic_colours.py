"""Apply David's strict >60% dominant-author overlap colour rule.

Overlap is intersection / alternative-topic authors, not Jaccard or the
fraction of the reference topic. Multiple groups may inherit one colour.
Run from any directory; this changes colours/metadata only, never scores.
"""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def match_colours(ids, values, reference, reference_colours, distinct_colours):
    if len(ids) != len(values) or len(set(ids)) != len(ids) or set(ids) != set(reference):
        raise ValueError('Topic populations must match exactly by author ID')
    counts = [Counter() for _ in distinct_colours]
    for aid, weights in zip(ids, values):
        counts[max(range(len(weights)), key=weights.__getitem__)][reference[aid]] += 1
    colours, matches = [], []
    for topic, overlap in enumerate(counts):
        target, shared = overlap.most_common(1)[0] if overlap else (None, 0)
        total = sum(overlap.values())
        inherit = total > 0 and shared * 5 > total * 3  # Strictly >60%; no rounding.
        colour = reference_colours[target] if inherit else distinct_colours[topic]
        colours.append(colour)
        matches.append(dict(topic=topic, authors=total, reference_topic=target,
                            shared_authors=shared, overlap_fraction=shared/total if total else None,
                            inherited=inherit, colour=colour, cross_counts=dict(overlap)))
    return colours, matches


if __name__ == '__main__':
    data = ROOT/'data'
    nodes = json.loads((data/'nodes.json').read_text())
    summary = json.loads((data/'build_summary.json').read_text())
    path = data/'topics-8.json'
    topics = json.loads(path.read_text())
    # High-contrast hues for groups that do not meet the inheritance threshold.
    distinct = ['#b58cff', '#b58cff', '#ff63be', '#f5f3e9', '#35b9ff', '#ff6d3a', '#55dc7a', '#35b9ff']
    colours, matches = match_colours(topics['ids'], topics['values'],
                                    {n['id']: n['dt'] for n in nodes},
                                    summary['topic_colours'], distinct)
    topics['colours'] = colours
    topics['metadata']['colour_matching'] = {
        'rule': 'More than 60% of the alternative dominant-topic group share one dominant topic in the 12-topic default.',
        'denominator': 'Authors whose highest-weighted topic is the alternative topic',
        'threshold': .60, 'comparison': 'strictly greater than', 'reference_K': 12,
        'multiple_inheritance': 'Allowed; matching groups can deliberately share a colour.',
        'matches': matches}
    path.write_text(json.dumps(topics, separators=(',', ':')), encoding='utf-8')
    for m in matches:
        print(f"{topics['labels'][m['topic']]}: {m['overlap_fraction']:.4%}, {m['colour']}, inherited={m['inherited']}")
