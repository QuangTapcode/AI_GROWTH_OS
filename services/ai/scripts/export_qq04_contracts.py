"""Regenerate QQ-04 schemas without claiming learning.analyze is implemented."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.agents.growth_lead.schemas import CampaignPlan, GrowthLeadPayload


def main():
    destination = ROOT.parents[1] / "contracts" / "schemas" / "ai-six-role-contracts.json"
    bundle = json.loads(destination.read_text(encoding="utf-8"))
    role = next(x for x in bundle["roles"] if x["role"] == "growth_lead")
    if "bootstrap_learning_contract" not in role:
        role["bootstrap_learning_contract"] = {"input_schema": role["input_schema"], "output_schema": role["output_schema"]}
    role["contract_status"] = "planning_implemented_awaiting_review_learning_bootstrap"
    role["input_schema"] = GrowthLeadPayload.model_json_schema()
    role["output_schema"] = CampaignPlan.model_json_schema()
    role["schema_operations"] = ["opportunity.score", "strategy.generate", "brief.generate"]
    for operation in role["schema_operations"]:
        role["runtime_status"][operation] = "dedicated"
    role["prompt_version"] = "growth-lead-v1"
    destination.write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Exported QQ-04: {destination}")


if __name__ == "__main__":
    main()
