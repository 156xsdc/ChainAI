/**
 * chatStore：聊天核心状态与业务逻辑
 * - 管理当前节点、渲染路径（消息流+分叉提示线）
 * - 发送消息（创建节点 + 流式调用 AI）
 * - 分支创建、新开始、导航、收藏
 */
import { create } from "zustand";
import { providerManager } from "../core/ai/manager";
import { ChatError } from "../core/ai/errors";
import type { ChatMessage } from "../core/ai/types";
import { Typewriter } from "../core/typing/typewriter";
import { buildContext, type ContextMessage } from "../core/context/builder";
import { summarizeGroup } from "../core/context/aiCompressor";
import { exportAll, importAll } from "../core/importExport/service";
import { saveJsonFile, openJsonFile } from "../core/io/files";
import { TreeService } from "../core/tree/treeService";
import {
  initAppDatabase,
  type AppRepositories,
  type RelationType,
} from "../core/db";
import type { ProviderConfig } from "../core/ai/types";

/** 聊天流的渲染项 */
export type ChatStreamItem =
  | {
      kind: "message";
      role: "user" | "assistant";
      nodeId: string;
      content: string;
    }
  | { kind: "branch"; parentNodeId: string; children: BranchOption[] };

export interface BranchOption {
  nodeId: string;
  label: string;
  color: string;
  relationType: RelationType;
  isCurrent: boolean;
}

export interface CreateBranchParams {
  name?: string;
  inheritMode?: "all" | "count" | "none";
  inheritCount?: number;
}

interface ChatState {
  repos: AppRepositories | null;
  treeService: TreeService | null;
  initError: string | null;
  uiError: string | null;

  currentNodeId: string | null;
  path: ChatStreamItem[];

  streaming: boolean;
  /** 是否正在准备上下文（AI 压缩摘要等） */
  preparing: boolean;
  /** nodeId -> 流式生成的 AI 回答（覆盖 DB 中的 answer） */
  streamingBuffer: Record<string, string>;
  /** 当前是否有父节点（↑上级按钮可用性） */
  hasParent: boolean;

  init: () => Promise<void>;
  refreshPath: () => Promise<void>;
  navigateTo: (nodeId: string) => Promise<void>;
  navigateToParent: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  createBranch: (parentNodeId: string, params?: CreateBranchParams) => Promise<string>;
  createNewStart: (parentNodeId: string) => Promise<string>;
  createMerge: (
    parentNodeIds: string[],
    params?: { name?: string; inheritCount?: number }
  ) => Promise<string>;
  toggleFavorite: (nodeId: string) => Promise<void>;
  /** 删除分支（该节点及其全部后代）：软删除 + 回收站 + 导航调整 */
  deleteBranch: (nodeId: string) => Promise<{ deletedCount: number }>;
  stopStreaming: () => void;
  setUiError: (msg: string) => void;
  clearError: () => void;
  /** 成功通知（左下角 toast） */
  notice: string | null;
  setNotice: (msg: string) => void;
  clearNotice: () => void;
  /** 导出全部数据为 JSON 备份文件 */
  exportData: () => Promise<void>;
  /** 从 JSON 备份文件导入（覆盖模式） */
  importData: () => Promise<void>;
}

let streamController: AbortController | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
  repos: null,
  treeService: null,
  initError: null,
  uiError: null,
  currentNodeId: null,
  path: [],
  streaming: false,
  preparing: false,
  streamingBuffer: {},
  hasParent: false,

  init: async () => {
    try {
      const repos = await initAppDatabase();
      const treeService = new TreeService(
        repos.backend,
        repos.nodes,
        repos.sessions
      );

      // 加载 AI 配置
      const providerConfigs = await repos.settings.get<ProviderConfig[]>(
        "ai.providers",
        []
      );
      providerManager.setConfigs(providerConfigs);

      // 恢复上次会话位置
      const saved = await repos.settings.get<string | null>(
        "chat.currentNodeId",
        null
      );
      set({ repos, treeService });
      if (saved) {
        const node = await repos.nodes.getNode(saved);
        if (node) set({ currentNodeId: node.id });
      }
      await get().refreshPath();
    } catch (err) {
      set({
        initError:
          err instanceof Error
            ? err.message
            : "数据库初始化失败（请通过 npm run tauri dev 运行）",
      });
    }
  },

  refreshPath: async () => {
    const { repos, currentNodeId, streamingBuffer } = get();
    if (!repos || !currentNodeId) {
      set({ path: [], hasParent: false });
      return;
    }

    const segments = await repos.nodes.getPathToRoot(currentNodeId);
    const items: ChatStreamItem[] = [];

    for (const seg of segments) {
      const node = seg.node;
      if (node.question) {
        items.push({
          kind: "message",
          role: "user",
          nodeId: node.id,
          content: node.question,
        });
      }
      const streamed = streamingBuffer[node.id];
      if (node.answer || streamed) {
        items.push({
          kind: "message",
          role: "assistant",
          nodeId: node.id,
          content: streamed ?? node.answer,
        });
      }
      // 分叉点：该节点有多个子节点时显示分支提示线
      const children = await repos.nodes.getChildrenWithEdge(node.id);
      if (children.length > 1) {
        items.push({
          kind: "branch",
          parentNodeId: node.id,
          children: children.map((c) => ({
            nodeId: c.node.id,
            label:
              c.node.summary ||
              c.node.question.slice(0, 14) ||
              "未命名分支",
            color: c.node.color,
            relationType: c.edge.relationType,
            isCurrent: c.node.id === currentNodeId,
          })),
        });
      }
    }

    const parents = await repos.nodes.getParents(currentNodeId);
    set({ path: items, hasParent: parents.length > 0 });
  },

  navigateTo: async (nodeId) => {
    const { repos } = get();
    if (!repos) return;
    await repos.settings.set("chat.currentNodeId", nodeId);
    set({ currentNodeId: nodeId });
    await get().refreshPath();
  },

  navigateToParent: async () => {
    const { repos, currentNodeId } = get();
    if (!repos || !currentNodeId) return;
    const parents = await repos.nodes.getParents(currentNodeId);
    if (parents.length > 0) {
      await get().navigateTo(parents[0].id);
    }
  },

  sendMessage: async (text) => {
    const { repos, treeService, currentNodeId, streaming } = get();
    const trimmed = text.trim();
    if (!repos || !treeService || !trimmed || streaming) return;

    const config = providerManager.getActiveConfig();
    if (!config) {
      set({ uiError: "尚未配置 AI 服务，请点击输入卡片左侧的 ⚙ 进行设置" });
      return;
    }

    let nodeId = currentNodeId;
    try {
      if (!nodeId) {
        // 首次对话：创建根节点
        const node = await repos.nodes.createNode({ question: trimmed });
        nodeId = node.id;
        set({ currentNodeId: nodeId });
      } else {
        const cur = await repos.nodes.getNode(nodeId);
        if (cur && !cur.question && !cur.answer) {
          // 空节点（刚创建的分支/新开始），直接填入
          await repos.nodes.updateNode(nodeId, { question: trimmed });
        } else {
          // 已有问答：创建子节点继续
          const { node } = await treeService.addChild(nodeId, {
            question: trimmed,
          });
          nodeId = node.id;
          set({ currentNodeId: nodeId });
        }
      }
    } catch (err) {
      set({ uiError: `创建节点失败：${(err as Error).message}` });
      return;
    }

    await repos.settings.set("chat.currentNodeId", nodeId);

    // 构建上下文：继承模式 + 时间权重压缩
    set({ preparing: true });
    const session = await repos.sessions.getByStartNode(nodeId);
    const inheritCount = session?.inheritCount ?? 10; // -1=全部, 0=不继承
    const inheritMode =
      inheritCount < 0 ? "all" : inheritCount === 0 ? "none" : "count";
    const compressSettings = await repos.settings.get<{
      enabled?: boolean;
      recentKeep?: number;
    }>("ai.contextCompression", { enabled: true, recentKeep: 5 });

    const fullCtx = await treeService.getContextPath(nodeId);
    const contextMessages: ContextMessage[] = fullCtx.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 压缩摘要需要额外的 AI 调用（历史较长时）
    const messages: ChatMessage[] = await buildContext(contextMessages, {
      inheritMode,
      inheritCount,
      compress: compressSettings.enabled,
      recentKeep: compressSettings.recentKeep ?? 5,
      compressFn: (group) => summarizeGroup(group, config),
    });

    // 打字机设置（render.typewriter）
    const twSettings = await repos.settings.get<{
      enabled?: boolean;
      threshold?: number;
      speed?: number;
    }>("render.typewriter", { enabled: true, threshold: 200, speed: 30 });

    // 流式调用
    const controller = new AbortController();
    streamController = controller;
    set({ preparing: false, streaming: true });

    const updateBuffer = (text: string) =>
      set((s) => ({
        streamingBuffer: { ...s.streamingBuffer, [nodeId]: text },
      }));

    const typewriter =
      twSettings.enabled === false
        ? null
        : new Typewriter(updateBuffer, {
            threshold: twSettings.threshold ?? 200,
            charsPerSecond: twSettings.speed ?? 30,
          });

    let answer = "";
    try {
      for await (const chunk of providerManager.chat({
        messages,
        signal: controller.signal,
      })) {
        if (chunk.delta) {
          answer += chunk.delta;
          if (typewriter) typewriter.feed(chunk.delta);
          else updateBuffer(answer);
        }
      }
    } catch (err) {
      const ce = err instanceof ChatError ? err : ChatError.fromError(err);
      if (ce.code !== "aborted") {
        set({ uiError: ce.message });
      }
    } finally {
      streamController = null;
      set({ preparing: false });
      if (typewriter) typewriter.finish();
      const finalAnswer = typewriter ? typewriter.fullText : answer;
      if (finalAnswer) {
        await repos.nodes.updateNode(nodeId, { answer: finalAnswer });
        set((s) => {
          const buffer = { ...s.streamingBuffer };
          delete buffer[nodeId];
          return { streamingBuffer: buffer };
        });
      }
      set({ streaming: false });
      await get().refreshPath();
    }
  },

  createBranch: async (parentNodeId, params) => {
    const { treeService } = get();
    if (!treeService) return "";
    const { node } = await treeService.createBranch(parentNodeId, params);
    await get().navigateTo(node.id);
    return node.id;
  },

  createNewStart: async (parentNodeId) => {
    const { treeService } = get();
    if (!treeService) return "";
    const { node } = await treeService.createNewStart(parentNodeId);
    await get().navigateTo(node.id);
    return node.id;
  },

  createMerge: async (parentNodeIds, params) => {
    const { treeService } = get();
    if (!treeService) return "";
    const { node } = await treeService.createMerge(parentNodeIds, params);
    await get().navigateTo(node.id);
    return node.id;
  },

  toggleFavorite: async (nodeId) => {
    const { repos } = get();
    if (!repos) return;
    const node = await repos.nodes.getNode(nodeId);
    if (!node) return;
    if (node.isFavorited) {
      await repos.favorites.remove(nodeId);
      await repos.nodes.updateNode(nodeId, { isFavorited: false });
    } else {
      await repos.favorites.add(nodeId);
      await repos.nodes.updateNode(nodeId, { isFavorited: true });
    }
    await get().refreshPath();
  },

  deleteBranch: async (nodeId) => {
    const { repos, currentNodeId } = get();
    if (!repos) return { deletedCount: 0 };

    const descendants = await repos.nodes.getDescendantIds(nodeId);
    // 软删除全部子树节点
    for (const id of descendants) {
      await repos.nodes.softDeleteNode(id);
    }
    // 回收站记录
    for (const id of descendants) {
      await repos.recycleBin.add(id);
    }

    // 若当前节点在删除的子树上 → 跳转到该分支的父节点
    if (currentNodeId && descendants.includes(currentNodeId)) {
      const parents = await repos.nodes.getParents(nodeId);
      if (parents.length > 0) {
        await get().navigateTo(parents[0].id);
      } else {
        set({ currentNodeId: null });
        await repos.settings.set("chat.currentNodeId", null);
        await get().refreshPath();
      }
    } else {
      await get().refreshPath();
    }
    return { deletedCount: descendants.length };
  },

  stopStreaming: () => {
    streamController?.abort();
  },

  setUiError: (msg) => set({ uiError: msg }),
  clearError: () => set({ uiError: null, initError: null }),

  notice: null,
  setNotice: (msg) => set({ notice: msg }),
  clearNotice: () => set({ notice: null }),

  exportData: async () => {
    const { repos } = get();
    if (!repos) return;
    try {
      const json = await exportAll(repos);
      const fileName = `chainai-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const path = await saveJsonFile(fileName, json);
      if (path) set({ notice: `✅ 已导出备份：${path}` });
    } catch (err) {
      set({ uiError: `导出失败：${(err as Error).message}` });
    }
  },

  importData: async () => {
    const { repos } = get();
    if (!repos) return;
    try {
      const file = await openJsonFile();
      if (!file) return;
      if (!window.confirm("导入将覆盖当前所有数据，确定继续吗？")) return;
      const result = await importAll(repos, file.content);
      // 重新初始化（恢复 provider 配置与当前节点）
      await get().init();
      set({
        notice: `✅ 已导入：${result.nodes} 节点 / ${result.edges} 边 / ${result.sessions} 会话`,
      });
    } catch (err) {
      set({ uiError: `导入失败：${(err as Error).message}` });
    }
  },
}));
