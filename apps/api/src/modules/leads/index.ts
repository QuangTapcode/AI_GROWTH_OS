export { createLeadRoutes, getHeader, type LeadRoutes, type PublicHttpRequest } from './routes';
export { submitLead, type SubmitLeadDeps, type SubmitLeadResult, type SubmitLeadRequest } from './service';
export {
  InMemoryLeadRepository,
  newSubmissionId,
  type LeadRecord,
  type LeadRepository,
  type LeadTransaction,
} from './repository';
export {
  createLeadBodySchema,
  leadConsentSchema,
  leadContextSchema,
  idempotencyKeySchema,
  type CreateLeadBody,
  type LeadContext,
} from './schemas';