import { memo, useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Input, Popconfirm, Segmented, Select, Tooltip } from "antd";
import { ArrowRightOutlined, CheckCircleOutlined, EditOutlined, PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { Feature, Milestone, SelectedMindMapNode } from "../../types";
import { api } from "../../lib/api";
import { STORY_WORK_TYPE_OPTIONS } from "../story-work-type/storyWorkType";
import {
  buildRequirementInput, emptyRequirementDraft, parseRequirementDraft,
  requirementDraftKey, type RequirementDraft,
} from "./requirementDraft";

interface Props {
  projectKey: string;
  features: Feature[];
  milestones: Milestone[];
  onRefresh: () => Promise<void>;
  onLocate: (node: SelectedMindMapNode) => void;
}

export const RequirementComposer = memo(function RequirementComposer({
  projectKey, features, milestones, onRefresh, onLocate,
}: Props) {
  const storageKey = requirementDraftKey(projectKey);
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return { draft: parseRequirementDraft(raw), status: raw ? "草稿已恢复" : "新草稿", error: null };
    } catch {
      return { draft: emptyRequirementDraft(), status: "未保存到本机", error: "无法读取本机草稿，原记录未覆盖" };
    }
  });
  const [draft, setDraft] = useState(initial.draft);
  const [saveStatus, setSaveStatus] = useState(initial.status);
  const [storageError, setStorageError] = useState<string | null>(initial.error);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<SelectedMindMapNode | null>(null);
  const submitting = useRef(false);
  const titleRef = useRef<import("antd").InputRef>(null);
  const dirty = Boolean(draft.title || draft.description || draft.acceptanceCriteria);

  useEffect(() => {
    if (created && !busy) titleRef.current?.focus();
  }, [created, busy]);

  function persist(next: RequirementDraft) {
    setDraft(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaveStatus("已保存到本机");
      setStorageError(null);
    } catch {
      setSaveStatus("未保存到本机");
      setStorageError("本机存储不可用，关闭页面前请先提交需求");
    }
  }

  function update(patch: Partial<RequirementDraft>) {
    persist({ ...draft, ...patch });
    setError(null);
    setCreated(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    let request: ReturnType<typeof buildRequirementInput>;
    try {
      request = buildRequirementInput(draft, features, milestones);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (!draft.title.trim()) titleRef.current?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const result = request.kind === "story"
        ? await api.addStory(request.input)
        : await api.addFeature(request.input);
      const node = result[request.kind] as { id: string };
      setCreated({ id: node.id, kind: request.kind === "story" ? "draft" : "feature" });
      persist({ ...draft, title: "", description: "", acceptanceCriteria: "" });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <aside className="requirement-composer" aria-label="需求输入工作区">
      <header className="requirement-composer__header">
        <span className="requirement-composer__icon"><EditOutlined /></span>
        <h2>需求输入</h2>
        <span className="requirement-composer__save" role="status">{saveStatus}</span>
      </header>
      <form className="requirement-composer__form" onSubmit={(event) => void submit(event)}>
        <div className="requirement-composer__mode">
          <Segmented
            aria-label="需求类型"
            options={["Story", "Feature"]}
            value={draft.kind === "story" ? "Story" : "Feature"}
            onChange={(value) => update({ kind: value === "Story" ? "story" : "feature" })}
            disabled={busy}
          />
          <Popconfirm
            title="清空当前草稿？"
            description="尚未提交的内容将被清空。"
            okText="清空" cancelText="取消"
            onConfirm={() => {
              persist(emptyRequirementDraft());
              setCreated(null);
              setError(null);
              titleRef.current?.focus();
            }}
          >
            <Tooltip title="清空草稿">
              <Button type="text" aria-label="清空草稿" icon={<DeleteOutlined />} disabled={busy || !dirty} />
            </Tooltip>
          </Popconfirm>
        </div>
        <div className="requirement-composer__fields">
          <div className="requirement-composer__field">
            <label htmlFor="requirement-title">需求标题 <span aria-hidden="true">*</span></label>
            <Input
              id="requirement-title" ref={titleRef} value={draft.title}
              placeholder="要完成什么？" autoComplete="off"
              onChange={(event) => update({ title: event.target.value })}
              disabled={busy} aria-required="true"
              aria-invalid={Boolean(error && !draft.title.trim())}
            />
          </div>
          <div className="requirement-composer__field requirement-composer__description">
            <label htmlFor="requirement-description">需求描述</label>
            <Input.TextArea
              id="requirement-description" value={draft.description}
              placeholder="背景、目标，以及你期望的结果…"
              onChange={(event) => update({ description: event.target.value })}
              disabled={busy}
            />
          </div>
          <div className="requirement-composer__field">
            <label htmlFor="requirement-parent">所属 Feature</label>
            <Select
              id="requirement-parent" aria-label="所属 Feature"
              showSearch optionFilterProp="label"
              value={draft.parentId} disabled={busy}
              onChange={(parentId) => update({ parentId })}
              options={[
                { value: "", label: "项目根目录" },
                ...features.map((feature) => ({ value: feature.id, label: `${feature.id} · ${feature.title}` })),
              ]}
            />
          </div>
          {draft.kind === "story" && (
            <details className="requirement-composer__details">
              <summary>验收与安排 <span>{draft.acceptanceCriteria.trim() ? "已填写" : "可选"}</span></summary>
              <div className="requirement-composer__field">
                <label htmlFor="requirement-ac">验收标准</label>
                <Input.TextArea
                  id="requirement-ac" rows={3} value={draft.acceptanceCriteria}
                  placeholder="每行一条验收标准"
                  onChange={(event) => update({ acceptanceCriteria: event.target.value })}
                  disabled={busy}
                />
              </div>
              <div className="requirement-composer__field">
                <label htmlFor="requirement-work-type">工作类型</label>
                <Select
                  id="requirement-work-type" aria-label="工作类型" value={draft.workType}
                  options={STORY_WORK_TYPE_OPTIONS} disabled={busy}
                  onChange={(workType) => update({ workType })}
                />
              </div>
              <div className="requirement-composer__field">
                <label htmlFor="requirement-milestone">Milestone</label>
                <Select
                  id="requirement-milestone" aria-label="Milestone" value={draft.milestoneId}
                  options={[{ value: "", label: "未安排" }, ...milestones.map((m) => ({ value: m.id, label: m.title }))]}
                  disabled={busy} onChange={(milestoneId) => update({ milestoneId })}
                />
              </div>
            </details>
          )}
        </div>
        <footer className="requirement-composer__footer">
          <div className="requirement-composer__feedback" aria-live="polite">
            {error || storageError ? (
              <span className="requirement-composer__error" role="alert">{error ?? storageError}</span>
            ) : created ? (
              <span className="requirement-composer__success">
                <CheckCircleOutlined /> 已创建 {created.id}
                <Button type="link" size="small" onClick={() => onLocate(created)} icon={<ArrowRightOutlined />}>查看</Button>
              </span>
            ) : (
              <span>{draft.kind === "story" ? "提交为草稿 · 待确认后执行" : "提交为 Feature"}</span>
            )}
          </div>
          <Button type="primary" htmlType="submit" block icon={<PlusOutlined />} loading={busy}>
            {draft.kind === "story" ? "创建 Story 草稿" : "创建 Feature"}
          </Button>
        </footer>
      </form>
    </aside>
  );
});
