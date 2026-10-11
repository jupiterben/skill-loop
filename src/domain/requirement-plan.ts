export interface RequirementPlanJob {
  id: string;
  requirement: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  output: string;
  error: string | null;
  stories: { id: string; title: string; parentId: string | null; featureTitle: string }[];
  features: { id: string; title: string }[];
}
