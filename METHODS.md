# Twitter Authors Map: corrected analysis

Updated 11 October 2026. Collection period: 30 October 2022 to 27 February 2023.

## Population and network

The RetweetedOnce network contains 202,710 users and 882,530 edges. All its users belong to the larger network's largest weakly connected component. The map displays the 164,291 authors eligible for the corrected analysis (at least three usable posts), with 782,974 connections between displayed authors. The full-network degree can include connections outside this displayed subset.

The default 2D coordinates use igraph DrL on the matched-author network. Disconnected components have arbitrary relative placement. The optional 3D view displays the largest connected component: 161,035 authors. The other 3,256 authors remain available in 2D.

## Three-dimensional view

Graphviz sfdp supplies native three-dimensional network geometry. A graph-Laplacian constraint preserves the 2D map's broad geometry while retaining native depth. The fitted settings are seed 42, Laplacian strength 0.1, displacement RMS ratio 0.8 and native depth multiplier 1.0. Native layout edges are unweighted; the constraint uses log1p of summed edge weights. There are 764,868 rendered unique undirected edges.

Coordinates do not use topics, sentiments, emotions or community labels. Proximity is not evidence of agreement; axes, orientation and absolute scale have no substantive interpretation. This is a network layout, not the separate UMAP of author topic mixtures.

## Topics and affect

The twelve-topic exploratory reference uses network-specific author documents containing all eligible posts, including retweets: unigram TF-IDF LDA, alpha 0.3, eta 0.1, random seed 42, the full fitted unigram vocabulary and 50 maximum iterations. It was selected after comparing the saved eight- and twelve-topic fits, rather than as the automatic grid winner. The author population, corpus, sentiment/emotion scores and network coordinates are unchanged.

A controlled repeat with seed 43, identical author documents and exactly the same fitted vocabulary and IDF weights gave 76.5% agreement on leading topics after matching topics by author-membership similarity. Topic-weighted net-sentiment rankings correlated 0.87; three matched topics crossed the population-average net-sentiment reference. Five of 54 substantial community-topic enrichment cells reversed direction (communities with at least 1,000 authors; absolute log2 enrichment at least 0.5 in both runs). These filters describe the comparison, not a universal robustness threshold. Some matched topics have different meanings between fits, so the agreement percentage is not evidence that all twelve themes are stable. Individual labels remain exploratory. The earlier eight-topic agreement figure does not describe this model.

Sentiment and emotion attributes are author-level averages of stored classifier probabilities. They describe language, not verified beliefs, intentions or feelings. Emotion scores are non-exclusive. Search-term ambiguity admits some unrelated uses of words or names. The current population and topic method differ from the historical map; topic IDs do not correspond across versions.

## Community labels and examples

The 21 largest displayed communities were labelled using characteristic c-TF-IDF terms and content review of 25 posts from distinct authors per community. Labels describe prevalent content, not every member or their identity. See [label descriptions and confidence](labels.html).

Example posts are independently selected from the current corpus for exactly the displayed authors. The rule prefers original posts, then quotes, replies and retweets. Within type it maximizes distinct informative tokens and breaks ties by post ID. Near-duplicates retain their first source occurrence. At least three informative tokens are required; excerpts are limited to 280 characters. This preserves the historical selection rule on the updated corpus, with explicit retweet labelling. Examples are illustrative rather than statistically representative. A missing example does not remove an author from the map. Text is escaped before display.

## Historical version

The previous published map (198,326 authors and 12 topics) is preserved by Git tag `before-corrected-rerun-2026-10-11` in this repository. Restoring that tagged tree on the publishing branch restores the former website, including its data and example posts. The tag identifies the former published version, rather than merely a source-code snapshot.

The corrected eight-topic edition is additionally preserved by Git tag `before-twelve-topic-update-2026-10-11`, which identifies its actual published tree.


## Interactive focus and colour palettes

The atlas can highlight authors while preserving their existing positions and all model scores. Selected topics are combined with OR. The default rule selects authors whose highest-weighted topic is selected; the alternative requires at least the chosen membership in any one selected topic (not the sum). A community filter is intersected with that selection. An empty topic selection means no topic restriction.

Other authors can be dimmed for context or hidden. Both 2D and 3D use the same author mask. The display reports the full selection and, in 3D, its coverage in the giant-component coordinates. Mean net sentiment is the unweighted mean of positive minus negative author scores over the full selection, including authors available only in 2D; it is not post-level sentiment about a topic.

Focus is independent of the colour lens: communities, leading topics, topic membership, sentiment and emotion remain available. Map picking inspects focused authors; ID search still finds every author and reports when a result is outside the focus. Clear focus removes both the topic and community restrictions. Reset and Fit preserve focus and continue to control the camera only.

The shared topic palette is identical in this atlas, its label guide and the current light/dark blog figures. Colours never change memberships or labels. Twelve categories cannot be reliably distinguished by colour alone for every viewer, so labelled checkboxes, isolation and exact counts provide alternatives. The map retains its existing sentiment and emotion scales.

The focusable map supports arrow-key pan (2D) or rotation (3D), plus/minus zoom, and Home to fit. Native controls support keyboard selection. Original mouse, touch, search, examples and camera controls remain available.
