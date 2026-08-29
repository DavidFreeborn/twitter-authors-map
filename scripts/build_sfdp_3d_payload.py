#!/usr/bin/env python3
"""Package the validated full Graphviz sfdp solution for the WebGL viewer.

The force solution is not deformed.  Packaging performs only:

1. a median translation in float64 (important because Graphviz's raw z axis
   has a large arbitrary offset);
2. one orthogonal Procrustes rotation/reflection for a reproducible initial
   orientation relative to the accepted 2D network map; and
3. one uniform display scale based on the 99.5th percentile radius.

Coordinates are then placed back into the viewer's complete node order.  Rows
outside the giant component are zero and are excluded by the index payload.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd


EXPECTED_NODE_COUNT = 198_326
EXPECTED_RENDERED_COUNT = 187_095
EXPECTED_HASHES = {
    "raw_coordinates": "f883bb9038ac987693b87a8c83803bcab205f18d9fe4c4e0dbb9042f66ca4f3e",
    "global_indices": "9d3723c255c87573050ebae052db3cff5158730d5967f1dcabe991d2c2b8dd40",
    "matched_nodes": "881679e781a81a8ee313f3fdde679db93c701b7fc150938d316e91dc07749168",
    "matched_edges": "2056a4cd8d1edb1a2d10285fe92957486fbfd96dbf311b04f62d7e89be01d1dc",
    "viewer_nodes": "2728df43c2071d6d5819ee9e8b71f6a3d08918e9dff585d586fcd515e359152b",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-coordinates", type=Path, required=True)
    parser.add_argument("--global-indices", type=Path, required=True)
    parser.add_argument("--benchmark-result", type=Path, required=True)
    parser.add_argument("--matched-nodes", type=Path, required=True)
    parser.add_argument("--matched-edges", type=Path, required=True)
    parser.add_argument("--viewer-nodes", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--indices-output", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require_hash(label: str, path: Path) -> str:
    actual = sha256(path)
    expected = EXPECTED_HASHES[label]
    if actual != expected:
        raise RuntimeError(
            f"{label} hash mismatch for {path}: expected {expected}, got {actual}"
        )
    return actual


def quantiles(values: np.ndarray) -> dict[str, float]:
    points = (0.50, 0.90, 0.99, 0.995, 0.999)
    result = np.quantile(values, points)
    output = {f"radius_p{point * 100:g}": float(value) for point, value in zip(points, result)}
    output["max_radius"] = float(values.max())
    return output


def main() -> int:
    args = parse_args()
    source_hashes = {
        "raw_coordinates": require_hash("raw_coordinates", args.raw_coordinates),
        "global_indices": require_hash("global_indices", args.global_indices),
        "matched_nodes": require_hash("matched_nodes", args.matched_nodes),
        "matched_edges": require_hash("matched_edges", args.matched_edges),
        "viewer_nodes": require_hash("viewer_nodes", args.viewer_nodes),
        "benchmark_result": sha256(args.benchmark_result),
    }

    raw = np.fromfile(args.raw_coordinates, dtype="<f8")
    if raw.size != EXPECTED_RENDERED_COUNT * 3:
        raise RuntimeError(f"Raw coordinate count is {raw.size}; expected {EXPECTED_RENDERED_COUNT * 3}")
    raw = raw.reshape(EXPECTED_RENDERED_COUNT, 3)
    if not np.isfinite(raw).all():
        raise RuntimeError("Raw sfdp coordinates contain NaN or infinity")
    if any(len(np.unique(raw[:, axis])) < EXPECTED_RENDERED_COUNT * 0.99 for axis in range(3)):
        raise RuntimeError("Raw coordinates have unexpected axis quantisation")

    global_indices = np.load(args.global_indices).astype(np.int64, copy=False)
    if global_indices.shape != (EXPECTED_RENDERED_COUNT,):
        raise RuntimeError(f"Index vector has shape {global_indices.shape}")
    if global_indices.min() < 0 or global_indices.max() >= EXPECTED_NODE_COUNT:
        raise RuntimeError("Global index vector is out of viewer bounds")
    if len(np.unique(global_indices)) != EXPECTED_RENDERED_COUNT:
        raise RuntimeError("Global index vector contains duplicates")

    matched = pd.read_parquet(args.matched_nodes, columns=["author_id", "x", "y"])
    if len(matched) != EXPECTED_NODE_COUNT:
        raise RuntimeError(f"Matched-node count is {len(matched)}")
    with args.viewer_nodes.open("r", encoding="utf-8") as handle:
        viewer = json.load(handle)
    if len(viewer) != EXPECTED_NODE_COUNT:
        raise RuntimeError(f"Viewer-node count is {len(viewer)}")
    matched_ids = matched["author_id"].astype(str).to_numpy()
    viewer_ids = np.asarray([str(row["id"]) for row in viewer])
    if not np.array_equal(matched_ids, viewer_ids):
        mismatch = int(np.flatnonzero(matched_ids != viewer_ids)[0])
        raise RuntimeError(f"Viewer/matched author order differs at row {mismatch}")

    # Center before float32 conversion to retain the genuine depth structure.
    raw_median = np.median(raw, axis=0)
    centered = raw - raw_median
    target_xy = matched[["x", "y"]].to_numpy(dtype=np.float64)[global_indices]
    target_xy -= np.median(target_xy, axis=0)
    target = np.column_stack([target_xy, np.zeros(EXPECTED_RENDERED_COUNT)])

    # Orthogonal Procrustes transform: orientation only, with no axis-wise scale.
    u, singular_values, vt = np.linalg.svd(centered.T @ target, full_matrices=True)
    rotation = u @ vt
    orthogonality_error = float(np.max(np.abs(rotation.T @ rotation - np.eye(3))))
    if orthogonality_error > 1e-10:
        raise RuntimeError(f"Rigid transform is not orthogonal: {orthogonality_error}")
    oriented = centered @ rotation
    oriented_median = np.median(oriented, axis=0)
    oriented -= oriented_median
    radius_before_scale = np.linalg.norm(oriented, axis=1)
    scale_radius = float(np.quantile(radius_before_scale, 0.995))
    if not np.isfinite(scale_radius) or scale_radius <= 0:
        raise RuntimeError("Invalid robust radius for uniform display scaling")
    packaged = oriented / scale_radius

    # Verify that the transform preserved all pairwise geometry to numerical precision.
    rng = np.random.default_rng(20260827)
    pair_rows = rng.integers(0, EXPECTED_RENDERED_COUNT, size=(50_000, 2))
    pair_rows = pair_rows[pair_rows[:, 0] != pair_rows[:, 1]]
    raw_distance = np.linalg.norm(centered[pair_rows[:, 0]] - centered[pair_rows[:, 1]], axis=1)
    packaged_distance = np.linalg.norm(
        packaged[pair_rows[:, 0]] - packaged[pair_rows[:, 1]], axis=1
    )
    distance_error = float(np.max(np.abs(packaged_distance * scale_radius - raw_distance)))
    if distance_error > 1e-10:
        raise RuntimeError(f"Packaging changed pairwise geometry: max error {distance_error}")

    full = np.zeros((EXPECTED_NODE_COUNT, 3), dtype="<f4")
    full[global_indices] = packaged.astype("<f4")
    rendered_indices = np.sort(global_indices).astype("<u4")
    if not np.all(np.any(full[rendered_indices] != 0, axis=1)):
        raise RuntimeError("A rendered row unexpectedly contains the zero sentinel")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.indices_output.parent.mkdir(parents=True, exist_ok=True)
    full.tofile(args.output)
    rendered_indices.tofile(args.indices_output)
    if args.output.stat().st_size != EXPECTED_NODE_COUNT * 3 * 4:
        raise RuntimeError("Final coordinate payload has the wrong byte length")
    if args.indices_output.stat().st_size != EXPECTED_RENDERED_COUNT * 4:
        raise RuntimeError("Final index payload has the wrong byte length")

    rendered = full[rendered_indices].astype(np.float64)
    centered_rendered = rendered - np.median(rendered, axis=0)
    covariance_eigenvalues = np.linalg.eigvalsh(np.cov(centered_rendered, rowvar=False))[::-1]
    covariance_ratios = covariance_eigenvalues / covariance_eigenvalues[0]
    radii = np.linalg.norm(centered_rendered, axis=1)

    benchmark = json.loads(args.benchmark_result.read_text(encoding="utf-8"))
    metadata = {
        "schema_version": 7,
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "algorithm": "Graphviz sfdp 14.1.3 native 3D multilevel force-directed layout",
        "dimensions": 3,
        "layout_only": True,
        "node_count": EXPECTED_NODE_COUNT,
        "rendered_node_count": EXPECTED_RENDERED_COUNT,
        "edge_count": 853_133,
        "rendered_directed_edges": 851_957,
        "rendered_undirected_simple_edges": 837_811,
        "rendered_component": "largest weak component",
        "component_count": 10_288,
        "isolate_count": 9_627,
        "seed": 42,
        "graph": {
            "direction": "undirected simple topology derived from the observed directed graph",
            "weights": "not modelled by Graphviz sfdp",
            "weight_limitation": (
                "The stored edge weights are not used in this 3D candidate; 85.3% of "
                "undirected edges have weight 1, but this still differs from the accepted "
                "weighted 2D DrL layout."
            ),
            "communities_used": False,
            "author_attributes_used": False,
        },
        "coordinate_extraction": (
            "Graphviz ND_pos internal double arrays through the C API; centering occurred "
            "before float32 conversion to prevent z-axis quantisation"
        ),
        "post_layout_transform": (
            "median translation, one orthogonal Procrustes orientation to the accepted 2D "
            "network map, and one uniform display scale only; no clipping, axis-wise scaling, "
            "community separation, or forced depth"
        ),
        "display_transform": {
            "raw_median_translation": raw_median.tolist(),
            "post_rotation_median_translation": oriented_median.tolist(),
            "orthogonal_matrix": rotation.tolist(),
            "orthogonality_max_abs_error": orthogonality_error,
            "determinant": float(np.linalg.det(rotation)),
            "procrustes_singular_values": singular_values.tolist(),
            "uniform_scale_divisor": scale_radius,
            "scale_quantile": 0.995,
            "sampled_pairwise_distance_max_abs_reconstruction_error": distance_error,
        },
        "coordinates": {
            "path": args.output.name,
            "dtype": "little-endian float32",
            "order": "viewer-node order; interleaved x,y,z; non-rendered rows are zero",
            "bytes": args.output.stat().st_size,
            "sha256": sha256(args.output),
        },
        "render_indices": {
            "path": args.indices_output.name,
            "dtype": "little-endian uint32",
            "order": "ascending viewer-node indices",
            "bytes": args.indices_output.stat().st_size,
            "sha256": sha256(args.indices_output),
        },
        "source": {
            "raw_coordinates_file": args.raw_coordinates.name,
            "raw_coordinates_sha256": source_hashes["raw_coordinates"],
            "global_indices_file": args.global_indices.name,
            "global_indices_sha256": source_hashes["global_indices"],
            "benchmark_result_file": args.benchmark_result.name,
            "benchmark_result_sha256": source_hashes["benchmark_result"],
            "matched_nodes_file": args.matched_nodes.name,
            "matched_nodes_sha256": source_hashes["matched_nodes"],
            "matched_edges_file": args.matched_edges.name,
            "matched_edges_sha256": source_hashes["matched_edges"],
            "viewer_nodes_file": args.viewer_nodes.name,
            "viewer_nodes_sha256": source_hashes["viewer_nodes"],
        },
        "runtime": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
            "graphviz_layout_wall_seconds": benchmark["process"]["wall_seconds"],
            "graphviz_layout_peak_working_set_bytes": benchmark["process"]["peak_working_set_bytes"],
        },
        "covariance_eigenvalues": covariance_eigenvalues.tolist(),
        "covariance_eigenvalue_ratios": covariance_ratios.tolist(),
        "normalised_bounds": {
            "min": rendered.min(axis=0).tolist(),
            "max": rendered.max(axis=0).tolist(),
            **quantiles(radii),
        },
        "benchmark_evaluation": benchmark["evaluation"],
        "interpretation": (
            "A graph-topology-only 3D force layout of the giant component. Orientation, "
            "axes, handedness, and absolute scale have no substantive meaning."
        ),
    }
    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    args.metadata.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "coordinates": str(args.output),
        "coordinates_sha256": metadata["coordinates"]["sha256"],
        "indices": str(args.indices_output),
        "indices_sha256": metadata["render_indices"]["sha256"],
        "metadata": str(args.metadata),
        "rendered_nodes": EXPECTED_RENDERED_COUNT,
        "covariance_eigenvalue_ratios": covariance_ratios.tolist(),
        "radius_p995": metadata["normalised_bounds"]["radius_p99.5"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
