"""Operator priorities are planning preferences, never evidence of market demand."""
import re
from urllib.parse import urlsplit
from .quality import concepts


def topic_alignment(text, profile):
    strategy = profile.research_strategy
    if not strategy:
        return None
    words = concepts(text) - concepts(' '.join(profile.locations))
    matches = []
    for index, topic in enumerate(strategy.topics):
        # Match query terms, not broad marketing titles such as "Vietnam".
        wanted = concepts(' '.join(topic.query_terms))
        overlap = len(words & wanted)
        if overlap:
            matches.append((overlap / max(len(wanted), 1), int(topic.priority == 'high'), -index, topic))
    if not matches:
        return None
    topic = max(matches, key=lambda row: row[:3])[3]
    return {'topic_id': topic.id, 'title': topic.title, 'priority': topic.priority,
            'journey_stage': topic.journey_stage, 'objective_metrics': topic.objective_metrics,
            'verification': topic.verification, 'basis': 'operator_strategy_not_measured_demand'}


def priority_order(alignment):
    return 0 if alignment and alignment['priority'] == 'high' else 1 if alignment else 2


def strategy_missing_data(idea, profile, source_url):
    if not profile.research_strategy:
        return []
    narrative = ' '.join([idea.topic, idea.user_need, idea.offer_fit, idea.rationale])
    missing = []
    sensitive = re.search(r'\b(visa|residency|immigration|banking|bank account|medical|healthcare|legal|work permit)\b', narrative, re.I)
    host = (urlsplit(source_url).hostname or '').lower()
    if sensitive and not (host.endswith('.gov.vn') or host.endswith('.gov')):
        missing.append('official_source_required')
    if re.search(r'\b(upcoming event|this weekend|today|tomorrow|currently running)\b', narrative, re.I):
        missing.append('current_event_details_require_review')
    offer = idea.offer_fit.lower()
    capabilities = ' '.join([*profile.products, *profile.services]).replace('_', ' ').lower()
    for service in ('airport transfer', 'visa service', 'bank account opening', 'pet relocation'):
        if service in offer and service not in capabilities:
            missing.append('confirmed_service_capability_required')
    return sorted(set(missing))
