# Twitter Authors Map: corrected analysis

Updated 11 October 2026. Collection period: 30 October 2022 to 27 February 2023.

## Population and network

The RetweetedOnce network contains 202,710 users and 882,530 edges. All its users belong to the larger network's largest weakly connected component. The map displays the 164,291 authors eligible for the corrected analysis (at least three usable posts), with 782,974 connections between displayed authors. The stored field historically labelled full-network degree is weighted in-strength plus out-strength: retweets made plus received within the 202,710-author RetweetedOnce network. It counts repeated retweets and can include authors outside the displayed subset.

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


## Selecting authors

Topic and community legends are ordered by full-population author counts, largest first. Topic counts use the highest-weighted topic; they do not represent summed fuzzy membership. The combined long tail is labelled as such and sorted by its combined count.

Ticking legend entries selects their union. Selected authors remain highlighted when changing colour views or switching between 2D and 3D; unselected authors are dimmed. Returning to the source view restores its ticks. Ticking a group in a different categorical view starts a new selection, matching the other atlases; there are no hidden intersections or membership thresholds. Clear selection restores all authors. Reset and Fit control the camera only. Search and example posts remain available for all authors.

The topic palette matches the current light and dark figures. The five largest topics use orange, blue, magenta, yellow and green. Community, sentiment and emotion colours are unchanged. Labels, counts and selection provide alternatives to colour alone. Data, topic scores and network geometry are unchanged.

The map supports arrow-key pan or rotation, plus/minus zoom and Home to fit. Legend checkboxes and colour views support native keyboard controls.


## Additional lenses — 13 October 2026

The optional eight-topic lens reuses the approved `analysis-topic-corrected` model, the original grid runner-up: bigram TF-IDF, K=8, alpha=0.3, eta=0.01, seed=42, 50 iterations. It shares all 164,291 authors and the fitted document corpus with the twelve-topic default. The original automatic winner triggered the existing concentration review and is not offered. No model was fitted or promoted for this update. The twelve-topic default, its palette and the current figures remain unchanged. The best sample-grid candidates at K=16 and K=20 still require full-population fitting and review.

Alternative weights are joined by exact string author IDs and validated for uniqueness, complete coverage and probability sums. A topic selection records its source model and preserves the exact authors across model changes, all colour lenses and 2D/3D. Selecting a topic in another model replaces that selection. Category legends and membership pickers remain largest first. The colour inheritance rule below records directional author overlap, not identical topic meaning.

Followers and lifetime posts come from stored `AItrust_author_dict.json` public metrics. They are historical readings, not live measurements or necessarily observations on one common date. Repeated IDs retain the last stored row; source order is not assumed to be chronological. Missing counters remain missing, never zero. Posts analysed comes from the approved author topic table’s `n_tweets`: usable posts in each fitted author document, including retweets, under the existing cleaning and deduplication rules. It is distinct from lifetime account activity and classifier coverage.

Retweets sent and Retweets received are separate weighted counts in the full 202,710-author RetweetedOnce study network. The stored information-flow graph points from the original author to the retweeter: sent counts use incoming weights, received counts use outgoing weights. Repeated retweets count. These include authors outside the displayed subset, but do not cover all of Twitter or an account’s lifetime. Their sum equals the existing `fd` value for every displayed author. The graph contains 1,269,747 retweet events; total sent and received across all its authors each equal that number. Count colours use log(1+count), with exact minimum/midpoint/maximum tick values and coverage shown. Missing data is grey. Exact counters appear in the author detail panel. Optional payloads load on demand; failed loads leave the existing atlas usable.


## Colour refinement — 13 October 2026

For each eight-topic dominant-author group, divide its intersection with each twelve-topic dominant-author group by its own author count. Inherit the best-overlapping twelve-topic colour only when the fraction is strictly greater than 0.60, without rounding. Multiple groups can inherit one colour. Nonmatching groups use distinct saturated hues and ivory. `scripts/update_topic_colours.py` applies the rule reproducibly; the payload records the full cross-counts. Only palette metadata changes, never author memberships. Qualifying groups are research/industry (74.7665%), art/NFT posting (72.1269%), entertainment/memes (83.0285%), tools/writing/code (82.7035%) and artists’ objections (90.6096%). The previous 75% threshold is superseded.

For numeric lenses the grey missing-data key is shown only when records are missing, with the exact count. Zero is a valid observed value, not missing data.


The leading-topic-weight colour lens was removed at David’s request. Author detail topic scores remain available. Followers and lifetime posts have concise historical-count caveats beneath the legend; Retweets sent and Retweets received each have a short study-network scope note. Missing-data behaviour is unchanged.


The topic selector uses plain labels, “12 topics” and “8 topics”, without persistent status text. Loading and error messages appear only when needed. The two direction-specific retweet counts replace the combined colour lens. Both cover all displayed authors.
