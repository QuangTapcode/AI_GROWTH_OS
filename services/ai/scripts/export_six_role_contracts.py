"""Export executable six-role contracts and exact prompt versions for QQ-01/08."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.app.operations import OPERATIONS
from src.app.schemas import JobRequest, AIResult
from src.agents.registry import ROLE_TOOLS
from src.agents.research.schemas import ResearchBrief
from src.agents.growth_lead.schemas import CampaignPlan
from src.agents.growth_lead.learning import LearningReport
from src.agents.seo.schemas import SeoArticle
from src.agents.content.schemas import SocialPack
from src.agents.community.schemas import CommunityReply
from src.agents.performance.schemas import PerformanceReport


def main():
    path = ROOT.parents[1] / "contracts/schemas/ai-six-role-contracts.json"
    bundle = json.loads(path.read_text(encoding="utf-8"))
    bundle["contract_version"] = "six-agent-implementation-2"
    bundle["review_status"] = "implemented_awaiting_independent_review"
    bundle["job_request_schema"] = JobRequest.model_json_schema()
    bundle["run_result_schema"] = AIResult.model_json_schema()
    outputs = dict(research=ResearchBrief, growth_lead=CampaignPlan, seo=SeoArticle,
                   content=SocialPack, community=CommunityReply, performance=PerformanceReport)
    for role in bundle["roles"]:
        operations = role["operations"]
        primary = OPERATIONS[operations[0]]
        role["contract_status"] = "implemented_awaiting_independent_review"
        role["input_schema"] = primary.payload_model.model_json_schema()
        role["output_schema"] = outputs[role["role"]].model_json_schema()
        role["allowed_tools"] = list(ROLE_TOOLS[role["role"]])
        role["runtime_status"] = {name: "dedicated" for name in operations}
        role["prompt_versions"] = {name: OPERATIONS[name].prompt_version for name in operations}
        role["prompt_version"] = primary.prompt_version
        role["schema_operations"] = [name for name in operations if name != "learning.analyze"]
        role.pop("bootstrap_learning_contract", None)
        if role["role"] == "growth_lead":
            role["learning_contract"] = {"input_schema": OPERATIONS["learning.analyze"].payload_model.model_json_schema(),
                                         "output_schema": LearningReport.model_json_schema()}
    path.write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Exported six dedicated role contracts")


if __name__ == "__main__":
    main()
