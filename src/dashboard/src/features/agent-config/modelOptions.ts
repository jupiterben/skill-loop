import { normalizeAgentModel } from "../../../../domain/agent-config";

export function buildModelOptions(
  models: { id: string; name: string }[],
  current: string | null,
  search: string
): { value: string; label: string }[] {
  const byId = new Map(models.map((model) => [model.id, {
    value: model.id,
    label: model.name === model.id ? model.id : `${model.name} (${model.id})`,
  }]));
  if (current && !byId.has(current)) byId.set(current, { value: current, label: current });
  const query = search.trim().toLowerCase();
  const options = [...byId.values()].filter((option) => option.label.toLowerCase().includes(query));
  try {
    const custom = normalizeAgentModel(search);
    if (custom && !byId.has(custom)) options.push({ value: custom, label: `使用自定义模型：${custom}` });
  } catch {
    // Invalid model IDs are not selectable.
  }
  return [{ value: "", label: "CLI 默认模型" }, ...options];
}
