import { useEffect, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Select, Space, Switch, Tag, Tooltip } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, RobotOutlined, SaveOutlined } from "@ant-design/icons";
import { isAgentToolInstalled, type RunTool } from "../../../../domain/run-tool";
import { agentProfileLabel, normalizeAgentModel } from "../../../../domain/agent-config";
import type { AgentConfig, AgentProfile } from "../../types";
import { api } from "../../lib/api";
import { buildModelOptions } from "./modelOptions";

type Draft = Omit<AgentProfile, "id"> & { id?: string };

export function AgentConfigPanel({ config, onRefresh, installedTools = [] }: {
  config: AgentConfig;
  onRefresh: () => Promise<void>;
  installedTools?: RunTool[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [modelCatalog, setModelCatalog] = useState<{
    tool: string;
    models: { id: string; name: string }[];
    warning?: string;
  } | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const editingTool = draft?.tool;
  const defaultProfile = config.profiles.find((p) => p.id === config.defaultProfileId);

  useEffect(() => {
    if (!editingTool) return;
    const controller = new AbortController();
    setModelsLoading(true);
    setModelSearch("");
    void api.getAgentModels(editingTool, controller.signal).then((catalog) => {
      if (!controller.signal.aborted) setModelCatalog({ tool: editingTool, ...catalog });
    }).catch(() => {
      if (!controller.signal.aborted) {
        setModelCatalog({ tool: editingTool, models: [], warning: "无法读取模型列表" });
      }
    }).finally(() => {
      if (!controller.signal.aborted) setModelsLoading(false);
    });
    return () => controller.abort();
  }, [editingTool]);

  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const edit = (profile?: AgentProfile) => {
    setFormError(null);
    const tool = installedTools.includes("codex") ? "codex" : installedTools[0];
    if (profile) setDraft({ ...profile });
    else if (tool) setDraft({ name: "", tool, model: null, enabled: true });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setFormError(null);
    try {
      if (!draft.name.trim()) throw new Error("请填写配置名称");
      if (!isAgentToolInstalled(draft.tool, installedTools)) throw new Error("该 CLI 未在本机找到");
      await api.saveAgentProfile({ ...draft, name: draft.name.trim(), model: normalizeAgentModel(draft.model) });
      setDraft(null);
      await onRefresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="agent-config" aria-label="项目 Agent 配置">
      <header className="agent-config__header">
        <h2><RobotOutlined /> Agent 配置</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => edit()} disabled={busy || installedTools.length === 0}>新建配置</Button>
      </header>
      {error && <Alert type="error" showIcon title={error} />}
      {installedTools.length === 0 && <Alert type="info" showIcon title="未检测到本机 Agent CLI" />}
      <div className="agent-config__default">
        <label htmlFor="default-agent-profile">项目默认 Agent</label>
        <Select
          id="default-agent-profile"
          aria-label="项目默认 Agent"
          labelInValue
          value={{
            value: config.defaultProfileId ?? "",
            label: defaultProfile
              ? agentProfileLabel(defaultProfile) + (isAgentToolInstalled(defaultProfile.tool, installedTools) ? "" : " · 未安装")
              : "自动选择",
          }}
          disabled={busy}
          options={[
            { value: "", label: "自动选择" },
            ...config.profiles.filter((p) => p.enabled && isAgentToolInstalled(p.tool, installedTools)).map((p) => ({ value: p.id, label: agentProfileLabel(p) })),
          ]}
          onChange={({ value }) => void mutate(() => api.setDefaultAgentProfile(value || null))}
        />
      </div>
      {config.profiles.length === 0 ? <Empty description="暂无 Agent 配置" /> : (
        <div className="agent-config__table-wrap">
          <table className="agent-config__table">
            <thead><tr><th>名称</th><th>CLI</th><th>模型</th><th>启用</th><th>操作</th></tr></thead>
            <tbody>{config.profiles.map((profile) => (
              <tr key={profile.id}>
                <td>
                  <strong>{profile.name}</strong>
                  {config.defaultProfileId === profile.id && <Tag color="green">默认</Tag>}
                  <code>{profile.id}</code>
                </td>
                <td>{profile.tool}{!isAgentToolInstalled(profile.tool, installedTools) && <Tag color="warning">未安装</Tag>}</td>
                <td>{profile.model ?? "CLI 默认模型"}</td>
                <td><Switch
                  size="small"
                  aria-label={`启用 ${profile.name}`}
                  checked={profile.enabled}
                  disabled={busy || config.defaultProfileId === profile.id}
                  onChange={(enabled) => void mutate(() => api.saveAgentProfile({ ...profile, enabled }))}
                /></td>
                <td><Space size={4}>
                  <Tooltip title="编辑"><Button aria-label={`编辑 ${profile.name}`} icon={<EditOutlined />} type="text" disabled={busy} onClick={() => edit(profile)} /></Tooltip>
                  <Tooltip title="删除"><Button aria-label={`删除 ${profile.name}`} icon={<DeleteOutlined />} type="text" danger disabled={busy} onClick={() => Modal.confirm({
                    title: `删除「${profile.name}」？`,
                    okText: "删除", cancelText: "取消", okButtonProps: { danger: true },
                    onOk: () => mutate(() => api.deleteAgentProfile(profile.id)),
                  })} /></Tooltip>
                </Space></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal title={draft?.id ? "编辑 Agent 配置" : "新建 Agent 配置"} open={draft !== null}
        onCancel={() => { if (!busy) setDraft(null); }} footer={null} closable={!busy} maskClosable={!busy}>
        {draft && <form className="agent-config__form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {formError && <Alert type="error" showIcon title={formError} />}
          <label htmlFor="agent-profile-name">配置名称</label>
          <Input id="agent-profile-name" autoFocus maxLength={100} value={draft.name} disabled={busy}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <label htmlFor="agent-profile-tool">Agent CLI</label>
          <Select id="agent-profile-tool" aria-label="Agent CLI" value={draft.tool} disabled={busy}
            options={installedTools.map((tool) => ({ value: tool, label: tool }))}
            onChange={(tool) => setDraft({ ...draft, tool, model: null })} />
          {!isAgentToolInstalled(draft.tool, installedTools) &&
            <Alert type="warning" showIcon title="当前配置的 CLI 未在本机找到" />}
          <label htmlFor="agent-profile-model">模型</label>
          <Select
            id="agent-profile-model"
            aria-label="模型"
            value={draft.model ?? ""}
            disabled={busy}
            loading={modelsLoading}
            showSearch
            allowClear
            filterOption={false}
            searchValue={modelSearch}
            onSearch={setModelSearch}
            options={buildModelOptions(
              modelCatalog?.tool === draft.tool ? modelCatalog.models : [],
              draft.model,
              modelSearch
            )}
            onChange={(model: string | undefined) => {
              setDraft({ ...draft, model: model || null });
              setModelSearch("");
            }}
          />
          {modelCatalog?.tool === draft.tool && modelCatalog.warning &&
            <Alert type="warning" showIcon title={modelCatalog.warning} />}
          <div className="agent-config__enabled">
            <label htmlFor="agent-profile-enabled">启用</label>
            <Switch id="agent-profile-enabled" checked={draft.enabled}
              disabled={busy || draft.id === config.defaultProfileId}
              onChange={(enabled) => setDraft({ ...draft, enabled })} />
          </div>
          <footer>
            <Button disabled={busy} onClick={() => setDraft(null)}>取消</Button>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={busy}>保存配置</Button>
          </footer>
        </form>}
      </Modal>
    </section>
  );
}
