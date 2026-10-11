# Twitter Authors Map: corrected analysis

Updated 11 October 2026. Collection period: 30 October 2022 to 27 February 2023.

## Population and network

The RetweetedOnce network contains 202,710 users and 882,530 edges. All its users belong to the larger network's largest weakly connected component. The map displays the 164,291 authors eligible for the corrected analysis (at least three usable posts), with 782,974 connections between displayed authors. The full-network degree can include connections outside this displayed subset.

The default 2D coordinates use igraph DrL on the matched-author network. Disconnected components have arbitrary relative placement. The optional 3D view displays the largest connected component: 161,035 authors. The other 3,256 authors remain available in 2D.

## Three-dimensional view

Graphviz sfdp supplies native three-dimensional network geometry. A graph-Laplacian constraint preserves the 2D map's broad geometry while retaining native depth. The fitted settings are seed 42, Laplacian strength 0.1, displacement RMS ratio 0.8 and native depth multiplier 1.0. Native layout edges are unweighted; the constraint uses log1p of summed edge weights. There are 764,868 rendered unique undirected edges.

Coordinates do not use topics, sentiments, emotions or community labels. Proximity is not evidence of agreement; axes, orientation and absolute scale have no substantive interpretation. This is a network layout, not the separate UMAP of author topic mixtures.

## Topics and affect

The eight-topic exploratory reference uses network-specific author documents containing all eligible posts, including retweets: TF-IDF LDA, alpha 0.3, eta 0.01, random seed 42, full fitted vocabulary and 50 maximum iterations. It replaces a collapsed candidate. Topic assignments remain sensitive to initialization: a controlled seed comparison gave about 61% agreement on leading topics after topic matching. Individual labels are not a stable taxonomy; some detailed community-topic associations reverse across fits.

Sentiment and emotion attributes are author-level averages of stored classifier probabilities. They describe language, not verified beliefs, intentions or feelings. Emotion scores are non-exclusive. Search-term ambiguity admits some unrelated uses of words or names. The current population and topic method differ from the historical map; topic IDs do not correspond across versions.

## Community labels and examples

The 21 largest displayed communities were labelled using characteristic c-TF-IDF terms and content review of 25 posts from distinct authors per community. Labels describe prevalent content, not every member or their identity. See [label descriptions and confidence](labels.html).

Example posts are independently selected from the current corpus for exactly the displayed authors. The rule prefers original posts, then quotes, replies and retweets. Within type it maximizes distinct informative tokens and breaks ties by post ID. Near-duplicates retain their first source occurrence. At least three informative tokens are required; excerpts are limited to 280 characters. This preserves the historical selection rule on the updated corpus, with explicit retweet labelling. Examples are illustrative rather than statistically representative. A missing example does not remove an author from the map. Text is escaped before display.

## Historical version

The previous published map (198,326 authors and 12 topics) is preserved by Git tag `before-corrected-rerun-2026-10-11` in this repository. Restoring that tagged tree on the publishing branch restores the former website, including its data and example posts. The tag identifies the former published version, rather than merely a source-code snapshot.
