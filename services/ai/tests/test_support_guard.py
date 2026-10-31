from src.guardrails.support import strip_unsupported, unsupported_sentences

PASSAGE = ("Where you work should depend on what you need to do that day rather than on which environment looks most "
           "appealing. Your apartment, a coworking space and a café can all be useful, but they solve different problems. "
           "Home is usually the easiest option for routine work because it gives you control over your equipment, privacy "
           "and schedule.")


def test_embellishments_from_real_drafts_are_flagged_but_restatements_pass():
    draft = ("Home gives you control over your equipment, privacy and schedule for routine work. "
             "Modular furniture, tech compatibility, and comfort are key. "
             "Which space suits your day?")
    assert unsupported_sentences(draft, [PASSAGE]) == ["Modular furniture, tech compatibility, and comfort are key."]


def test_strip_keeps_structure_and_reports_removed_sentences():
    text = "## Working from home\nHome gives you control over your equipment and schedule. For example, quiet zones for concentration or collaborative areas for virtual teams."
    clean, removed = strip_unsupported(text, [PASSAGE])
    assert clean == "## Working from home\nHome gives you control over your equipment and schedule."
    assert removed == ["For example, quiet zones for concentration or collaborative areas for virtual teams."]


def test_short_sentences_and_questions_are_not_judged():
    assert unsupported_sentences("Book now. What do you need today?", [PASSAGE]) == []
