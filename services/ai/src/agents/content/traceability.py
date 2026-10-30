"""Sentence-to-fact traceability for a Facebook post (SocialPack v2, CM-07/CM-08).

The model writes the post; this links every claim in it back to the cited quotes
the post may state, so a reviewer can check each sentence against its source.
"""
import re

from .fact_mapper import auto_associate_facts, check_factual_entailment, check_zero_claim, split_vietnamese_sentences
from .social_pack_v2 import FactItem, SentenceMap

UNMAPPED = "f_unmapped"
BULLET = re.compile(r"^\s*(?:[-*•✅]\s*)+")


def cited_facts(evidence):
    """One fact per distinct cited quote (f01, f02...): the only facts a post may state."""
    quotes = list(dict.fromkeys(e.quote.strip() for e in evidence if e.quote and e.quote.strip()))
    return [FactItem(fact_id=f"f{i:02d}", text=quote[:1000], source_type="citation") for i, quote in enumerate(quotes, 1)]


def _sentences(text):
    # The shared splitter joins lines, so split per line first and drop bullet markers.
    for line in text.splitlines():
        line = BULLET.sub("", line).strip()
        if line:
            yield from (s for s in split_vietnamese_sentences(line) if s.strip())


def sentence_fact_map(post, facts):
    """Hook and CTA must carry no claim; each body sentence is linked to the facts it restates."""
    facts_map = {f.fact_id: f for f in facts}
    rows = []
    for kind, part in (("hook", post.hook), ("factual", post.body), ("cta", post.cta)):
        for sentence in _sentences(part):
            if kind == "factual":
                ids = auto_associate_facts(sentence, facts_map) or [UNMAPPED]
                status, _ = check_factual_entailment(sentence, ids, facts_map)
                fact_id = ids
            else:
                compliant, _ = check_zero_claim(sentence, kind)
                status, fact_id = ("supported" if compliant else "unsupported"), ("SYSTEM_CTA" if kind == "cta" else "NONE")
            rows.append(SentenceMap(sentence_index=len(rows), text=sentence, sentence_type=kind,
                                    fact_id=fact_id, entailment_status=status))
    return rows
