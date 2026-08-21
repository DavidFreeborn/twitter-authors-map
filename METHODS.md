# Methods

## Network and displayed authors

The map contains all 198,326 authors that have both a saved network position and
topic, sentiment and emotion annotations. The full directed network contains
1,984,599 authors and 4,472,376 retweet, reply and quote connections. Positions
were previously calculated with igraph's Distributed Recursive Layout from the
853,133 connections whose endpoints are both in the displayed subset.

The saved coordinates in `data/nodes.json` are fixed. Topic, sentiment,
emotion, labels and interface metadata do not affect node inclusion or position.
Edges determine layout but are not rendered.

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

The click panel shows only author ID, the presentation-only short community
name, full-network degree, the three stored sentiment scores, all 11 stored
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
