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
  toggleFavorite: (nodeId: string) => Promise<void>;
  stopStreaming: () => void;
  clearError: () => void;
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

    // 构建上下文（根 → 当前节点）
    const ctx = await treeService.getContextPath(nodeId);
    const messages: ChatMessage[] = ctx.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 流式调用
    const controller = new AbortController();
    streamController = controller;
    set({ streaming: true });
    let answer = "";
    try {
      for await (const chunk of providerManager.chat({
        messages,
        signal: controller.signal,
      })) {
        if (chunk.delta) {
          answer += chunk.delta;
          set((s) => ({
            streamingBuffer: { ...s.streamingBuffer, [nodeId]: answer },
          }));
        }
      }
    } catch (err) {
      const ce = err instanceof ChatError ? err : ChatError.fromError(err);
      if (ce.code !== "aborted") {
        set({ uiError: ce.message });
      }
    } finally {
      streamController = null;
      if (answer) {
        await repos.nodes.updateNode(nodeId, { answer });
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

  stopStreaming: () => {
    streamController?.abort();
  },

  clearError: () => set({ uiError: null, initError: null }),
}));
