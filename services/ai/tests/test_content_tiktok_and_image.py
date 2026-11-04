"""TikTok scripts and image suggestions in the content pack, written by the model and checked like every other copy."""
import json

from conftest import run_job
from src.app.schemas import Usage
from test_content_facebook import content_job, run

GROUNDED = "The guide compares living areas for newcomers."
FACEBOOK = {"hook": "Choosing a living area?", "body": f"• {GROUNDED}", "discussion_question": None, "hashtags": []}


class PackProvider:
    """Answers each structured call by the schema it was asked for."""
    model_version = "test/content"
    embedding_model_version = "test/embed"

    def __init__(self, tiktok):
        self.tiktok, self.calls = tiktok, []

    async def chat_json(self, *, schema, **kwargs):
        properties = schema.get("properties", {})
        self.calls.append(sorted(properties))
        if "scenes" in properties:
            return json.dumps(self.tiktok), Usage(llm_calls=1)
        draft = {"caption": "Living areas guide\n\nRequest the guide", "alt_text": "Living room photo"}
        if "facebook" in properties:
            draft["facebook"] = FACEBOOK
        return json.dumps(draft), Usage(llm_calls=1)


def script(hook="Choosing a living area?", voiceover=GROUNDED, scenes=3):
    return {"hook": hook, "scenes": [{"voiceover": voiceover, "visual": "Street view of a quiet area"} for _ in range(scenes)]}


def test_a_tiktok_target_gets_a_script_ending_on_the_exact_cta(client, make_client):
    _, job = content_job(client, channels=["tiktok"])
    result = run(make_client(provider=PackProvider(script()), provider_mode="live"), job)["result"]["result"]
    tiktok = result["tiktok"]
    assert tiktok["hook"] == "Choosing a living area?"
    assert [scene["voiceover"] for scene in tiktok["scenes"]] == [GROUNDED] * 3
    assert tiktok["cta"] == "Request the guide"
    assert tiktok["word_count"] == 4 + 3 * 7 + 3


def test_a_script_outside_the_spoken_length_is_flagged_for_the_reviewer(client, make_client):
    _, job = content_job(client, channels=["tiktok"])
    out = run(make_client(provider=PackProvider(script()), provider_mode="live"), job)["result"]
    assert out["result"]["tiktok"]["within_length"] is False
    assert "TIKTOK_SCRIPT_LENGTH:28" in out["warnings"]


def test_unsupported_and_broken_lines_do_not_reach_the_script(client, make_client):
    _, job = content_job(client, channels=["tiktok"])
    bad = {"hook": "Choosing a living area?", "scenes": [
        {"voiceover": GROUNDED, "visual": "Street view"},
        {"voiceover": "Modular furniture and rooftop gyms delight wealthy international tenants everywhere.", "visual": "Gym"},
        {"voiceover": "Newcomers compare living areas 机会", "visual": "Map"}]}
    tiktok = run(make_client(provider=PackProvider(bad), provider_mode="live"), job)["result"]["result"]["tiktok"]
    assert [scene["voiceover"] for scene in tiktok["scenes"]] == [GROUNDED]


def test_a_script_the_model_cannot_write_does_not_cost_the_pack(client, make_client):
    _, job = content_job(client, channels=["facebook", "tiktok"])
    out = run(make_client(provider=PackProvider({"wrong": "shape"}), provider_mode="live"), job)["result"]
    assert out["result"]["facebook"]["hook"] == "Choosing a living area?"
    assert out["result"]["tiktok"] is None
    assert any(w.startswith("TIKTOK_SCRIPT_SKIPPED") for w in out["warnings"])


def test_a_script_with_an_invented_number_is_skipped_not_failed(client, make_client):
    _, job = content_job(client, channels=["facebook", "tiktok"])
    # Every word but the number restates the source, so no sentence check removes it and the number check must catch it.
    invented = script(voiceover="The guide compares 300 living areas for newcomers.")
    out = run(make_client(provider=PackProvider(invented), provider_mode="live"), job)["result"]
    assert out["result"]["tiktok"] is None and any(w.startswith("TIKTOK_SCRIPT_SKIPPED") for w in out["warnings"])


def test_an_invented_line_goes_and_the_rest_of_the_script_stays(client, make_client):
    _, job = content_job(client, channels=["facebook", "tiktok"])
    invented = script(voiceover=f"{GROUNDED} Rent starts from 300 dollars a month for newcomers in living areas.")
    tiktok = run(make_client(provider=PackProvider(invented), provider_mode="live"), job)["result"]["result"]["tiktok"]
    assert [scene["voiceover"] for scene in tiktok["scenes"]] == [GROUNDED] * 3


def test_a_facebook_only_pack_does_not_spend_a_call_on_tiktok(client, make_client):
    _, job = content_job(client, channels=["facebook"])
    provider = PackProvider(script())
    result = run(make_client(provider=provider, provider_mode="live"), job)["result"]["result"]
    assert len(provider.calls) == 1 and result["tiktok"] is None


def test_a_post_without_an_approved_image_suggests_one(client, make_client):
    _, job = content_job(client, channels=["facebook"], assets=False)
    suggestion = run(make_client(provider=PackProvider(script()), provider_mode="live"), job)["result"]["result"]["image_suggestion"]
    assert suggestion["aspect_ratio"] == "1:1"
    assert suggestion["prompt"] or suggestion["reason"]
    assert suggestion["negative_prompt"] if suggestion["prompt"] else suggestion["status"] == "needs_assets"


def test_a_post_with_an_approved_image_needs_no_suggestion(client, make_client):
    _, job = content_job(client, channels=["facebook"], assets=True)
    assert run(make_client(provider=PackProvider(script()), provider_mode="live"), job)["result"]["result"]["image_suggestion"] is None


def test_a_facebook_only_pack_can_carry_a_script_without_waiting_on_video_assets(client, make_client):
    # Autopilot posts to Facebook alone: a TikTok target would hold the pack on needs_assets, the script alone must not.
    _, job = content_job(client, channels=["facebook"])
    job["payload"]["draft_tiktok_script"] = True
    result = run(make_client(provider=PackProvider(script()), provider_mode="live"), job)["result"]["result"]
    assert result["channels"] == ["facebook"]
    assert result["tiktok"]["cta"] == "Request the guide"
    assert result["status"] == "draft" and "approved_image_asset" not in result["missing_facts"]


def test_a_facebook_only_pack_gets_no_script_unless_asked(client, make_client):
    _, job = content_job(client, channels=["facebook"])
    provider = PackProvider(script())
    result = run(make_client(provider=provider, provider_mode="live"), job)["result"]["result"]
    assert result["tiktok"] is None and len(provider.calls) == 1


def test_the_script_is_skipped_when_a_slow_call_would_lose_the_post_at_the_job_deadline(client, make_client):
    _, job = content_job(client, channels=["facebook"])
    job["payload"]["draft_tiktok_script"] = True
    provider = PackProvider(script())
    out = run(make_client(provider=provider, provider_mode="live", provider_timeout_seconds=900), job)["result"]
    assert out["result"]["facebook"]["text"] and out["result"]["tiktok"] is None
    assert "TIKTOK_SCRIPT_SKIPPED:NOT_ENOUGH_TIME" in out["warnings"] and len(provider.calls) == 1


class SchemaKeeper(PackProvider):
    def __init__(self, tiktok):
        super().__init__(tiktok)
        self.script_schema = None

    async def chat_json(self, *, schema, **kwargs):
        if "scenes" in schema.get("properties", {}):
            self.script_schema = schema
        return await super().chat_json(schema=schema, **kwargs)


def test_the_model_is_held_to_four_full_scenes_while_it_writes(client, make_client):
    # Asking in the prompt gave 88-106 spoken words on real runs; the schema is enforced during generation.
    _, job = content_job(client, channels=["facebook"])
    job["payload"]["draft_tiktok_script"] = True
    provider = SchemaKeeper(script())
    run(make_client(provider=provider, provider_mode="live"), job)
    assert provider.script_schema["properties"]["scenes"]["minItems"] == 4
    scene = provider.script_schema["properties"]["scenes"]["items"]["$ref"].rsplit("/", 1)[1]
    assert provider.script_schema["$defs"][scene]["properties"]["voiceover"]["minLength"] >= 150


def test_a_shorter_answer_still_counts_as_a_script_and_is_flagged_by_length(client, make_client):
    _, job = content_job(client, channels=["facebook"])
    job["payload"]["draft_tiktok_script"] = True
    out = run(make_client(provider=PackProvider(script(scenes=2)), provider_mode="live"), job)["result"]
    assert len(out["result"]["tiktok"]["scenes"]) == 2 and out["result"]["tiktok"]["within_length"] is False
