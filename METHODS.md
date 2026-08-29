# Methods

## Network and displayed authors

The map contains all 198,326 authors that have both a saved network position and
topic, sentiment and emotion annotations. The full directed network contains
1,984,599 authors and 4,472,376 retweet, reply and quote connections. The
accepted 2D positions were calculated with igraph's Distributed Recursive
Layout (DrL) from the 853,133 weighted, directed connections whose endpoints
are both in the displayed subset.

The accepted two-dimensional coordinates in `data/nodes.json` remain fixed and
are the default view. The optional three-dimensional view is a
structure-preserving network layout for the largest weakly connected component,
stored in `data/layout3d.bin`. Topic, sentiment, emotion, label text, community
membership and author identity metadata do not affect either layout.

## Three-dimensional projection

The 3D view is a layout, not a new analytical clustering. Leiden, Louvain,
Infomap, HDBSCAN, UMAP, topic modelling, sentiment inference and emotion
inference are not run. Its depth comes from a fixed native Graphviz `sfdp`
14.1.3 three-dimensional multilevel spring-electrical fit of the largest weak
component: 187,095 authors and 837,811 unique undirected edges, with seed 42.
The high-precision coordinates were read directly from Graphviz's internal
double arrays before conversion to float32.

The native free 3D equilibrium did not reproduce the accepted 2D map's long
arms and open gaps. This was not a WebGL error. First, the accepted 2D map is a
weighted, directed igraph DrL fit, while native `sfdp` uses a different,
unweighted spring-electrical objective. DrL's late edge-cutting phase favours
separation of highly stressed regions. Second, a third dimension lets branches
pass and fold around one another instead of competing for planar space. The
native 3D community centroids were not globally closer, but local community
mixing was substantially higher and many large communities were rounder. These
effects made a structurally separated graph look like a compact lobe when
projected onto the screen.

The reviewed view therefore uses the accepted 2D geometry as an explicit macro
constraint rather than claiming that a free 3D equilibrium should look the
same. Let `d*` be accepted DrL x/y minus native `sfdp` x/y. A smooth displacement
`d` is obtained from `(I + λL)d = d*`, where `L` is the unnormalised Laplacian of
the existing undirected graph with summed weights transformed by `log1p`, and
`λ = 0.10`. The field is scaled to 80% of the target displacement's RMS and
added to native x/y. Native `sfdp` z is retained unchanged. This restores the
measured macro structure while penalising abrupt changes across observed edges.
No community labels, content values or author attributes enter the equation.

After the constraint, pair-distance rank correlation with accepted 2D rises
from 0.604 to 0.950. On the final 15-neighbour audit, same-community proximity
is 0.702, compared with 0.620 in native `sfdp`; this is descriptive validation,
not a label-based force. The layout remains materially three-dimensional: its
whole-layout covariance ratios are 1.000, 0.865 and 0.281, with a central-95%
third ratio of 0.288 and a robust third-axis extent ratio of 0.578.

The occasional circular or elliptical patches in native `sfdp` were also real
coordinate features, not circular point sprites. Equal-axis local audits traced
them mainly to sparse hub-and-spoke or fan motifs: the hub constrains neighbour
radius, but neighbours have few mutual edges, so the force objective does not
uniquely determine their angular or out-of-plane arrangement. Multilevel
prolongation can preserve a shallow local sheet through refinement. In a fixed
5,000-node 30-neighbour audit, strongly sheet-like local neighbourhoods fell
from 8.24% to 0.60%, and disk-like neighbourhoods fell from 7.02% to 0.12%.
Some low-dimensional motifs can remain because the graph itself underdetermines
their 3D shape; injecting arbitrary jitter to eliminate every case was rejected.

The graph has 10,288 weak components, including 9,627 isolates. Only the giant
component (187,095 authors; 94.3%) is rendered in 3D because disconnected
components have no graph-defined position relative to it. All 198,326 authors
remain present in the unchanged 2D view, search data and analytical files. The
3D coordinate payload retains zero rows for non-rendered authors to preserve
viewer indexing, while `data/layout3d_indices.bin` records the exact giant-
component indices.

Equal-axis diagnostic renders were used throughout. Earlier direct DrL,
Fruchterman-Reingold, UMAP, hierarchical packing and pointwise extrusion
candidates were rejected because they produced planes, spheres, disks,
cylinders, artificial packing or weak structural continuity. The focused shape
diagnosis is recorded in `LAYOUT_SHAPE_AUDIT.md`.

Graph fidelity was checked on 150,000 observed edges and degree-matched
non-edges. Their median distances are 0.0758 and 0.5101 respectively; the
observed edge is shorter in 90.9% of paired comparisons. Among 6,000 sampled
authors, observed edges are 184.5 times more common among the 15 nearest layout
neighbours than in the graph overall. Full metrics and thresholds are stored in
`data/layout3d_evaluation.json`.

The coordinate payload contains 198,326 interleaved little-endian float32 x/y/z
triples in viewer-node order. Non-rendered rows are zero, and
`data/layout3d_indices.bin` lists the rendered indices. Edges affect the force
calculation but are not drawn in the browser: showing only a selected subset was
visually misleading, while showing all 837,811 undirected edges would obscure the
point cloud.

Axes, handedness, origin and absolute scale have no substantive meaning. Local
proximity is descriptive of the layout, not a statistical effect size. No
coordinate is a measured author attribute.

## WebGL rendering and interaction

The existing regl renderer retains a separate 2D shader and interaction path.
The 3D path uses a perspective camera, damped orbit/pan/dolly controls,
depth-aware point sizing and restrained distance fog. Point colours, sizes,
legends and author details come from the same stored values in both views.

Three-dimensional hover and clicking use an off-screen WebGL identification
pass. Each rendered point is drawn with a unique 24-bit integer colour into a
depth-tested framebuffer, then the single pointer pixel is read back. This
avoids projecting and scanning 187,095 authors on every mouse movement and
ensures that the nearest visible point is selected. No identification colour is
shown in the visible map.

## Communities and descriptive labels

Community IDs are the existing Leiden-directed assignments. No community was
rerun, merged, split or renumbered. Descriptive labels cover the 21 largest
communities (188,765 authors; 95.2% of displayed authors).

Labels were interpreted from class-based TF-IDF over 1,190,280 seeded,
de-duplicated sampled posts written by matched authors. URLs, mentions,
punctuation, English stop words and Twitter boilerplate were removed; hashtag
and cashtag text was retained. The source contains original, quote and reply
posts but no pure retweets. Confidence, review status and lexical evidence are
recorded for each label. Low-confidence provisional communities remain broad, and the
925 long-tail communities retain numeric IDs without invented labels.

Every label describes prevalent post content, not every post or author, and
does not establish author identity, occupation, location, intent, automation or
coordination. Topic, sentiment and emotion values were not used to construct
the labels.

A focused audit inspected one reproducibly selected post from each of 25
distinct authors in each of 14 inferentially sensitive communities. C3, C13,
C14, C15 and C28 remain low-confidence provisional. For geography, place
discussion and language markers were kept separate from author location; no
audited C13/C14 sample post explicitly self-reported location.

The audit also confirmed an AI-corpus false positive: 208 of 26,069 non-empty
C14 posts contained “Air India”, and all 25 separately checked items across five
authors concerned airlines, flights or aviation. Processed-text cleaning means
exact links and hashtag symbols cannot be reconstructed. Repetition or
templating is not treated as proof of automation or coordination. Full results
and limitations are in REVIEW_SUMMARY.md.

## Author attributes

The hover display uses the original compact fields from Git HEAD: author ID,
numeric community ID, full-network degree, matched-subgraph degree, dominant
topic and probability, and positive/neutral/negative sentiment.

The click panel shows author ID, the presentation-only short community name
and its displayed-author count, the dominant topic and its stored membership
weight, full-network degree, the three stored sentiment scores, all 11 stored
emotion scores, and Example-post text. Sentiment and emotion values are raw
stored scores, not standardized values, and are formatted to three decimal
places without changing the underlying data.

## Example post

The interface uses the term **Example post** because the deterministic rule
chooses a relatively content-rich example and does not establish statistical
representativeness.

For each author, eligible non-empty, non-duplicate posts with at least three
informative tokens are ranked by:

1. post type preference: original, then quote, then reply;
2. greatest number of distinct informative tokens;
3. lowest tweet ID as the deterministic tie-break.

The mapping contains exactly 198,326 unique author rows. It provides an Example
post for 197,768 authors (99.72%): 156,466 original posts, 27,410 replies and
13,892 quote posts. The remaining 558 authors all have raw posts, but none meets
the existing three-informative-token threshold. The interface therefore shows:
“No sufficiently informative example post available.”

`data/representative_posts.json` retains its internal recovery filename. It is
loaded after the first map paint, separately from `data/nodes.json`, and maps
eligible author IDs to tweet ID, selection method, post type and a
whitespace-normalised excerpt of at most 280 characters. The interface displays
only the escaped excerpt text; it does not expose selection metadata or a link.

Textual metadata remains in ordinary JavaScript memory and is never inserted
into WebGL buffers.

## Reproducing the 3D coordinates

The full native force fit is recorded in the sibling `sfdp_feasibility`
workspace, including the exact DOT graph, fixed node-order vector, Graphviz C
extractor, raw float64 coordinates, process measurements, hashes and benchmark
report. From the visualiser repository root, with `numpy`, `pandas`, `pyarrow`,
`scipy` and `scikit-learn` available, package that validated fit with:

```powershell
python scripts/build_sfdp_3d_payload.py `
  --raw-coordinates ../sfdp_feasibility/results/sfdp_v14internal_187095_seed42_coords.f64 `
  --global-indices ../sfdp_feasibility/samples/sample_187095_nodes.npy `
  --benchmark-result ../sfdp_feasibility/results/sfdp_v14internal_187095_seed42.json `
  --matched-nodes ../data/matched_nodes.parquet `
  --matched-edges ../data/matched_edges.parquet `
  --viewer-nodes data/nodes.json `
  --output data/candidates/sfdp_v14internal_seed42/layout3d.bin `
  --indices-output data/candidates/sfdp_v14internal_seed42/layout3d_indices.bin `
  --metadata data/candidates/sfdp_v14internal_seed42/layout3d_meta.json

python scripts/build_constrained_sfdp_3d.py `
  --native-coordinates data/candidates/sfdp_v14internal_seed42/layout3d.bin `
  --native-metadata data/candidates/sfdp_v14internal_seed42/layout3d_meta.json `
  --indices data/candidates/sfdp_v14internal_seed42/layout3d_indices.bin `
  --viewer-nodes data/nodes.json `
  --sample-indices ../sfdp_feasibility/samples/sample_187095_nodes.npy `
  --adjacency ../sfdp_feasibility/samples/sample_187095_graph.npz `
  --output data/layout3d.bin `
  --metadata data/layout3d_meta.json

python scripts/evaluate_3d_layout.py `
  --coordinates data/layout3d.bin `
  --indices data/layout3d_indices.bin `
  --nodes <PATH_TO_MATCHED_NODES.parquet> `
  --edges <PATH_TO_MATCHED_EDGES.parquet> `
  --viewer-nodes data/nodes.json `
  --output data/layout3d_evaluation.json `
  --seed 20260827

python scripts/validate_3d_layout.py
```

The native packager fails before writing if source hashes, author order, counts,
indices, coordinate precision or finite-coordinate checks do not match the
validated inputs. The constraint builder verifies the complete giant-component
index set, solves both displacement axes to a fixed numerical tolerance and
records the residual, inputs and output hashes. The evaluator uses fixed-seed
samples and tests robust whole-layout and central-point geometry, observed-edge
discrimination, local graph-neighbour enrichment and continuity with the
accepted 2D arrangement. The validator checks artifact hashes, render indices,
geometry, label-free provenance, fixed constraint parameters and the stored
graph-quality acceptance result.
