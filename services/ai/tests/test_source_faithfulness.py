"""Every word of a sentence can be in the sources while the claim is not: listings put a venue and a dish side by side."""
import json

from conftest import run_job
from examples.six_role_requests import artifact_input, mock_research_request, request
from src.app.schemas import Usage
from src.guardrails.support import strip_unfaithful

# Shaped like the real Wikivoyage chunks: numbered entries in one paragraph, with blank-line sections.
LISTING = ("16 Quán Thảo, 135 Dương Trí Trạch, An Hải Bắc. Known for bún bò Huế with fresh herbs. "
           "17 Quán Dung Mỳ Quảng, 99 Nguyễn Thị Định. Well known for mì quảng cá lóc with peanuts.\n\n"
           "Downtown\n\n1 Phở 29, 1A Trần Quốc Toản. Bun cha and banh xeo with huge portions.")
PLACES = ["Da Nang"]


def kept(sentence, passages=LISTING, common=PLACES):
    clean, removed = strip_unfaithful(sentence, [passages], common)
    assert (clean == sentence) == (not removed)
    return not removed


def test_a_venue_tied_to_the_dish_of_another_entry_is_removed():
    assert not kept("Quán Thảo serves mì quảng cá lóc with peanuts.")


def test_a_venue_with_its_own_dish_stays():
    assert kept("Quán Thảo is known for bún bò Huế with fresh herbs.")
    assert kept("Quán Dung Mỳ Quảng serves mì quảng cá lóc.")


def test_the_mixup_is_found_without_diacritics_too():
    assert not kept("Quan Thao serves mi quang ca loc.")


def test_a_plain_list_of_names_claims_nothing_about_each_other():
    assert kept("Try Quán Thảo, Phở 29 and Quán Dung Mỳ Quảng.")


def test_the_last_name_of_a_list_is_still_checked_against_its_claim():
    assert not kept("Try Phở 29, Quán Dung Mỳ Quảng and Quán Thảo for mì quảng cá lóc.")


def test_a_place_the_whole_business_serves_can_sit_beside_any_venue():
    assert kept("Quán Thảo is in Da Nang.")


def test_a_name_the_sources_never_mention_is_left_to_the_other_checks():
    assert kept("Visit Quán Thảo with Madame Lan.")


def test_sentences_without_two_names_are_not_touched():
    assert kept("Quán Thảo has fresh herbs.")
    assert kept("Compare the options before you go.")


def test_a_single_source_entry_cannot_mix_anything_up():
    assert kept("Bún bò Huế is what Quán Thảo is known for.", "16 Quán Thảo. Known for bún bò Huế.")


def test_a_name_on_most_entries_is_too_general_to_tie_a_claim_to_one_entry():
    entries = "16 Quán Một. A small kitchen.\n17 Quán Hai. Noodles of Huế.\n18 Quán Ba. Noodles of Huế.\n19 Quán Bốn. Noodles of Huế."
    assert kept("Quán Một has the noodles of Huế.", entries)
    assert not kept("Quán Một has the noodles of Quán Hai.", entries)


def test_praise_the_sources_do_not_give_is_removed():
    assert not kept("Quán Thảo is a hidden gem with fresh herbs.")
    assert not kept("Bún bò Huế here is a must-try dish.")


def test_praise_the_sources_do_give_stays():
    assert kept("Quán Thảo is a hidden gem.", "16 Quán Thảo. A hidden gem in An Hải Bắc.")


def test_only_the_unfaithful_sentence_goes_and_the_lines_stay():
    text = "Quán Thảo has fresh herbs. Quán Thảo serves mì quảng cá lóc.\nPhở 29 has huge portions."
    clean, removed = strip_unfaithful(text, [LISTING], PLACES)
    assert clean == "Quán Thảo has fresh herbs.\nPhở 29 has huge portions."
    assert removed == ["Quán Thảo serves mì quảng cá lóc."]


# Through the pipelines: nothing the reviewer or a reader sees may carry the mix-up.
LISTED = ("16 Quán Thảo, living areas for newcomers. Known for bún bò Huế with fresh herbs. "
          "17 Quán Dung, living areas for newcomers. Known for mì quảng with peanuts.")
TRUE = "Quán Thảo is known for bún bò Huế with fresh herbs."
MIXED = "Quán Thảo is known for mì quảng with peanuts."
CTA = "Request the guide"


class Writer:
    """Answers each structured call by the schema it was asked for."""
    model_version = "test/writer"
    embedding_model_version = "test/embed"

    def __init__(self, seo_body=TRUE, hook="Quán Thảo for bún bò Huế", body=TRUE, voiceover=TRUE, script_hook="Quán Thảo for bún bò Huế"):
        self.seo_body, self.hook, self.body, self.voiceover, self.script_hook = seo_body, hook, body, voiceover, script_hook

    async def chat_json(self, *, schema, **kwargs):
        properties = schema.get("properties", {})
        if "sections" in properties:
            sections = [{"heading": "Where to eat", "body": self.seo_body}, {"heading": "Next steps", "body": TRUE}]
            answer = {"title": "Living areas guide", "meta_description": "A cited guide to living areas.", "sections": sections}
        elif "scenes" in properties:
            answer = {"hook": self.script_hook, "scenes": [{"voiceover": self.voiceover, "visual": "Street stall"}]}
        else:
            answer = {"caption": f"Living areas guide\n\n{CTA}", "alt_text": "Noodle soup"}
            if "facebook" in properties:
                answer["facebook"] = {"hook": self.hook, "body": self.body, "discussion_question": None, "hashtags": []}
        return json.dumps(answer), Usage(llm_calls=1)


def run_chain(client, make_client, writer, channels=("facebook",)):
    base = mock_research_request()
    base["payload"]["snapshot"]["sources"][0]["chunks"].append({"chunk_id": "listing", "text": LISTED, "locator": "mock:listing"})
    research = run_job(client, base)["result"]
    live = make_client(provider=writer, provider_mode="live")
    seo = run_job(live, {**request(base, "seo.local_draft", {"research": artifact_input(research), "cta": CTA}),
                         "constraints": {"timeout_seconds": 600}})["result"]
    payload = {"source_article": artifact_input(seo), "cta": CTA, "target_channels": list(channels)}
    pack = run_job(live, {**request(base, "content.repurpose", payload), "constraints": {"timeout_seconds": 600}})
    return seo, pack


def test_the_article_loses_a_sentence_tying_a_venue_to_another_entrys_dish(client, make_client):
    seo, _ = run_chain(client, make_client, Writer(seo_body=f"{TRUE} {MIXED}"))
    assert TRUE in seo["result"]["body_markdown"] and MIXED not in seo["result"]["body_markdown"]


def test_the_post_loses_the_mixed_up_sentence(client, make_client):
    _, pack = run_chain(client, make_client, Writer(body=f"{TRUE}\n{MIXED}"))
    text = pack["result"]["result"]["facebook"]["text"]
    assert TRUE in text and MIXED not in text


def test_a_mixed_up_hook_gives_way_to_the_first_line_the_sources_support(client, make_client):
    _, pack = run_chain(client, make_client, Writer(hook=MIXED, body=f"• {TRUE}\nQuán Dung is known for mì quảng with peanuts."))
    facebook = pack["result"]["result"]["facebook"]
    assert facebook["hook"] == TRUE and MIXED not in facebook["text"]
    assert facebook["body"] == "Quán Dung is known for mì quảng with peanuts."


def test_the_spoken_script_loses_the_mixed_up_line_and_hook(client, make_client):
    _, pack = run_chain(client, make_client, Writer(voiceover=f"{TRUE} {MIXED}", script_hook=MIXED), channels=("tiktok",))
    script = pack["result"]["result"]["tiktok"]
    assert script["scenes"][0]["voiceover"] == TRUE and script["hook"] == "Living areas guide"


class Reader(Writer):
    """Keeps what each kind of copy was given to read."""

    def __init__(self, title="Quán Thảo living areas guide"):
        super().__init__()
        self.title, self.read = title, {}

    async def chat_json(self, *, schema, user, **kwargs):
        properties = schema.get("properties", {})
        kind = "seo" if "sections" in properties else "script" if "scenes" in properties else "post"
        self.read[kind] = json.loads(user)
        content, usage = await super().chat_json(schema=schema, user=user, **kwargs)
        if kind == "seo":
            content = json.dumps({**json.loads(content), "title": self.title})
        return content, usage


def read_by_content(client, make_client, writer, listing):
    base = mock_research_request()
    base["payload"]["snapshot"]["sources"][0]["chunks"].append({"chunk_id": "listing", "text": listing, "locator": "mock:listing"})
    research = run_job(client, base)["result"]
    live = make_client(provider=writer, provider_mode="live")
    seo = run_job(live, {**request(base, "seo.local_draft", {"research": artifact_input(research), "cta": CTA}),
                         "constraints": {"timeout_seconds": 600}})["result"]
    payload = {"source_article": artifact_input(seo), "cta": CTA, "target_channels": ["facebook"], "draft_tiktok_script": True}
    writer.pack = run_job(live, {**request(base, "content.repurpose", payload), "constraints": {"timeout_seconds": 600}})["result"]["result"]
    return writer.read


# Real run: an article about one restaurant, and a post about the café and taco stall listed beside it.
PAGE = ("16 Quán Thảo, living areas for newcomers. Known for bún bò Huế with fresh herbs. "
        "17 Taco Ngon. Small taco stall with warm tortillas.")


def test_the_post_and_the_script_are_written_from_the_entries_about_the_article(client, make_client):
    read = read_by_content(client, make_client, Reader(), PAGE)
    for kind in ("post", "script"):
        assert "bún bò Huế" in read[kind]["source_passage"] and "Taco Ngon" not in read[kind]["source_passage"]


def test_a_title_no_entry_is_about_leaves_the_whole_passage(client, make_client):
    read = read_by_content(client, make_client, Reader(title="Choosing where to settle"), PAGE)
    assert "Taco Ngon" in read["post"]["source_passage"]


# Real script on Thìa Gỗ: "banh mi and spring rolls" and "the broth is rich" came from nowhere it was given. Their words are
# all over the neighbouring entries, so a check against every cited source lets them through.
NEIGHBOURS = ("16 Quán Thảo, living areas for newcomers. Known for bún bò Huế with fresh herbs. "
              "17 Taco Ngon. Rich broth, smooth noodles, spring rolls and banh mi from local ingredients with care.")
PADDED = "Their rich broth and smooth noodles come with spring rolls and banh mi from local ingredients."


def test_a_detail_neither_the_entry_nor_the_article_gives_is_removed_from_the_post(client, make_client):
    writer = Reader()
    writer.body = f"{TRUE}\n{PADDED}"
    read_by_content(client, make_client, writer, NEIGHBOURS)
    text = writer.pack["facebook"]["text"]
    assert TRUE in text and PADDED not in text


def test_a_detail_neither_the_entry_nor_the_article_gives_is_removed_from_the_script(client, make_client):
    writer = Reader()
    writer.voiceover = f"{TRUE} {PADDED}"
    read_by_content(client, make_client, writer, NEIGHBOURS)
    assert writer.pack["tiktok"]["scenes"][0]["voiceover"] == TRUE


def test_a_line_restating_the_article_stays_though_the_source_words_it_differently(client, make_client):
    writer = Reader()
    writer.seo_body = f"{TRUE} Newcomers find these living areas quiet and easy to walk around in every season."
    writer.body = f"{TRUE}\nNewcomers find these living areas quiet and easy to walk around."
    read_by_content(client, make_client, writer, NEIGHBOURS)
    assert "easy to walk around" in writer.pack["facebook"]["text"]
