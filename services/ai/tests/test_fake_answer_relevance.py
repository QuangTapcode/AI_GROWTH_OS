from src.rag.answer import _extractive_fake, INSUFFICIENT
from src.rag.retrieval import ScoredChunk
from src.app.schemas import SnapshotSource, SnapshotChunk
from examples.growth_lead_request import mock_research_request


def selected():
    source = SnapshotSource.model_validate(mock_research_request()['payload']['snapshot']['sources'][0])
    source.title = 'Example Residence'
    text = 'Example Residence is an apartment building. Units are fully furnished apartments with a kitchenette and work desk.'
    return [ScoredChunk(source, SnapshotChunk(chunk_id='test', text=text), 1.0)]


def test_entity_name_does_not_answer_an_unsupported_amenity():
    assert _extractive_fake('Does Example Residence have a swimming pool?', selected(), ['c1']) == {'answer': INSUFFICIENT, 'cited_chunk_ids': []}


def test_fake_selects_information_need_instead_of_entity_introduction():
    answer = _extractive_fake('What comes with the apartments at Example Residence?', selected(), ['c1'])
    assert 'furnished' in answer['answer'] and answer['cited_chunk_ids'] == ['c1']
