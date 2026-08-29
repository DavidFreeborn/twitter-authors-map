#!/usr/bin/env python3
"""Validate the final 3D graph embedding, render mask and quality report."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


EXPECTED_NODES = 198_326
EXPECTED_RENDERED_NODES = 187_095
EXPECTED_EDGES = 853_133
EXPECTED_FR_ALGORITHM = "direct 3D Fruchterman-Reingold (300 iterations, grid) force layout"
EXPECTED_SFDP_ALGORITHM = "Graphviz sfdp 14.1.3 native 3D multilevel force-directed layout"
EXPECTED_CONSTRAINED_ALGORITHM = "native 3D Graphviz sfdp with graph-Laplacian-regularised accepted-2D macro constraint"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--coordinates", type=Path, default=Path("data/layout3d.bin"))
    parser.add_argument("--indices", type=Path, default=Path("data/layout3d_indices.bin"))
    parser.add_argument("--metadata", type=Path, default=Path("data/layout3d_meta.json"))
    parser.add_argument("--evaluation", type=Path, default=Path("data/layout3d_evaluation.json"))
    parser.add_argument("--viewer-nodes", type=Path, default=Path("data/nodes.json"))
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    args = parse_args()
    errors: list[str] = []
    metadata = json.loads(args.metadata.read_text(encoding="utf-8"))
    evaluation = json.loads(args.evaluation.read_text(encoding="utf-8"))
    expected_coordinate_bytes = EXPECTED_NODES * 3 * 4
    expected_index_bytes = EXPECTED_RENDERED_NODES * 4

    if args.coordinates.stat().st_size != expected_coordinate_bytes:
        errors.append("coordinate payload has the wrong byte length")
    if args.indices.stat().st_size != expected_index_bytes:
        errors.append("render-index payload has the wrong byte length")
    schema_version = metadata.get("schema_version")
    algorithm = metadata.get("algorithm")
    is_fr = schema_version == 6 and algorithm == EXPECTED_FR_ALGORITHM
    is_sfdp = schema_version == 7 and algorithm == EXPECTED_SFDP_ALGORITHM
    is_constrained = schema_version == 8 and algorithm == EXPECTED_CONSTRAINED_ALGORITHM
    if not (is_fr or is_sfdp or is_constrained):
        errors.append("metadata does not identify a supported final 3D force layout")
    if metadata.get("node_count") != EXPECTED_NODES:
        errors.append(f"metadata node_count: {metadata.get('node_count')}")
    if metadata.get("rendered_node_count") != EXPECTED_RENDERED_NODES:
        errors.append(f"metadata rendered_node_count: {metadata.get('rendered_node_count')}")
    if metadata.get("edge_count") != EXPECTED_EDGES:
        errors.append(f"metadata edge_count: {metadata.get('edge_count')}")
    if is_fr:
        if metadata.get("seed") != 20260827:
            errors.append(f"unexpected FR seed: {metadata.get('seed')}")
        if metadata.get("fr_iterations") != 300:
            errors.append(f"unexpected FR iteration count: {metadata.get('fr_iterations')}")
        if metadata.get("fr_start_temperature") != 8.0:
            errors.append(f"unexpected FR start temperature: {metadata.get('fr_start_temperature')}")
        initialisation = metadata.get("initialisation", {})
        if initialisation.get("x_y") != "accepted viewer 2D DrL coordinates":
            errors.append("initial x/y provenance is not the accepted 2D layout")
        if initialisation.get("initial_depth_ratio") != 0.6:
            errors.append(f"unexpected initial depth ratio: {initialisation.get('initial_depth_ratio')}")
    elif is_sfdp:
        if metadata.get("seed") != 42:
            errors.append(f"unexpected sfdp seed: {metadata.get('seed')}")
        if metadata.get("rendered_undirected_simple_edges") != 837_811:
            errors.append("unexpected sfdp undirected-edge count")
        extraction = str(metadata.get("coordinate_extraction", ""))
        if "internal double" not in extraction or "before float32" not in extraction:
            errors.append("metadata does not document high-precision sfdp extraction")
    elif is_constrained:
        if metadata.get("seed") != 42:
            errors.append(f"unexpected native sfdp seed: {metadata.get('seed')}")
        construction = metadata.get("construction", {})
        if construction.get("laplacian_strength") != 0.10:
            errors.append("unexpected macro-constraint Laplacian strength")
        if construction.get("target_displacement_rms_ratio") != 0.80:
            errors.append("unexpected macro-displacement RMS ratio")
        if construction.get("native_depth_multiplier") != 1.00:
            errors.append("native sfdp depth was altered")
        if construction.get("communities_or_author_attributes_used", True):
            errors.append("metadata indicates labels or author attributes affected coordinates")
    graph = metadata.get("graph", {})
    if graph.get("communities_used", True) or graph.get("author_attributes_used", True):
        errors.append("metadata indicates that non-graph attributes affected position")
    if is_sfdp:
        if "undirected simple topology" not in str(graph.get("direction", "")):
            errors.append("sfdp graph topology is not documented as undirected and simple")
        if "not modelled" not in str(graph.get("weights", "")):
            errors.append("sfdp edge-weight limitation is not documented")
        display_transform = metadata.get("display_transform", {})
        if float(display_transform.get("orthogonality_max_abs_error", 1.0)) > 1e-10:
            errors.append("sfdp display orientation is not numerically orthogonal")
        if float(display_transform.get(
            "sampled_pairwise_distance_max_abs_reconstruction_error", 1.0
        )) > 1e-10:
            errors.append("sfdp packaging does not preserve pairwise geometry")
    transform = str(metadata.get("post_layout_transform", ""))
    required_absences = (
        ("no clipping", "no community separation", "no per-community scaling", "no forced depth")
        if is_fr or is_constrained else
        ("no clipping", "axis-wise scaling", "community separation", "forced depth")
    )
    if not all(statement in transform for statement in required_absences):
        errors.append("metadata does not document the absence of community reshaping")
    if metadata.get("coordinates", {}).get("sha256") != sha256(args.coordinates):
        errors.append("coordinate SHA-256 does not match metadata")
    if metadata.get("render_indices", {}).get("sha256") != sha256(args.indices):
        errors.append("render-index SHA-256 does not match metadata")
    coordinates = np.fromfile(args.coordinates, dtype="<f4")
    indices = np.fromfile(args.indices, dtype="<u4").astype(np.int64)
    if coordinates.size != EXPECTED_NODES * 3:
        errors.append(f"coordinate count: {coordinates.size}")
        points = np.empty((0, 3), dtype=np.float32)
    else:
        points = coordinates.reshape(EXPECTED_NODES, 3)
        if not np.isfinite(points).all():
            errors.append("coordinates contain NaN or infinity")
    if len(indices) != EXPECTED_RENDERED_NODES:
        errors.append(f"render-index count: {len(indices)}")
    elif (indices < 0).any() or (indices >= EXPECTED_NODES).any():
        errors.append("render indices are out of bounds")
    elif not np.all(indices[1:] > indices[:-1]):
        errors.append("render indices are not unique and strictly increasing")
    eigenvalue_ratios = np.zeros(3, dtype=np.float64)
    hidden_maximum = None
    if len(points) and len(indices) == EXPECTED_RENDERED_NODES:
        rendered = points[indices].astype(np.float64)
        covariance = np.cov(rendered, rowvar=False)
        eigenvalues = np.linalg.eigvalsh(covariance)[::-1]
        eigenvalue_ratios = eigenvalues / eigenvalues[0]
        if eigenvalue_ratios[1] < 0.20:
            errors.append(f"second dimension is too compressed: {eigenvalue_ratios[1]:.4f}")
        if not 0.15 <= eigenvalue_ratios[2] <= 0.75:
            errors.append(f"third-dimension ratio indicates a sheet or sphere: {eigenvalue_ratios[2]:.4f}")
        hidden = np.ones(EXPECTED_NODES, dtype=bool)
        hidden[indices] = False
        hidden_maximum = float(np.max(np.abs(points[hidden])))
        if hidden_maximum != 0.0:
            errors.append("non-rendered coordinate rows are not exactly zero")
        if float(np.max(np.linalg.norm(rendered, axis=1))) > 3.0:
            errors.append("rendered coordinate outlier exceeds the documented robust extent")
        if is_sfdp or is_constrained:
            unique_counts = [len(np.unique(rendered[:, axis])) for axis in range(3)]
            if min(unique_counts) < int(EXPECTED_RENDERED_NODES * 0.99):
                errors.append(f"sfdp browser payload has unexpected axis quantisation: {unique_counts}")

    if not evaluation.get("acceptance", {}).get("passed", False):
        errors.append("graph/geometry evaluation did not pass")
    geometry = evaluation.get("geometry", {})
    trimmed_ratios = geometry.get("central_95_percent_covariance_eigenvalue_ratios", [0, 0, 0])
    robust_extent_ratios = geometry.get("robust_pca_axis_p90_extent_ratios", [0, 0, 0])
    if trimmed_ratios[2] < 0.18:
        errors.append(f"central 95% remains planar: {trimmed_ratios[2]:.4f}")
    if trimmed_ratios[2] > 0.85:
        errors.append(f"central 95% is near-spherical: {trimmed_ratios[2]:.4f}")
    if robust_extent_ratios[2] < 0.28:
        errors.append(f"robust third-axis extent is too small: {robust_extent_ratios[2]:.4f}")
    if evaluation.get("rendered_nodes") != EXPECTED_RENDERED_NODES:
        errors.append("evaluation rendered-node count differs from metadata")
    if metadata.get("source", {}).get("viewer_nodes_sha256") != sha256(args.viewer_nodes):
        errors.append("viewer nodes SHA-256 does not match metadata")

    result = {
        "passed": not errors,
        "nodes": EXPECTED_NODES,
        "rendered_nodes": len(indices),
        "coordinate_bytes": args.coordinates.stat().st_size,
        "index_bytes": args.indices.stat().st_size,
        "covariance_eigenvalue_ratios": eigenvalue_ratios.round(6).tolist(),
        "hidden_coordinate_maximum": hidden_maximum,
        "graph_evaluation_passed": bool(evaluation.get("acceptance", {}).get("passed", False)),
        "errors": errors,
    }
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
