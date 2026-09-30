import { describe, expect, it } from "vitest";
import { buildModelOptions } from "./modelOptions";

describe("model dropdown options", () => {
  const models = [{ id: "model-one", name: "Model One" }, { id: "model-two", name: "Model Two" }];
  it("lists readable names and IDs plus the CLI default", () => {
    expect(buildModelOptions(models, null, "")).toEqual([
      { value: "", label: "CLI 默认模型" },
      { value: "model-one", label: "Model One (model-one)" },
      { value: "model-two", label: "Model Two (model-two)" },
    ]);
  });
  it("filters by name or ID and preserves an existing custom model", () => {
    expect(buildModelOptions(models, "saved-custom", "").map((o) => o.value))
      .toContain("saved-custom");
    expect(buildModelOptions(models, null, "MODEL ONE").map((o) => o.value))
      .toEqual(["", "model-one"]);
  });
  it("allows valid custom IDs without duplicates, but rejects shell expressions", () => {
    expect(buildModelOptions(models, null, "custom/model").at(-1)?.value).toBe("custom/model");
    expect(buildModelOptions(models, "model-one", "model-one")).toHaveLength(2);
    expect(buildModelOptions(models, null, "foo & echo secret")).toEqual([{ value: "", label: "CLI 默认模型" }]);
  });
});
