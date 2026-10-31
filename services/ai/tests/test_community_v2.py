from uuid import uuid4
import pytest
from conftest import run_job
from examples.six_role_requests import mock_research_request, request


def test_community_vietnamese_retrieval_and_phone_extraction(client):
    base = mock_research_request()
    # Vietnamese question with intent word 'thuê' / 'tư vấn' and phone number
    vn_question = "Chào bạn, cho mình tư vấn căn hộ dịch vụ ở An Thượng Đà Nẵng để thuê dài hạn. SĐT mình là 0905123456."
    job = request(base, "community.response", {"question": vn_question})
    body = run_job(client, job)
    assert body["status"] == "completed"

    res = body["result"]["result"]
    assert res["status"] == "insufficient_data"  # Requires consent to persist lead
    assert res["escalation_required"] is True
    assert "verified_lead_owner_and_consent" in res["missing_facts"]
    assert res["lead_proposal"] is not None
    assert res["lead_proposal"]["intent"] == "request_information"
    assert res["lead_proposal"]["contact"]["phone"] == "0905123456"
    assert res["lead_proposal"]["persisted"] is False
    assert res["lead_proposal"]["requires_consent"] is True


def test_community_english_email_extraction(client):
    base = mock_research_request()
    en_question = "Hi TripC, looking for living areas suitable for expats. Please email me at mark.expat@tripc.org"
    job = request(base, "community.response", {"question": en_question})
    body = run_job(client, job)
    assert body["status"] == "completed"

    res = body["result"]["result"]
    assert res["lead_proposal"] is not None
    assert res["lead_proposal"]["contact"]["email"] == "mark.expat@tripc.org"
    assert res["lead_proposal"]["intent"] == "request_information"


def test_community_pure_informational_approved_draft(client):
    base = mock_research_request()
    # Non-sensitive informational question that matches living areas in mock research
    info_question = "Can you explain living areas in Da Nang?"
    job = request(base, "community.response", {"question": info_question})
    body = run_job(client, job)
    assert body["status"] == "completed"

    res = body["result"]["result"]
    assert res["status"] == "draft"
    assert res["escalation_required"] is False
    assert len(res["missing_facts"]) == 0
    assert len(res["citations"]) > 0
    assert res["lead_proposal"] is None
