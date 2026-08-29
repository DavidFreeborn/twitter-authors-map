# 3D layout shape audit

## Question

Why did the native 3D `sfdp` layout look more spherical and locally mixed than
the accepted 2D DrL map, and why did some local circular or elliptical sheets
appear?

This audit uses the same 187,095 giant-component authors throughout. It does not
rerun clustering, community detection or content models.

## Findings

The loss of visible separation was not caused by community centroids simply
moving closer. Across the 21 largest communities, between/within-position
variance was 2.398 in accepted 2D and 2.732 in native 3D. Instead, local
same-community proximity fell from 0.703 to 0.604 at 30 neighbours, and many
large communities became rounder in 3D. Their projected bodies overlapped and
filled gaps even though their centres remained separated.

Three mechanisms explain this.

1. The accepted map is weighted, directed igraph DrL. Native Graphviz `sfdp`
   used the simple undirected graph and a different spring-electrical objective.
   DrL also has a late edge-cutting control that can separate highly stressed
   regions.
2. In two dimensions, branches cannot pass above and below one another. The
   third dimension removes that planar constraint, allowing branches to fold
   into the same projected area and a force equilibrium to occupy a volume.
3. A 2D camera projection necessarily superimposes some distinct 3D locations.
   Rotation changes the overlaps but cannot create the open planar gaps of the
   accepted map from an unconstrained compact equilibrium.

The flat patches were genuine coordinate geometry, not WebGL point sprites.
In native `sfdp`, 7.83% of sampled 30-neighbour regions had a third covariance
ratio below 0.05. Among 13,172 graph hubs of degree 20–2,000, 197 had a broad
first/second axis and a third ratio below 0.05. Their neighbours generally had
very low induced-edge density and many disconnected neighbour components: they
were sparse hub-and-spoke or fan motifs, not cohesive circular communities.

Graphviz's optional leaf-circle beautification was not active. The Graphviz
14.1.3 source shows that `beautify_leaves` defaults to false. The multilevel
solver also inherits coarse positions during prolongation and adds only a small
perturbation before refinement. The conclusion that this can leave a weakly
constrained fan in a shallow local sheet is an inference from the source and the
observed motifs, not a claim that Graphviz is numerically broken. Relevant
primary sources are the Graphviz [`dim` documentation](https://graphviz.org/docs/attrs/dim/),
[`sfdp` theory index](https://graphviz.org/theory/) and
[`spring_electrical.c` source](https://gitlab.com/graphviz/graphviz/-/raw/14.1.3/lib/sfdpgen/spring_electrical.c).

## Corrective method

A free 3D equilibrium cannot be required both to exploit the third dimension
and to reproduce the exact visual consequences of planar exclusion. The final
view therefore declares the accepted 2D map to be a macro-geometry constraint.
Native `sfdp` still supplies all depth.

For each author, the target x/y displacement is accepted DrL x/y minus native
`sfdp` x/y. The final smooth field solves

`(I + 0.10 L)d = target`,

where `L` is the unnormalised Laplacian of the existing undirected graph with
summed edge weights transformed by `log1p`. The solved field is scaled to 80%
of the target RMS and added to native x/y; native z is unchanged. The last step
is a median translation and one uniform p99.5-radius scale. Community labels and
author/content attributes are not inputs.

Pointwise 2D extrusion, community packing and arbitrary local z-jitter were
rejected. They can manufacture depth or tidy shapes without a defensible graph
objective.

## Before/after validation

| Diagnostic | Native 3D `sfdp` | Final constrained 3D | Accepted 2D reference |
|---|---:|---:|---:|
| Pair-distance Spearman with accepted 2D | 0.604 | 0.950 | 1.000 |
| Same-community fraction, 30-NN | 0.604 | 0.692 | 0.703 |
| Between/within variance, top 21 communities | 2.732 | 2.484 | 2.398 |
| Local third ratio below 0.05, 5,000 sampled 30-NN regions | 8.24% | 0.60% | not applicable |
| Local disk-like regions (`λ2/λ1 ≥ 0.30`, `λ3/λ1 < 0.05`) | 7.02% | 0.12% | not applicable |
| Whole-layout covariance ratios | 1.000, 0.302, 0.150 | 1.000, 0.865, 0.281 | two-dimensional |
| Median observed-edge / degree-matched-nonedge distance | 0.232 | 0.149 | not re-evaluated |
| Observed edge shorter than matched non-edge | 92.0% | 90.9% | not re-evaluated |

The final result passes the fixed geometry and graph-fidelity checks in
`data/layout3d_evaluation.json`. It is neither planar nor spherical, retains
nearly the accepted 2D local community correspondence, and sharply reduces
visible sheet-like local neighbourhoods. It does not promise that every sparse
star motif will be volumetric: some are intrinsically underdetermined by the
observed graph.

## Reproducible artifacts

- Native source: `data/candidates/sfdp_v14internal_seed42/layout3d.bin`
- Final coordinates: `data/layout3d.bin`
- Final metadata and hashes: `data/layout3d_meta.json`
- Graph/geometry evaluation: `data/layout3d_evaluation.json`
- Builder: `scripts/build_constrained_sfdp_3d.py`
- Focused diagnostic code: `../sfdp_feasibility/diagnose_layout_shape.py`
- Development comparison: `../sfdp_feasibility/constrained_candidates_laplacian/candidate_metrics.json`

Axes, handedness, origin and scale have no substantive meaning. The layout is
an exploratory view of graph structure, not evidence of latent author identity
or a new clustering result.
