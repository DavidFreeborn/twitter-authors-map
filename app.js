// ============================================================================
// Twitter Authors Map - WebGL Renderer
// Renders 198,326 authors using regl for WebGL
// ============================================================================

// Data
let nodes = [];
let summary = {};
const ASSET_VERSION = '20260821-reviewed-1';
const versionedAsset = path => `${path}?v=${ASSET_VERSION}`;

// Descriptive labels for the 21 largest Leiden-directed communities
// (data/community_labels.json). Communities outside the top 21 keep their
// bare numeric ID and are described collectively as long-tail communities.
let communityLabels = {};        // { "4": {label, display_label, short_description, ...} }
let labelledCommunityOrder = []; // top-21 community IDs, largest first
let communitySizes = {};         // exact matched-author count for every community

// Author -> selected Example post metadata. Lazily loaded after the main point
// cloud is on screen and kept in ordinary JS memory, never in GPU buffers.
let examplePosts = null;
let examplePostsState = 'idle';  // idle | loading | ready | failed

// Per-emotion mean/SD across all matched authors, used only to pick each
// author's two most distinctive emotions for display. Computed at load time
// from values already present in nodes.json; no stored value is modified.
let emotionStats = null;

// Currently selected author (click, or search hit) and hovered author
let selectedNode = null;
let hoverNode = null;

const EMOTION_KEYS = ['anger', 'anticipation', 'disgust', 'fear', 'joy', 'love',
    'optimism', 'pessimism', 'sadness', 'surprise', 'trust'];

// Field name mapping (compact JSON uses short names)
const F = {
    id: 'id', x: 'x', y: 'y',
    community: 'c',
    fullDegree: 'fd', matchedDegree: 'md',
    dominantTopic: 'dt', dominantProb: 'dp',
    positive: 'sp', neutral: 'sn', negative: 'sg',
    topic: i => 't' + i,
    anger: 'ea', anticipation: 'eb', disgust: 'ec', fear: 'ed',
    joy: 'ee', love: 'ef', optimism: 'eg', pessimism: 'eh',
    sadness: 'ei', surprise: 'ej', trust: 'ek'
};

// View state
let viewX = 0, viewY = 0, viewScale = 1;
let minX, maxX, minY, maxY;

// Rendering
let regl, drawPoints;
let positions, colors, sizes;

// Current color mode
let colorMode = 'community';

// Color palettes
const COMMUNITY_COLORS = [
    [0.12, 0.47, 0.71], [1.00, 0.50, 0.05], [0.17, 0.63, 0.17], [0.84, 0.15, 0.16],
    [0.58, 0.40, 0.74], [0.55, 0.34, 0.29], [0.89, 0.47, 0.76], [0.50, 0.50, 0.50],
    [0.74, 0.74, 0.13], [0.09, 0.75, 0.81], [0.68, 0.78, 0.91], [1.00, 0.73, 0.47],
    [0.60, 0.87, 0.54], [1.00, 0.60, 0.59], [0.77, 0.69, 0.84], [0.77, 0.61, 0.58],
    [0.97, 0.71, 0.82], [0.78, 0.78, 0.78], [0.86, 0.86, 0.55], [0.62, 0.85, 0.90],
    [0.22, 0.23, 0.47], [0.39, 0.47, 0.22], [0.55, 0.43, 0.19], [0.52, 0.24, 0.22]
];

const TOPIC_NAMES = [
    'Marketing/Social', 'AI Art Discourse', 'AI Tools/Code', 'Bard/LLMs',
    'Visual AI Art', 'Bot/Spam', 'Tech/Programming', 'News/Updates',
    'NFT/Crypto', 'Web3/DeFi', 'General AI', 'Trading/Invest'
];

const TOPIC_COLORS = [
    [0.89, 0.10, 0.11], [0.22, 0.49, 0.72], [0.30, 0.69, 0.29], [0.60, 0.31, 0.64],
    [1.00, 0.50, 0.00], [1.00, 1.00, 0.20], [0.65, 0.34, 0.16], [0.97, 0.51, 0.75],
    [0.60, 0.60, 0.60], [0.40, 0.76, 0.65], [0.99, 0.55, 0.38], [0.55, 0.63, 0.80]
];

const GREY = [0.35, 0.35, 0.42];

// ============================================================================
// Community label helpers
// ============================================================================

// Presentation-only short label for the labelled top 21; numeric IDs remain
// stored separately in each node and in the community key.
function communityLabel(c) {
    if (c === null || c === undefined || c < 0) return 'No community';
    const rec = communityLabels[String(c)];
    return rec ? rec.display_label : `Community ${c}`;
}

function communityIsLabelled(c) {
    return c !== null && c !== undefined && communityLabels[String(c)] !== undefined;
}

function communityDescription(c) {
    const rec = communityLabels[String(c)];
    if (rec) return rec.short_description;
    return 'Long-tail community: one of the smaller Leiden-directed communities '
        + 'outside the 21 largest, which together hold about 5% of matched authors. '
        + 'These are not individually labelled.';
}

function communitySize(c) {
    if (c === null || c === undefined || c < 0) return null;
    const labelled = communityLabels[String(c)];
    return labelled?.n_authors ?? communitySizes[String(c)] ?? null;
}

function communityConfidence(c) {
    const rec = communityLabels[String(c)];
    if (!rec) return '';
    return rec.review_status === 'provisional'
        ? rec.confidence + ' (provisional)'
        : rec.confidence;
}

function topTopicScores(node, howMany) {
    const scores = [];
    for (let i = 0; i < TOPIC_NAMES.length; i++) {
        const value = node[F.topic(i)];
        if (value !== null && value !== undefined) {
            scores.push({ index: i, name: TOPIC_NAMES[i], value });
        }
    }
    scores.sort((a, b) => b.value - a.value);
    return scores.slice(0, howMany || 3);
}

// Two most distinctive emotions for an author: largest |z| against the
// matched-author mean and SD for that emotion.
function computeEmotionStats() {
    const stats = {};
    for (const k of EMOTION_KEYS) {
        const field = F[k];
        let n = 0, sum = 0, sumsq = 0;
        for (let i = 0; i < nodes.length; i++) {
            const v = nodes[i][field];
            if (v === null || v === undefined) continue;
            n++; sum += v; sumsq += v * v;
        }
        const mean = n ? sum / n : 0;
        const varr = n ? Math.max(sumsq / n - mean * mean, 0) : 0;
        stats[k] = { mean: mean, sd: Math.sqrt(varr) || 1e-9 };
    }
    return stats;
}

function distinctiveEmotions(node, howMany) {
    if (!emotionStats) return [];
    const scored = [];
    for (const k of EMOTION_KEYS) {
        const v = node[F[k]];
        if (v === null || v === undefined) continue;
        const s = emotionStats[k];
        scored.push({ name: k, value: v, z: (v - s.mean) / s.sd });
    }
    scored.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    return scored.slice(0, howMany || 2);
}

function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function fmtSigned(z) { return (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(2); }

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
}

// Diverging color interpolation: val from -1 to +1
function divergingColor(val, lowColor, midColor, highColor) {
    if (val <= 0) {
        // Interpolate from low to mid
        const t = val + 1; // 0 to 1
        return [
            lowColor[0] + t * (midColor[0] - lowColor[0]),
            lowColor[1] + t * (midColor[1] - lowColor[1]),
            lowColor[2] + t * (midColor[2] - lowColor[2])
        ];
    } else {
        // Interpolate from mid to high
        const t = val; // 0 to 1
        return [
            midColor[0] + t * (highColor[0] - midColor[0]),
            midColor[1] + t * (highColor[1] - midColor[1]),
            midColor[2] + t * (highColor[2] - midColor[2])
        ];
    }
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
    try {
        const [nodesResp, summaryResp, labelsResp] = await Promise.all([
            fetch('data/nodes.json'),
            fetch('data/build_summary.json'),
            fetch(versionedAsset('data/community_labels.json')).catch(() => null)
        ]);

        nodes = await nodesResp.json();
        summary = await summaryResp.json();

        if (labelsResp && labelsResp.ok) {
            const payload = await labelsResp.json();
            communityLabels = payload.communities || {};
            labelledCommunityOrder = (payload.order || Object.keys(communityLabels).map(Number));
            console.log(`Loaded ${Object.keys(communityLabels).length} community labels`);
        } else {
            console.warn('community_labels.json unavailable; falling back to numeric community IDs');
        }

        console.log(`Loaded ${nodes.length} nodes`);

        // Distributional stats for the "distinctive emotions" display only.
        emotionStats = computeEmotionStats();

        // Update stats
        document.getElementById('stat-authors').textContent = nodes.length.toLocaleString();
        document.getElementById('stat-edges').textContent = summary.matched_edges?.toLocaleString() || '-';

        // Calculate bounds and exact matched-author community sizes.
        minX = Infinity; maxX = -Infinity;
        minY = Infinity; maxY = -Infinity;
        communitySizes = {};
        for (const node of nodes) {
            if (node.x < minX) minX = node.x;
            if (node.x > maxX) maxX = node.x;
            if (node.y < minY) minY = node.y;
            if (node.y > maxY) maxY = node.y;
            const c = node[F.community];
            if (c !== null && c !== undefined && c >= 0) {
                communitySizes[String(c)] = (communitySizes[String(c)] || 0) + 1;
            }
        }

        // Center view
        viewX = (minX + maxX) / 2;
        viewY = (minY + maxY) / 2;
        const rangeX = maxX - minX;
        const rangeY = maxY - minY;
        viewScale = 0.9 / Math.max(rangeX, rangeY) * 2;

        // Initialize WebGL
        initWebGL();

        // Build initial colors
        updateColors();

        // Hide loading
        document.getElementById('loading').classList.add('hidden');

        // Start render loop
        requestAnimationFrame(render);

        // Event listeners
        setupEventListeners();

        // Example-post lookup: fetched lazily after first paint so it never
        // delays the map. It remains separate from all GPU buffers.
        loadExamplePosts();

    } catch (err) {
        console.error('Failed to load data:', err);
        document.getElementById('loading-text').innerHTML =
            `<span style="color:#ff6b6b;">Error loading data</span><br>
            <span style="font-size:11px;color:#888;">${err.message}</span>`;
    }
}

function initWebGL() {
    const canvas = document.getElementById('graph-canvas');
    canvas.width = canvas.clientWidth * window.devicePixelRatio;
    canvas.height = canvas.clientHeight * window.devicePixelRatio;

    regl = createREGL({
        canvas: canvas,
        attributes: { antialias: true, alpha: false }
    });

    // Prepare position buffer
    positions = new Float32Array(nodes.length * 2);
    for (let i = 0; i < nodes.length; i++) {
        positions[i * 2] = nodes[i].x;
        positions[i * 2 + 1] = nodes[i].y;
    }

    // Prepare size buffer (log-scaled degree)
    sizes = new Float32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
        const deg = nodes[i][F.fullDegree] || 1;
        sizes[i] = Math.max(2, Math.log1p(deg) * 1.5);
    }

    // Color buffer
    colors = new Float32Array(nodes.length * 3);

    // Point drawing command
    drawPoints = regl({
        vert: `
            precision highp float;
            attribute vec2 position;
            attribute vec3 color;
            attribute float size;
            uniform vec2 viewOffset;
            uniform float viewScale;
            uniform vec2 resolution;
            varying vec3 vColor;

            void main() {
                vec2 pos = (position - viewOffset) * viewScale;
                pos.x *= resolution.y / resolution.x;
                gl_Position = vec4(pos, 0, 1);
                gl_PointSize = size * viewScale * 50.0;
                vColor = color;
            }
        `,
        frag: `
            precision highp float;
            varying vec3 vColor;

            void main() {
                vec2 cxy = 2.0 * gl_PointCoord - 1.0;
                float r = dot(cxy, cxy);
                if (r > 1.0) discard;
                float alpha = 1.0 - smoothstep(0.5, 1.0, r);
                gl_FragColor = vec4(vColor, alpha);
            }
        `,
        attributes: {
            position: regl.buffer(positions),
            color: regl.prop('colors'),
            size: regl.buffer(sizes)
        },
        uniforms: {
            viewOffset: regl.prop('viewOffset'),
            viewScale: regl.prop('viewScale'),
            resolution: regl.prop('resolution')
        },
        count: nodes.length,
        primitive: 'points',
        blend: {
            enable: true,
            func: { srcRGB: 'src alpha', srcAlpha: 1, dstRGB: 'one minus src alpha', dstAlpha: 1 }
        },
        depth: { enable: false }
    });
}

// ============================================================================
// Rendering
// ============================================================================

function render() {
    const canvas = document.getElementById('graph-canvas');

    // Resize if needed
    const dpr = window.devicePixelRatio;
    const width = canvas.clientWidth * dpr;
    const height = canvas.clientHeight * dpr;

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    regl.clear({ color: [0.07, 0.07, 0.10, 1] });

    const colorBuffer = regl.buffer(colors);

    drawPoints({
        colors: colorBuffer,
        viewOffset: [viewX, viewY],
        viewScale: viewScale,
        resolution: [canvas.width, canvas.height]
    });

    colorBuffer.destroy();

    requestAnimationFrame(render);
}

// ============================================================================
// Color computation
// ============================================================================

function updateColors() {
    const mode = colorMode;
    let validCount = 0;

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        let color = GREY;

        if (mode === 'community') {
            const comm = node[F.community];
            if (comm !== null && comm !== undefined && comm >= 0) {
                color = COMMUNITY_COLORS[comm % COMMUNITY_COLORS.length];
                validCount++;
            }
        }
        else if (mode === 'dominant_topic') {
            const topicIdx = node[F.dominantTopic];
            if (topicIdx !== null && topicIdx !== undefined && topicIdx >= 0 && topicIdx < TOPIC_COLORS.length) {
                color = TOPIC_COLORS[topicIdx];
                validCount++;
            }
        }
        else if (mode === 'sentiment') {
            const sentType = document.getElementById('sentiment-select').value;

            if (sentType === 'net') {
                const pos = node[F.positive];
                const neg = node[F.negative];
                if (pos !== null && pos !== undefined && neg !== null && neg !== undefined) {
                    // Continuous diverging scale: red (-1) -> white (0) -> blue (+1)
                    const val = Math.max(-1, Math.min(1, (pos - neg) * 1.5)); // Scale up for visibility
                    color = divergingColor(val,
                        [0.75, 0.22, 0.22],  // Negative (red)
                        [0.85, 0.85, 0.88],  // Neutral (light grey)
                        [0.20, 0.45, 0.75]   // Positive (blue)
                    );
                    validCount++;
                }
            } else {
                // Map dropdown value to compact field name
                const sentField = sentType === 'positive' ? F.positive : sentType === 'negative' ? F.negative : F.neutral;
                const val = node[sentField];
                if (val !== null && val !== undefined) {
                    // Continuous scale for individual dimensions
                    const t = Math.min(1, Math.max(0, val));
                    if (sentType === 'positive') {
                        // Light to saturated blue
                        color = [0.75 - t * 0.55, 0.80 - t * 0.35, 0.90 - t * 0.15];
                    } else if (sentType === 'negative') {
                        // Light to saturated red
                        color = [0.90 - t * 0.15, 0.75 - t * 0.50, 0.75 - t * 0.50];
                    } else { // neutral
                        // Light to saturated purple
                        color = [0.85 - t * 0.25, 0.80 - t * 0.35, 0.90 - t * 0.20];
                    }
                    validCount++;
                }
            }
        }
        else if (mode === 'topic_membership') {
            const topicIdx = document.getElementById('topic-select').value;
            const val = node[F.topic(topicIdx)];
            if (val !== null && val !== undefined) {
                // Light grey (low) to saturated teal (high)
                const t = Math.min(1, Math.max(0, val * 2.5));
                color = [
                    0.85 - t * 0.65,  // 0.85 -> 0.20
                    0.85 - t * 0.25,  // 0.85 -> 0.60
                    0.88 - t * 0.13   // 0.88 -> 0.75
                ];
                validCount++;
            }
        }
        else if (mode === 'emotion') {
            const emotion = document.getElementById('emotion-select').value;
            // Map emotion name to compact field
            const emotionMap = {
                anger: F.anger, anticipation: F.anticipation, disgust: F.disgust, fear: F.fear,
                joy: F.joy, love: F.love, optimism: F.optimism, pessimism: F.pessimism,
                sadness: F.sadness, surprise: F.surprise, trust: F.trust
            };
            const val = node[emotionMap[emotion]];
            if (val !== null && val !== undefined) {
                // Blue (low) to red (high) diverging scale
                const t = Math.min(1, Math.max(0, val * 1.8)); // Scale for visibility
                color = divergingColor(t * 2 - 1,  // Convert 0-1 to -1 to +1
                    [0.20, 0.40, 0.70],  // Low (blue)
                    [0.85, 0.85, 0.88],  // Mid (light grey)
                    [0.80, 0.25, 0.25]   // High (red)
                );
                validCount++;
            }
        }

        colors[i * 3] = color[0];
        colors[i * 3 + 1] = color[1];
        colors[i * 3 + 2] = color[2];
    }

    updateLegend(mode);
}

function updateLegend(mode) {
    const container = document.getElementById('legend');
    container.innerHTML = '';

    // Helper to create RGB string
    const rgb = (c) => `rgb(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)})`;

    if (mode === 'community') {
        // Discrete swatches: the 21 labelled communities, largest first, then
        // a single entry for the unlabelled long tail.
        const comms = [...new Set(nodes.map(n => n[F.community]))]
            .filter(c => c !== null && c >= 0);

        let labelled = labelledCommunityOrder.filter(c => communityIsLabelled(c));
        if (labelled.length === 0) {
            labelled = comms.slice().sort((a, b) => a - b).slice(0, 12);
        }
        const nTail = comms.length - labelled.length;

        const items = labelled.map(c => ({
            label: communityLabel(c),
            color: COMMUNITY_COLORS[c % COMMUNITY_COLORS.length]
        }));
        if (nTail > 0) {
            items.push({
                label: `${nTail.toLocaleString()} long-tail communities`,
                color: null
            });
        }
        items.push({ label: 'No data', color: GREY });

        for (const item of items) {
            const div = document.createElement('div');
            div.className = 'legend-item';
            const swatch = item.color
                ? `<span class="legend-swatch" style="background:${rgb(item.color)}"></span>`
                : `<span class="legend-swatch legend-swatch-multi"></span>`;
            div.innerHTML = `${swatch}<span class="legend-label">${item.label}</span>`;
            container.appendChild(div);
        }
    }
    else if (mode === 'dominant_topic') {
        // Discrete swatches for topics
        for (let i = 0; i < TOPIC_NAMES.length; i++) {
            const div = document.createElement('div');
            div.className = 'legend-item';
            div.innerHTML = `
                <span class="legend-swatch" style="background:${rgb(TOPIC_COLORS[i])}"></span>
                <span class="legend-label">${TOPIC_NAMES[i]}</span>
            `;
            container.appendChild(div);
        }
        const noData = document.createElement('div');
        noData.className = 'legend-item';
        noData.innerHTML = `<span class="legend-swatch" style="background:${rgb(GREY)}"></span><span class="legend-label">No data</span>`;
        container.appendChild(noData);
    }
    else if (mode === 'sentiment') {
        // Gradient bar for sentiment
        const sentType = document.getElementById('sentiment-select').value;
        const gradientDiv = document.createElement('div');
        gradientDiv.className = 'legend-gradient-wrap';

        if (sentType === 'net') {
            gradientDiv.innerHTML = `
                <div class="legend-gradient" style="background: linear-gradient(to right, ${rgb([0.75,0.22,0.22])}, ${rgb([0.85,0.85,0.88])}, ${rgb([0.20,0.45,0.75])})"></div>
                <div class="legend-gradient-labels"><span>Negative</span><span>Neutral</span><span>Positive</span></div>
            `;
        } else {
            const lowColor = sentType === 'positive' ? [0.75,0.80,0.90] : sentType === 'negative' ? [0.90,0.75,0.75] : [0.85,0.80,0.90];
            const highColor = sentType === 'positive' ? [0.20,0.45,0.75] : sentType === 'negative' ? [0.75,0.25,0.25] : [0.60,0.45,0.70];
            gradientDiv.innerHTML = `
                <div class="legend-gradient" style="background: linear-gradient(to right, ${rgb(lowColor)}, ${rgb(highColor)})"></div>
                <div class="legend-gradient-labels"><span>Low</span><span>High</span></div>
            `;
        }
        container.appendChild(gradientDiv);

        const noData = document.createElement('div');
        noData.className = 'legend-item';
        noData.style.marginTop = '8px';
        noData.innerHTML = `<span class="legend-swatch" style="background:${rgb(GREY)}"></span><span class="legend-label">No data</span>`;
        container.appendChild(noData);
    }
    else if (mode === 'topic_membership') {
        // Gradient bar for topic membership
        const gradientDiv = document.createElement('div');
        gradientDiv.className = 'legend-gradient-wrap';
        gradientDiv.innerHTML = `
            <div class="legend-gradient" style="background: linear-gradient(to right, ${rgb([0.85,0.85,0.88])}, ${rgb([0.20,0.60,0.75])})"></div>
            <div class="legend-gradient-labels"><span>Low</span><span>High</span></div>
        `;
        container.appendChild(gradientDiv);

        const noData = document.createElement('div');
        noData.className = 'legend-item';
        noData.style.marginTop = '8px';
        noData.innerHTML = `<span class="legend-swatch" style="background:${rgb(GREY)}"></span><span class="legend-label">No data</span>`;
        container.appendChild(noData);
    }
    else if (mode === 'emotion') {
        // Gradient bar for emotion (blue to red)
        const gradientDiv = document.createElement('div');
        gradientDiv.className = 'legend-gradient-wrap';
        gradientDiv.innerHTML = `
            <div class="legend-gradient" style="background: linear-gradient(to right, ${rgb([0.20,0.40,0.70])}, ${rgb([0.85,0.85,0.88])}, ${rgb([0.80,0.25,0.25])})"></div>
            <div class="legend-gradient-labels"><span>Low</span><span>Mid</span><span>High</span></div>
        `;
        container.appendChild(gradientDiv);

        const noData = document.createElement('div');
        noData.className = 'legend-item';
        noData.style.marginTop = '8px';
        noData.innerHTML = `<span class="legend-swatch" style="background:${rgb(GREY)}"></span><span class="legend-label">No data</span>`;
        container.appendChild(noData);
    }
}

// ============================================================================
// Interaction
// ============================================================================

function setupEventListeners() {
    const canvas = document.getElementById('graph-canvas');

    // Zoom - REDUCED SENSITIVITY
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        // Much gentler zoom: 3% per scroll tick instead of 10%
        const factor = e.deltaY > 0 ? 0.97 : 1.03;
        viewScale *= factor;
        viewScale = Math.max(0.001, Math.min(100, viewScale));
    }, { passive: false });

    // Pan
    let dragging = false;
    let lastX, lastY;

    let downX = 0, downY = 0;

    canvas.addEventListener('mousedown', (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        downX = e.clientX;
        downY = e.clientY;
        canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('mousemove', (e) => {
        if (dragging) {
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            const scale = 2 / (canvas.clientHeight * viewScale);
            viewX -= dx * scale;
            viewY += dy * scale;
            lastX = e.clientX;
            lastY = e.clientY;
        } else {
            showTooltip(e);
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        dragging = false;
        canvas.style.cursor = 'default';

        // A click (not a drag) on a point opens the selected-author panel
        const moved = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
        if (moved < 4) {
            const node = pickNodeAt(e);
            if (node) showAuthorPanel(node);
        }
    });

    canvas.addEventListener('mouseleave', () => {
        dragging = false;
        canvas.style.cursor = 'default';
        document.getElementById('tooltip').style.display = 'none';
    });

    // Color mode radio buttons
    const radioItems = document.querySelectorAll('.radio-item');
    radioItems.forEach(item => {
        item.addEventListener('click', () => {
            // Update active state
            radioItems.forEach(r => r.classList.remove('active'));
            item.classList.add('active');

            // Get mode from data attribute
            const mode = item.dataset.mode;
            if (mode) {
                colorMode = mode;

                // Show/hide sub-options
                document.getElementById('sentiment-options').classList.toggle('visible', mode === 'sentiment');
                document.getElementById('topic-options').classList.toggle('visible', mode === 'topic_membership');
                document.getElementById('emotion-options').classList.toggle('visible', mode === 'emotion');

                updateColors();
            }
        });
    });

    // Sub-selects
    document.getElementById('sentiment-select').addEventListener('change', updateColors);
    document.getElementById('topic-select').addEventListener('change', updateColors);
    document.getElementById('emotion-select').addEventListener('change', updateColors);

    // Resize
    window.addEventListener('resize', () => {
        const canvas = document.getElementById('graph-canvas');
        canvas.width = canvas.clientWidth * window.devicePixelRatio;
        canvas.height = canvas.clientHeight * window.devicePixelRatio;
    });

    // Enter key in search
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchAuthor();
    });

    // Escape closes the selected-author panel
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAuthorPanel();
    });
}

// Nearest node to a pointer event, or null. Shared by hover and click.
function pickNodeAt(e) {
    const canvas = document.getElementById('graph-canvas');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to data coordinates
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const dataX = viewX + (x / canvas.clientWidth * 2 - 1) / viewScale * aspect;
    const dataY = viewY - (y / canvas.clientHeight * 2 - 1) / viewScale;

    // Find nearest node
    let nearest = null;
    let minDist = Infinity;
    const threshold = 0.08 / viewScale;

    for (const node of nodes) {
        const dx = node.x - dataX;
        const dy = node.y - dataY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist && dist < threshold) {
            minDist = dist;
            nearest = node;
        }
    }
    return nearest;
}

function showTooltip(e) {
    const canvas = document.getElementById('graph-canvas');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to data coordinates
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const dataX = viewX + (x / canvas.clientWidth * 2 - 1) / viewScale * aspect;
    const dataY = viewY - (y / canvas.clientHeight * 2 - 1) / viewScale;

    // Find nearest node
    let nearest = null;
    let minDist = Infinity;
    const threshold = 0.08 / viewScale;

    for (const node of nodes) {
        const dx = node.x - dataX;
        const dy = node.y - dataY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist && dist < threshold) {
            minDist = dist;
            nearest = node;
        }
    }

    const tooltip = document.getElementById('tooltip');

    if (nearest) {
        let html = `<div class="tt-author">${nearest[F.id]}</div>`;
        html += `<div class="tt-row"><span class="tt-label">Community</span><span class="tt-value">${nearest[F.community]}</span></div>`;
        html += `<div class="tt-row"><span class="tt-label">Full degree</span><span class="tt-value">${nearest[F.fullDegree]?.toFixed(0) || '-'}</span></div>`;
        html += `<div class="tt-row"><span class="tt-label">Matched degree</span><span class="tt-value">${nearest[F.matchedDegree]?.toFixed(0) || '-'}</span></div>`;

        const domTopic = nearest[F.dominantTopic];
        if (domTopic !== null && domTopic !== undefined && domTopic >= 0) {
            const topicName = TOPIC_NAMES[domTopic] || `Topic ${domTopic}`;
            html += `<div class="tt-row"><span class="tt-label">Topic</span><span class="tt-value">${topicName}</span></div>`;
            html += `<div class="tt-row"><span class="tt-label">Topic prob</span><span class="tt-value">${(nearest[F.dominantProb] * 100).toFixed(0)}%</span></div>`;
        }

        const pos = nearest[F.positive];
        if (pos !== null && pos !== undefined) {
            html += `<div class="tt-row"><span class="tt-label">Sentiment</span><span class="tt-value">+${pos.toFixed(2)} / ${nearest[F.neutral].toFixed(2)} / -${nearest[F.negative].toFixed(2)}</span></div>`;
        }

        tooltip.innerHTML = html;
        tooltip.style.display = 'block';

        // Position tooltip
        let left = e.clientX + 12;
        let top = e.clientY + 12;

        // Keep within viewport
        const tooltipRect = tooltip.getBoundingClientRect();
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = e.clientX - tooltipRect.width - 12;
        }
        if (top + tooltipRect.height > window.innerHeight - 10) {
            top = e.clientY - tooltipRect.height - 12;
        }

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    } else {
        tooltip.style.display = 'none';
    }
}

// ============================================================================
// Selected-author panel
// ============================================================================

// The dataset stores numeric author IDs only; no display name or @handle was
// retained in the matched author table, so the ID is what we can show.
function authorDisplay(node) {
    return node[F.id];
}

function loadExamplePosts() {
    if (examplePostsState !== 'idle') return;
    examplePostsState = 'loading';
    fetch(versionedAsset('data/representative_posts.json'))
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
        .then(j => {
            examplePosts = j.posts || j;
            examplePostsState = 'ready';
            console.log(`Loaded ${Object.keys(examplePosts).length} Example posts`);
            if (selectedNode) showAuthorPanel(selectedNode);
        })
        .catch(err => {
            examplePostsState = 'failed';
            console.warn('representative_posts.json unavailable:', err.message);
            if (selectedNode) showAuthorPanel(selectedNode);
        });
}

function formatScore(value) {
    return value === null || value === undefined ? '—' : Number(value).toFixed(3);
}

function examplePostHtml(node) {
    const title = `<div class='ap-example-title'>Example post</div>`;
    if (examplePostsState === 'loading' || examplePostsState === 'idle') {
        return title + `<div class='ap-empty'>Loading…</div>`;
    }
    if (examplePostsState === 'failed' || !examplePosts) {
        return title + `<div class='ap-empty'>Example post unavailable.</div>`;
    }
    const record = examplePosts[node[F.id]];
    if (!record) {
        return title + `<div class='ap-empty'>No sufficiently informative example post available.</div>`;
    }
    return title + `<blockquote class='ap-excerpt'>${escapeHtml(record[3])}</blockquote>`;
}

function showAuthorPanel(node) {
    selectedNode = node;
    const panel = document.getElementById('author-panel');
    const body = document.getElementById('author-panel-body');
    if (!panel || !body) return;
    const community = node[F.community];
    const communityN = communitySize(community);
    const dominantTopic = node[F.dominantTopic];
    const dominantTopicName = dominantTopic !== null && dominantTopic !== undefined && dominantTopic >= 0
        ? (TOPIC_NAMES[dominantTopic] || `Topic ${dominantTopic}`)
        : '—';

    const row = (label, value) => `<div class='ap-row'><span class='ap-label'>${label}</span><span class='ap-value'>${value}</span></div>`;
    const score = (label, value) => `<div class='ap-score'><span>${label}</span><span>${formatScore(value)}</span></div>`;
    const emotions = [
        ['Anger', node[F.anger]],
        ['Anticipation', node[F.anticipation]],
        ['Disgust', node[F.disgust]],
        ['Fear', node[F.fear]],
        ['Joy', node[F.joy]],
        ['Love', node[F.love]],
        ['Optimism', node[F.optimism]],
        ['Pessimism', node[F.pessimism]],
        ['Sadness', node[F.sadness]],
        ['Surprise', node[F.surprise]],
        ['Trust', node[F.trust]],
    ];

    let html = `<div class='ap-author'>${escapeHtml(node[F.id])}</div>`;
    html += `<div class='ap-section ap-summary'>`;
    html += row('Community', escapeHtml(communityLabel(community)));
    if (communityN !== null) html += row('Community size', communityN.toLocaleString());
    html += row('Dominant topic', escapeHtml(dominantTopicName));
    html += row('Topic weight', formatScore(node[F.dominantProb]));
    html += row('Full-network degree', (node[F.fullDegree] ?? 0).toFixed(0));
    html += `</div>`;

    html += `<div class='ap-section'>`;
    html += `<div class='ap-section-title'>Sentiment scores <span>(raw)</span></div>`;
    html += `<div class='ap-score-grid ap-sentiment-grid'>`;
    html += score('Positive', node[F.positive]);
    html += score('Neutral', node[F.neutral]);
    html += score('Negative', node[F.negative]);
    html += `</div></div>`;

    html += `<div class='ap-section'>`;
    html += `<div class='ap-section-title'>Emotion scores <span>(raw)</span></div>`;
    html += `<div class='ap-score-grid'>`;
    html += emotions.map(([label, value]) => score(label, value)).join('');
    html += `</div></div>`;

    html += `<div class='ap-section'>${examplePostHtml(node)}</div>`;

    body.innerHTML = html;
    panel.classList.remove('hidden');
}
function closeAuthorPanel() {
    selectedNode = null;
    const panel = document.getElementById('author-panel');
    if (panel) panel.classList.add('hidden');
}

// ============================================================================
// Controls
// ============================================================================

function searchAuthor() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;

    const node = nodes.find(n => n[F.id] === query);
    const status = document.getElementById('search-status');
    if (node) {
        viewX = node.x;
        viewY = node.y;
        viewScale = 0.3;

        if (status) {
            status.className = 'search-status found';
            status.innerHTML = `Found <strong>${escapeHtml(node[F.id])}</strong><br>`
                + escapeHtml(communityLabel(node[F.community]));
        }
        showAuthorPanel(node);
    } else {
        if (status) {
            status.className = 'search-status missing';
            status.textContent = `Author ${query} not found among the 198,326 matched authors`;
        }
        closeAuthorPanel();
    }
}
function resetView() {
    viewX = (minX + maxX) / 2;
    viewY = (minY + maxY) / 2;
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    viewScale = 0.9 / Math.max(rangeX, rangeY) * 2;
}

function fitToScreen() {
    resetView();
}

function zoomIn() {
    viewScale *= 1.25;
    viewScale = Math.min(100, viewScale);
}

function zoomOut() {
    viewScale *= 0.8;
    viewScale = Math.max(0.001, viewScale);
}

// Start
document.addEventListener('DOMContentLoaded', init);
