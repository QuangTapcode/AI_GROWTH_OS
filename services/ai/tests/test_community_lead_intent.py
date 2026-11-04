"""A lead is proposed only when the customer asks for one: an unattended cycle saves what is proposed here."""
import pytest

from conftest import run_job
from examples.six_role_requests import mock_research_request, request


def proposal(make_client, question):
    job = request(mock_research_request(), "community.response", {"question": question})
    body = run_job(make_client(), job)
    assert body["status"] == "completed", body
    return body["result"]["result"]["lead_proposal"]


@pytest.mark.parametrize("question", [
    "Nhà hàng nào ở Đà Nẵng ngon?",
    "Quán cà phê nào được đánh giá tốt?",
    "Is it possible to find a quiet cafe in Da Nang?",
    "Which area is different from An Thuong for food?",
    "Does TripC have a Facebook page about food?",
    "What is the current weather like?",
])
def test_a_word_inside_another_word_is_not_a_request(make_client, question):
    assert proposal(make_client, question) is None


@pytest.mark.parametrize("question", [
    "Thuê căn hộ ở Đà Nẵng thì nên chọn khu nào?",
    "Tìm nhà ở An Thượng được không?",
    "Giá phòng bao nhiêu vậy?",
    "Ib mình nhé",
    "I want to book a room",
    "Is there a rental near the beach?",
    "Can I contact someone about apartments?",
    "I need a consultation",
])
def test_a_customer_asking_to_rent_book_or_be_contacted_is_a_lead(make_client, question):
    assert proposal(make_client, question)["intent"] == "request_information"
