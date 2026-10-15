import { AppError } from "@/lib/errors";
import { AuthUser } from "@/lib/auth";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import {
  createWorkflowTaskSchema,
  updateTaskStatusSchema,
  createArtifactSchema,
  CreateWorkflowTaskInput,
  UpdateTaskStatusInput,
  CreateArtifactInput,
} from "./schemas";
import * as repo from "./repository";

export async function createWorkspaceTask(
  user: AuthUser,
  workspaceId: string,
  rawInput: unknown
) {
  // Chỉ Owner và Editor được enqueue task mới (Viewer bị chặn 403)
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor"]);

  const parseResult = createWorkflowTaskSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid workflow task payload", fieldErrors);
  }

  const input: CreateWorkflowTaskInput = parseResult.data;

  // Xác thực các task dependency: Nếu có dependency, chúng phải tồn tại và thuộc cùng workspace này
  if (input.dependencies && input.dependencies.length > 0) {
    for (const depId of input.dependencies) {
      const parentTask = await repo.getTaskById(workspaceId, depId);
      if (!parentTask) {
        throw new AppError(
          422,
          "INVALID_DEPENDENCY",
          `Dependent task '${depId}' does not exist in this workspace`
        );
      }
    }
  }

  const task = await repo.createTaskWithDependencies(workspaceId, input);
  return task;
}

export async function listWorkspaceTasks(
  user: AuthUser,
  workspaceId: string,
  filters?: { role?: string; status?: string; campaign_id?: string }
) {
  // Mọi thành viên (owner, editor, viewer) trong workspace đều được xem danh sách task
  await resolveTenantContext(user, workspaceId);
  const items = await repo.listTasks(workspaceId, filters);
  return { items };
}

export async function getWorkspaceTaskDetail(
  user: AuthUser,
  workspaceId: string,
  taskId: string
) {
  await resolveTenantContext(user, workspaceId);
  const task = await repo.getTaskById(workspaceId, taskId);
  if (!task) {
    throw new AppError(404, "NOT_FOUND", "Workflow task not found");
  }
  return task;
}

export async function updateWorkspaceTaskStatus(
  user: AuthUser,
  workspaceId: string,
  taskId: string,
  rawInput: unknown
) {
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor"]);

  const parseResult = updateTaskStatusSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid task status update payload", fieldErrors);
  }

  const existingTask = await repo.getTaskById(workspaceId, taskId);
  if (!existingTask) {
    throw new AppError(404, "NOT_FOUND", "Workflow task not found");
  }

  const updatedTask = await repo.updateTaskStatus(workspaceId, taskId, parseResult.data);
  return updatedTask;
}

export async function createWorkspaceArtifact(
  user: AuthUser,
  workspaceId: string,
  rawInput: unknown
) {
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor"]);

  const parseResult = createArtifactSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid artifact payload", fieldErrors);
  }

  const input: CreateArtifactInput = parseResult.data;

  // Nếu artifact gắn với task_id, kiểm tra task có thuộc workspace này không
  if (input.task_id) {
    const linkedTask = await repo.getTaskById(workspaceId, input.task_id);
    if (!linkedTask) {
      throw new AppError(422, "INVALID_TASK_REF", `Referenced task '${input.task_id}' does not exist in this workspace`);
    }
  }

  const artifact = await repo.createArtifact(workspaceId, input);
  return artifact;
}

export async function listWorkspaceArtifacts(
  user: AuthUser,
  workspaceId: string,
  filters?: { role?: string; artifact_type?: string }
) {
  await resolveTenantContext(user, workspaceId);
  const items = await repo.listArtifacts(workspaceId, filters);
  return { items };
}

export async function getWorkspaceArtifactDetail(
  user: AuthUser,
  workspaceId: string,
  artifactId: string
) {
  await resolveTenantContext(user, workspaceId);
  const artifact = await repo.getArtifactById(workspaceId, artifactId);
  if (!artifact) {
    throw new AppError(404, "NOT_FOUND", "Artifact not found");
  }
  return artifact;
}
