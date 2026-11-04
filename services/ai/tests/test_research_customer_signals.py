"""What customers asked may point Research at a need. It must not carry a person's contact details to the model."""
import json

from conftest import run_job
from examples.six_role_requests import mock_research_request
from src.app.schemas import Usage


class Provider:
    model_version = "test/research"
    embedding_model_version = "test/embed"

    def __init__(self):
        self.user = None

    async def chat_json(self, *, user, **kwargs):
        self.user = json.loads(user)
        excerpt = self.user["excerpts"][0]
        idea = {"topic": "Living areas for newcomers", "audience_fit": "Newcomers need an area.", "offer_fit": "The guide compares areas.",
                "rationale": "The excerpt compares living areas.", "chunk_id": excerpt["chunk_id"], "quote": excerpt["text"],
                "keywords": ["living areas"], "user_need": "Choose an area."}
        return json.dumps({"ideas": [idea]}), Usage(llm_calls=1)


def research(make_client, signals):
    job = mock_research_request()
    job["payload"]["customer_signals"] = signals
    provider = Provider()
    body = run_job(make_client(provider=provider, provider_mode="live"), job)
    assert body["status"] == "completed", body
    return provider.user, body["result"]


def test_customer_questions_reach_research_as_inquiries(make_client):
    user, _ = research(make_client, ["Which area is quiet for a family?"])
    assert user["customer_inquiries"] == ["Which area is quiet for a family?"]


def test_contact_details_never_reach_the_model(make_client):
    signals = ["Which area is quiet? call me 0905 123 456", "Family flat please, +84 905123456", "Send details to an.nguyen+trip@mail.example.vn"]
    user, result = research(make_client, signals)
    sent = json.dumps(user, ensure_ascii=False)
    for private in ("0905", "905123456", "an.nguyen", "mail.example"):
        assert private not in sent
    assert user["customer_inquiries"][0].startswith("Which area is quiet?")
    assert "0905" not in json.dumps(result, ensure_ascii=False)


def test_a_message_that_is_only_contact_details_says_nothing_about_demand(make_client):
    user, _ = research(make_client, ["0905123456", "an@mail.example.vn", "Which area is quiet?"])
    assert user["customer_inquiries"] == ["Which area is quiet?"]


def test_a_customer_signal_is_declared_untrusted_to_the_model():
    from src.agents.research.pipeline import SYSTEM_PROMPT
    untrusted = next(line for line in SYSTEM_PROMPT.splitlines() if "untrusted" in line)
    assert "customer_inquiries" in untrusted
