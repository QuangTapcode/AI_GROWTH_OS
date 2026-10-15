import { httpError, httpOk } from '../../lib/http';
import { PlanError, submitCampaignPlan, type PlanRepository } from './service';

/** Router passes a workspace already authorized by auth + membership middleware. */
export function createCampaignPlanRoutes(deps: { repo: PlanRepository; allowSynthetic?: boolean }) {
  return {
    async handleSubmit(authorizedWorkspaceId: string, body: unknown) {
      try {
        const result = await submitCampaignPlan(deps, authorizedWorkspaceId, body);
        return httpOk(result.deduplicated ? 200 : 201, {
          plan_id: result.record.plan.plan_id, status: 'accepted', synthetic: result.record.plan.synthetic,
          deduplicated: result.deduplicated, task_states: result.record.task_states,
          outbox: result.record.outbox,
        });
      } catch (error) {
        if (error instanceof PlanError) return httpError(error.status, error.code, error.message);
        return httpError(500, 'PLAN_COMMIT_FAILED', 'Failed to commit campaign/tasks/outbox');
      }
    },
  };
}
