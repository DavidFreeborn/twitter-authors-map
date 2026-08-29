#!/usr/bin/env python3
"""Build the reviewed structure-preserving 3D network coordinates.

This does not rerun community detection or any content analysis.  It combines
the native full-graph 3D sfdp geometry with the accepted 2D DrL macro geometry
through a reproducible graph-Laplacian-regularised displacement field.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import cg


NODE_COUNT = 198_326
RENDERED_COUNT = 187_095
LAPLACIAN_STRENGTH = 0.10
TARGET_DISPLACEMENT_RMS_RATIO = 0.80
DEPTH_MULTIPLIER = 1.00


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native-coordinates", type=Path, required=True)
    parser.add_argument("--native-metadata", type=Path, required=True)
    parser.add_argument("--indices", type=Path, required=True)
    parser.add_argument("--viewer-nodes", type=Path, required=True)
    parser.add_argument("--sample-indices", type=Path, required=True)
    parser.add_argument("--adjacency", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def normalise(points: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    centre = np.median(points, axis=0)
    centred = points - centre
    scale = float(np.quantile(np.linalg.norm(centred, axis=1), 0.995))
    if not np.isfinite(scale) or scale <= 0:
        raise RuntimeError("Invalid robust coordinate scale")
    return centred / scale, centre, scale


def solve_displacement(
    displacement: np.ndarray,
    adjacency: sparse.csr_matrix,
) -> tuple[np.ndarray, dict[str, float]]:
    weighted = adjacency.astype(np.float64, copy=True)
    weighted.data = np.log1p(weighted.data)
    degree = np.asarray(weighted.sum(axis=1)).ravel()
    positive_degree = degree[degree > 0]
    median_degree = float(np.median(positive_degree))
    laplacian = sparse.diags(degree) - weighted
    system = (
        sparse.eye(len(degree), format="csr")
        + (LAPLACIAN_STRENGTH / median_degree) * laplacian
    )
    preconditioner = sparse.diags(1.0 / system.diagonal())
    field = np.empty_like(displacement)
    iterations: list[int] = []
    for axis in range(2):
        iteration_count = 0

        def count_iteration(_: np.ndarray) -> None:
            nonlocal iteration_count
            iteration_count += 1

        field[:, axis], info = cg(
            system,
            displacement[:, axis],
            M=preconditioner,
            rtol=5e-6,
            atol=0.0,
            maxiter=1_200,
            callback=count_iteration,
        )
        if info != 0:
            raise RuntimeError(f"CG failed for axis {axis}: {info}")
        iterations.append(iteration_count)
    source_rms = float(np.sqrt(np.mean(np.square(displacement))))
    field_rms = float(np.sqrt(np.mean(np.square(field))))
    gain = TARGET_DISPLACEMENT_RMS_RATIO * source_rms / max(field_rms, 1e-12)
    residual = system @ field - displacement
    return gain * field, {
        "median_log_weighted_degree": median_degree,
        "unscaled_source_rms": source_rms,
        "unscaled_field_rms": field_rms,
        "computed_field_gain": gain,
        "cg_iterations_x": iterations[0],
        "cg_iterations_y": iterations[1],
        "cg_max_absolute_residual": float(np.max(np.abs(residual))),
    }


def main() -> int:
    args = parse_args()
    viewer = json.loads(args.viewer_nodes.read_text(encoding="utf-8"))
    if len(viewer) != NODE_COUNT:
        raise RuntimeError(f"Expected {NODE_COUNT:,} viewer nodes; found {len(viewer):,}")
    rendered = np.fromfile(args.indices, dtype="<u4").astype(np.int64)
    if len(rendered) != RENDERED_COUNT or len(np.unique(rendered)) != RENDERED_COUNT:
        raise RuntimeError("Render-index payload is missing rows or contains duplicates")
    native_full = np.fromfile(args.native_coordinates, dtype="<f4")
    if native_full.size != NODE_COUNT * 3:
        raise RuntimeError("Native coordinate payload has the wrong size")
    native_full = native_full.reshape(NODE_COUNT, 3).astype(np.float64)
    native, native_centre, native_scale = normalise(native_full[rendered])
    accepted_xy = np.asarray([[row["x"], row["y"]] for row in viewer], dtype=np.float64)
    accepted, accepted_centre, accepted_scale = normalise(accepted_xy[rendered])

    sample_global = np.load(args.sample_indices).astype(np.int64)
    if len(sample_global) != RENDERED_COUNT or len(np.unique(sample_global)) != RENDERED_COUNT:
        raise RuntimeError("sfdp sample-index array is not the complete giant component")
    inverse = np.full(NODE_COUNT, -1, dtype=np.int64)
    inverse[rendered] = np.arange(RENDERED_COUNT, dtype=np.int64)
    sample_rows = inverse[sample_global]
    if np.any(sample_rows < 0):
        raise RuntimeError("sfdp sample and rendered author sets differ")
    adjacency = sparse.load_npz(args.adjacency).tocsr()
    if adjacency.shape != (RENDERED_COUNT, RENDERED_COUNT):
        raise RuntimeError("Adjacency has the wrong shape")

    desired_displacement = accepted[sample_rows] - native[sample_rows, :2]
    displacement_sample, solver = solve_displacement(desired_displacement, adjacency)
    displacement = np.empty_like(displacement_sample)
    displacement[sample_rows] = displacement_sample
    constrained = native.copy()
    constrained[:, :2] += displacement
    constrained[:, 2] *= DEPTH_MULTIPLIER
    constrained, output_centre, output_scale = normalise(constrained)

    full = np.zeros((NODE_COUNT, 3), dtype="<f4")
    full[rendered] = constrained.astype("<f4")
    if not np.isfinite(full[rendered]).all():
        raise RuntimeError("Output contains NaN or infinity")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    full.tofile(args.output)
    if args.output.stat().st_size != NODE_COUNT * 3 * 4:
        raise RuntimeError("Output coordinate payload has the wrong byte size")

    values = np.linalg.eigvalsh(np.cov(constrained, rowvar=False))[::-1]
    radii = np.linalg.norm(constrained - np.median(constrained, axis=0), axis=1)
    native_meta = json.loads(args.native_metadata.read_text(encoding="utf-8"))
    metadata = {
        "schema_version": 8,
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "algorithm": "native 3D Graphviz sfdp with graph-Laplacian-regularised accepted-2D macro constraint",
        "dimensions": 3,
        "layout_only": True,
        "node_count": NODE_COUNT,
        "rendered_node_count": RENDERED_COUNT,
        "edge_count": 853_133,
        "rendered_directed_edges": 851_957,
        "rendered_undirected_simple_edges": 837_811,
        "rendered_component": "largest weak component",
        "seed": native_meta.get("seed"),
        "graph": {
            "native_layout_topology": "undirected simple topology derived from the observed directed graph",
            "native_layout_weights": "not modelled by Graphviz sfdp",
            "constraint_graph": "undirected summed observed weights transformed with log1p",
            "accepted_macro_source": "weighted directed DrL layout",
            "communities_used": False,
            "author_attributes_used": False,
        },
        "construction": {
            "native_geometry": "fixed full-graph Graphviz sfdp 14.1.3 3D coordinates",
            "macro_constraint": "accepted weighted DrL 2D coordinates",
            "equation": "(I + lambda L)d = accepted_xy - native_xy",
            "laplacian": "unnormalised Laplacian of log1p-transformed undirected summed edge weights",
            "laplacian_strength": LAPLACIAN_STRENGTH,
            "target_displacement_rms_ratio": TARGET_DISPLACEMENT_RMS_RATIO,
            "native_depth_multiplier": DEPTH_MULTIPLIER,
            "communities_or_author_attributes_used": False,
            "post_transform": "median translation and one uniform p99.5-radius scale; no clipping, per-axis scaling, or community packing",
            "interpretation": "The constraint restores the accepted map's macro separation while regularisation discourages local edge-neighbour distortions; native sfdp supplies all depth.",
        },
        "solver": solver,
        "post_layout_transform": "graph-regularised macro constraint followed by median translation and one uniform scale; no clipping, no axis-wise scaling, no community separation, no per-community scaling, and no forced depth",
        "normalisation": {
            "native_input_median": native_centre.tolist(),
            "native_input_p99.5_radius": native_scale,
            "accepted_2d_median": accepted_centre.tolist(),
            "accepted_2d_p99.5_radius": accepted_scale,
            "pre_output_median": output_centre.tolist(),
            "pre_output_p99.5_radius": output_scale,
        },
        "geometry": {
            "covariance_eigenvalues": values.tolist(),
            "covariance_eigenvalue_ratios": (values / values[0]).tolist(),
            "radius_p50": float(np.quantile(radii, 0.50)),
            "radius_p90": float(np.quantile(radii, 0.90)),
            "radius_p99": float(np.quantile(radii, 0.99)),
            "radius_p99.5": float(np.quantile(radii, 0.995)),
            "radius_max": float(radii.max()),
        },
        "coordinates": {
            "path": args.output.name,
            "dtype": "little-endian float32",
            "order": "viewer-node order; interleaved x,y,z; non-rendered rows are zero",
            "bytes": args.output.stat().st_size,
            "sha256": sha256(args.output),
        },
        "render_indices": {
            "path": args.indices.name,
            "sha256": sha256(args.indices),
        },
        "source": {
            "native_coordinates": str(args.native_coordinates),
            "native_coordinates_sha256": sha256(args.native_coordinates),
            "native_algorithm": native_meta.get("algorithm"),
            "native_seed": native_meta.get("seed"),
            "native_metadata_sha256": sha256(args.native_metadata),
            "viewer_nodes": str(args.viewer_nodes),
            "viewer_nodes_sha256": sha256(args.viewer_nodes),
            "sample_indices": str(args.sample_indices),
            "sample_indices_sha256": sha256(args.sample_indices),
            "adjacency": str(args.adjacency),
            "adjacency_sha256": sha256(args.adjacency),
        },
        "runtime": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scipy": __import__("scipy").__version__,
        },
        "interpretation": "A reproducible structure-preserving 3D network view. Axes, handedness and absolute scale have no substantive meaning.",
    }
    args.metadata.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "coordinates": str(args.output),
        "sha256": metadata["coordinates"]["sha256"],
        "metadata": str(args.metadata),
        "covariance_eigenvalue_ratios": metadata["geometry"]["covariance_eigenvalue_ratios"],
        "solver": solver,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
