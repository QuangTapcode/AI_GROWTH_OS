export type StatusVariant =
  | "approved"
  | "processing"
  | "imported"
  | "needs-review"
  | "active"
  | "pending"
  | "inactive";

export interface PaginationParams {
  page: number;
  pageSize: number;
  total: number;
}
