"""Conservative lexical checks; semantic audience/offer fit still needs review."""
from ...rag.retrieval import terms

GENERIC = {"explore", "topic", "supplied", "target", "audience", "understand", "options", "decision", "information", "confirm", "offer", "preparing", "campaign", "guide", "local", "living", "tripc"}


def concepts(text):
    words = terms(text)
    words |= {w[:-1] for w in words if w.endswith('s') and len(w) > 4}
    for family in ({'housing', 'apartment', 'accommodation', 'rental', 'home'},
                   {'coworking', 'workspace', 'work', 'working'}):
        if words & family:
            words |= family
    return words


def quality_checks(idea, quote, profile):
    location = terms(" ".join(profile.locations))
    # Keywords cannot rescue a topic that its quote does not discuss.
    topic = concepts(idea.topic) - location - GENERIC
    evidence = concepts(quote)
    offer = terms(" ".join([*profile.products, *profile.services]).replace("_", " ")) - location
    return {
        "topic_supported_by_quote": bool(topic & evidence),
        "offer_matches_profile": bool(offer & terms(idea.offer_fit)),
        "specific_user_need": bool((terms(idea.user_need) - location - GENERIC) & (topic | evidence)),
        "audience_matches_profile": bool(terms(" ".join(profile.audiences)) & terms(idea.audience_fit)),
    }
