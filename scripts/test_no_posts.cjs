const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.argv[2] || path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const original = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const variant = fs.readFileSync(path.join(root, 'no-posts.html'), 'utf8');
assert.equal(variant, original
    .replace('<script src="app.js?v=20261013-lenses-4"></script>', '<script data-hide-posts="true" src="app.js?v=20261013-no-posts-1"></script>')
    .replace('rel="canonical" href="https://davidfreeborn.github.io/twitter-authors-map/"', 'rel="canonical" href="https://davidfreeborn.github.io/twitter-authors-map/no-posts.html"'));

function panel(hidden, state) {
    const elements = new Map(), requests = [];
    const context = vm.createContext({
        document: {
            currentScript: {dataset: hidden ? {hidePosts: 'true'} : {}},
            addEventListener() {},
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, {innerHTML: '', classList: {remove() {}}});
                return elements.get(id);
            }
        }, window: {}, console,
        fetch(url) { requests.push(url); return new Promise(() => {}); }
    });
    const run = s => vm.runInContext(s, context);
    run(source);
    run(`authorMetrics = new Map([['test', [100,200,30,4,5]]]);
        examplePostsState = ${JSON.stringify(state)};
        examplePosts = {'test':['1','selection','original','EXCERPT MUST NOT APPEAR']};
        showAuthorPanel({id:'test',c:4,dt:2,dp:0.7,sp:0.5,sn:0.3,sg:0.2});`);
    const html = elements.get('author-panel-body').innerHTML;
    run("examplePostsState = 'idle'; loadExamplePosts()");
    return {html, requests};
}
for (const state of ['idle','loading','ready','failed']) {
    const normal = panel(false, state), hidden = panel(true, state);
    assert.equal(hidden.html, normal.html.replace(/<div class='ap-section'><div class='ap-example-title'>Example post<\/div>[\s\S]*?<\/div>$/, ''), 'all other author details remain byte-identical');
    assert.ok(!hidden.html.includes('Example post'));
    assert.ok(!hidden.html.includes('EXCERPT MUST NOT APPEAR'));
    assert.equal(hidden.requests.length, 0, 'hidden variant never requests tweet content');
    assert.equal(normal.requests.length, 1, 'original still requests tweet content');
    for (const label of ['Followers', 'Lifetime posts', 'Posts analysed', 'Retweets sent', 'Retweets received', 'Sentiment scores', 'Emotion scores', 'Dominant topic']) assert.ok(hidden.html.includes(label), label);
}
console.log('PASS: identical page and author details except tweet section; no tweet fetch in any loading state; original still shows tweets.');
