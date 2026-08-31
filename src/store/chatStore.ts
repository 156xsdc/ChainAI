/**
 * chatStore：聊天核心状态与业务逻辑
 * - 管理当前节点、渲染路径（消息流+分叉提示线）
 * - 发送消息（创建节点 + 流式调用 AI）
 * - 分支创建、新开始、导航、收藏
 */
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { documentDir, join } from "@tauri-apps/api/path";
import { getAppDataDir, joinPath } from "../core/io/appPaths";
import { providerManager } from "../core/ai/manager";
import { ChatError } from "../core/ai/errors";
import type { ChatMessage } from "../core/ai/types";
import { Typewriter } from "../core/typing/typewriter";
import { buildContext, type ContextMessage } from "../core/context/builder";
import { summarizeGroup } from "../core/context/aiCompressor";
import { estimateMessagesTokens } from "../core/context/tokenEstimate";
import { exportAll, importAll } from "../core/importExport/service";
import {
  exportTreeToMarkdown,
  importMarkdownAsTree,
} from "../core/importExport/markdown";
import {
  saveJsonFile,
  openJsonFile,
  saveTextFile,
  openTextFile,
} from "../core/io/files";
import { createNoteFile } from "../core/notes/noteService";
import { cleanupOnce, purgeExpired } from "../core/cleanup/service";
import { useUIStore } from "./uiStore";
import { useGraphStore } from "./graphStore";
import { confirmDialog } from "./dialogStore";
import type { Note } from "../core/db";
import { TreeService } from "../core/tree/treeService";
import { getBranchLabel } from "../core/tree/branchLabel";
import type { Tree } from "../core/db/repositories/treeRepo";
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
      /** 引用的 AI 回答片段（用户消息下展示） */
      quote?: string;
      /** 是否已收藏（用于消息操作条显示状态） */
      isFavorited?: boolean;
      /** 是否已保留标记 */
      isKept?: boolean;
    }
  | { kind: "branch"; parentNodeId: string; children: BranchOption[] }
  | {
      kind: "merge";
      /** 合并节点 id */
      nodeId: string;
      /** 父链选项（点击跳回合并前的任意分支） */
      options: BranchOption[];
    };

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
  /** 当前树（多棵树：每个树独立对话项目） */
  currentTreeId: string | null;
  trees: Tree[];
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
  /** @returns 是否已受理（false = 未创建节点，如未配置AI/创建失败） */
  sendMessage: (text: string) => Promise<boolean>;
  createBranch: (parentNodeId: string, params?: CreateBranchParams) => Promise<string>;
  createNewStart: (parentNodeId: string, name?: string) => Promise<string>;
  createMerge: (
    parentNodeIds: string[],
    params?: { name?: string; inheritCount?: number }
  ) => Promise<string>;
  toggleFavorite: (nodeId: string) => Promise<void>;
  /** 切换📌保留标记（自动清理保护） */
  toggleKeep: (nodeId: string) => Promise<void>;
  /** 重命名分支（会话名；非分支节点则更新节点摘要） */
  renameBranch: (nodeId: string, name: string) => Promise<void>;
  /** 删除分支（该节点及其全部后代）：软删除 + 回收站 + 导航调整 */
  deleteBranch: (nodeId: string) => Promise<{ deletedCount: number }>;
  stopStreaming: () => void;
  setUiError: (msg: string) => void;
  clearError: () => void;
  /** 通知（左下角 toast） */
  notice: string | null;
  noticeTone: "success" | "info" | "error";
  /** 通知类型开关（内存缓存，init 时加载） */
  notifyTypes: { success: boolean; info: boolean };
  /** 通知时长（秒，内存缓存） */
  notifyDuration: number;
  setNotice: (msg: string, tone?: "success" | "info" | "error") => void;
  setNotifyTypes: (types: { success: boolean; info: boolean }) => void;
  setNotifyDuration: (seconds: number) => void;
  clearNotice: () => void;
  /** 导出全部数据为 JSON 备份文件 */
  exportData: () => Promise<void>;
  /** 从 JSON 备份文件导入（覆盖模式） */
  importData: () => Promise<void>;
  /** 从消息创建便签（关联节点） */
  createNoteFromMessage: (nodeId: string) => Promise<Note | null>;
  /** 创建空白便签 */
  createBlankNote: () => Promise<Note | null>;
  /** 便签变化版本号（便签板实时刷新） */
  noteVersion: number;
  bumpNoteVersion: () => void;
  /** 收藏变化版本号（收藏夹实时刷新） */
  favVersion: number;
  bumpFavVersion: () => void;
  /** 清空全部对话（节点软删除到回收站 + 清会话） */
  clearAllChat: () => Promise<void>;
  /** 新建树 */
  createTree: (name: string) => Promise<string>;
  /** 重命名树 */
  renameTree: (treeId: string, name: string) => Promise<void>;
  /** 删除树（节点移入回收站） */
  deleteTree: (treeId: string) => Promise<void>;
  /** 切换当前树 */
  switchTree: (treeId: string) => Promise<void>;
  /** 重新生成节点回答（追加新版本，保留历史） */
  regenerate: (nodeId: string) => Promise<void>;
  /** 切换节点回答版本（dir: -1 上一个 / +1 下一个） */
  switchAnswer: (nodeId: string, dir: -1 | 1) => Promise<void>;
  /** 立即执行一次自动清理 */
  cleanupNow: () => Promise<{ branches: number; nodes: number } | null>;
  /** 导出当前整棵树为 Markdown 文档 */
  exportMarkdown: () => Promise<void>;
  /** 导入 Markdown 文档为树（追加） */
  importMarkdown: () => Promise<void>;
  /** 引用：用户选中的 AI 回答片段（nodeId + 文本），随消息发送 */
  quote: { nodeId: string; text: string } | null;
  setQuote: (quote: { nodeId: string; text: string } | null) => void;
  clearQuote: () => void;
  /** 立即执行一次 JSON 自动备份（备份目录） */
  backupNow: (silent?: boolean) => Promise<void>;
  /** 检查并按设置执行自动备份（应用启动时调用） */
  checkAutoBackup: () => Promise<void>;
}

let streamController: AbortController | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
  repos: null,
  treeService: null,
  initError: null,
  uiError: null,
  currentNodeId: null,
  currentTreeId: null,
  trees: [],
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

      // 加载通知设置（类型开关 + 时长）
      const notifySettings = await repos.settings.get<{
        duration?: number;
        types?: { success?: boolean; info?: boolean };
      }>("notification", { duration: 6, types: { success: true, info: true } });
      set({
        notifyDuration: notifySettings.duration ?? 6,
        notifyTypes: {
          success: notifySettings.types?.success !== false,
          info: notifySettings.types?.info !== false,
        },
      });

      // 加载树列表 + 恢复当前树
      const trees = await repos.trees.list();
      const treeId = await repos.settings.get<string | null>(
        "chat.currentTreeId",
        trees[0]?.id ?? null
      );
      const currentTreeId = trees.some((t) => t.id === treeId)
        ? treeId
        : (trees[0]?.id ?? null);

      // 恢复当前树的上次会话位置
      const saved = currentTreeId
        ? await repos.settings.get<string | null>(
            `chat.currentNodeId.${currentTreeId}`,
            null
          )
        : null;
      set({ repos, treeService, trees, currentTreeId });
      if (saved) {
        const node = await repos.nodes.getNode(saved);
        if (node) set({ currentNodeId: node.id });
      }
      await get().refreshPath();
      // 启动时执行自动清理与自动备份（不阻塞初始化）
      void get().cleanupNow();
      void get().checkAutoBackup();
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
      // 合并点提示线：该节点有多个父节点（合并节点），可跳回任意父链
      const parents = await repos.nodes.getParentsWithEdge(node.id);
      if (parents.length > 1) {
        const options: BranchOption[] = [];
        for (const p of parents) {
          options.push({
            nodeId: p.parent.id,
            label: await getBranchLabel(repos, p.parent),
            color: p.parent.color,
            relationType: p.relationType,
            isCurrent: false,
          });
        }
        items.push({ kind: "merge", nodeId: node.id, options });
      }
      if (node.question) {
        items.push({
          kind: "message",
          role: "user",
          nodeId: node.id,
          content: node.question,
          quote: node.quote || undefined,
        });
      }
      const streamed = streamingBuffer[node.id];
      if (node.answer || streamed) {
        items.push({
          kind: "message",
          role: "assistant",
          nodeId: node.id,
          content: streamed ?? node.answer,
          isFavorited: node.isFavorited,
          isKept: node.isKept,
        });
      }
      // 分叉点：该节点有多个子节点时显示分支提示线
      const children = await repos.nodes.getChildrenWithEdge(node.id);
      if (children.length > 1) {
        const options: BranchOption[] = [];
        for (const c of children) {
          options.push({
            nodeId: c.node.id,
            label: await getBranchLabel(repos, c.node),
            color: c.node.color,
            relationType: c.edge.relationType,
            isCurrent: c.node.id === currentNodeId,
          });
        }
        items.push({
          kind: "branch",
          parentNodeId: node.id,
          children: options,
        });
      }
    }

    const parents = await repos.nodes.getParents(currentNodeId);
    set({ path: items, hasParent: parents.length > 0 });
  },

  navigateTo: async (nodeId) => {
    const { repos, currentTreeId } = get();
    if (!repos) return;
    // 跨树跳转（收藏/搜索可能来自其他树）：先切换树
    const node = await repos.nodes.getNode(nodeId);
    if (node?.treeId && node.treeId !== currentTreeId) {
      await repos.settings.set("chat.currentTreeId", node.treeId);
      set({ currentTreeId: node.treeId });
    }
    const treeId = node?.treeId ?? currentTreeId;
    if (treeId) {
      await repos.settings.set(`chat.currentNodeId.${treeId}`, nodeId);
    }
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
    const { repos, treeService, currentNodeId, currentTreeId, streaming } =
      get();
    const trimmed = text.trim();
    if (!repos || !treeService || !trimmed || streaming) return false;
    // 无当前树时自动创建（首次使用）
    let treeId = currentTreeId;
    if (!treeId) {
      const first = (await repos.trees.list())[0];
      treeId = first?.id ?? (await repos.trees.create("默认树")).id;
      set({ currentTreeId: treeId });
    }

    const quote = get().quote;
    const config = providerManager.getActiveConfig();
    if (!config) {
      set({ uiError: "尚未配置 AI 服务，请点击输入卡片左侧的 ⚙ 进行设置" });
      return false;
    }

    let nodeId = currentNodeId;
    try {
      if (!nodeId) {
        // 首次对话：创建根节点
        const node = await repos.nodes.createNode({
          question: trimmed,
          treeId,
          quote: quote?.text,
        });
        nodeId = node.id;
        set({ currentNodeId: nodeId });
      } else {
        const cur = await repos.nodes.getNode(nodeId);
        if (cur && !cur.question && !cur.answer) {
          // 空节点（刚创建的分支/新开始），直接填入
          await repos.nodes.updateNode(nodeId, {
            question: trimmed,
            quote: quote?.text,
          });
        } else {
          // 已有问答：创建子节点继续
          const { node } = await treeService.addChild(nodeId, {
            question: trimmed,
            treeId,
            quote: quote?.text,
          });
          nodeId = node.id;
          set({ currentNodeId: nodeId });
        }
      }
    } catch (err) {
      set({ uiError: `创建节点失败：${(err as Error).message}` });
      return false;
    }

    // 发送已受理：立即清除输入框引用（节点已持久化 quote，消息流会显示）
    set({ quote: null });

    await repos.settings.set(`chat.currentNodeId.${treeId}`, nodeId);

    // 立即刷新：用户消息显示到聊天区
    await get().refreshPath();

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

    // 合并节点（多父）：每条父链各继承最近 N 条，避免全局截断只剩一条链
    const parentLinks = await repos.nodes.getParentsWithEdge(nodeId);
    const isMergeNode = parentLinks.length > 1;
    const fullCtx = isMergeNode
      ? await treeService.getMergeContextPath(nodeId, Math.max(1, inheritCount))
      : await treeService.getContextPath(nodeId);
    const contextMessages: ContextMessage[] = fullCtx.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 压缩摘要需要额外的 AI 调用（历史较长时）
    const messages: ChatMessage[] = await buildContext(contextMessages, {
      // 合并节点已按每链截断；传 all 避免全局 slice 二次截断
      inheritMode: isMergeNode ? "all" : inheritMode,
      inheritCount,
      compress: compressSettings.enabled,
      recentKeep: compressSettings.recentKeep ?? 5,
      compressFn: (group) => summarizeGroup(group, config),
    });

    // 新开始/不继承模式：上下文可能为空，至少包含当前问题（API 要求非空消息）
    if (messages.length === 0) {
      messages.push({ role: "user", content: trimmed });
    }

    // 引用：把选中内容及其出处问答注入上下文，替换原问题为带引用的提问
    if (quote) {
      // 移除末尾的用户消息（原问题），由引用提问替代
      while (messages.length > 0 && messages[messages.length - 1].role === "user") {
        messages.pop();
      }
      const quoteNode = await repos.nodes.getNode(quote.nodeId);
      if (quoteNode?.question) {
        messages.push({ role: "user", content: quoteNode.question });
      }
      if (quoteNode?.answer) {
        messages.push({ role: "assistant", content: quoteNode.answer });
      }
      messages.push({
        role: "user",
        content: `【引用内容】\n${quote.text}\n\n请结合以上引用及其出处上下文，回答：${trimmed}`,
      });
    }

    // 上下文耗尽提示：估算 token 用量
    const totalTokens = estimateMessagesTokens(messages);
    const contextLimit = await repos.settings.get<number>(
      "ai.contextLimit",
      8000
    );
    if (totalTokens > contextLimit) {
      set({
        notice: `💡 当前上下文约 ${Math.round(totalTokens / 1000)}k tokens，已接近 ${Math.round(contextLimit / 1000)}k 上限。建议点击「+分叉」创建新分支（可继承最近消息）继续讨论。`,
        noticeTone: "info",
      });
    }

    // 打字机设置（render.typewriter）
    const twSettings = await repos.settings.get<{
      enabled?: boolean;
      threshold?: number;
      speed?: number;
    }>("render.typewriter", { enabled: true, threshold: 20, speed: 30 });

    // 流式调用
    const controller = new AbortController();
    streamController = controller;
    set({ preparing: false, streaming: true });

    // 节流更新 UI（打字机关闭时限制渲染频率，降低 CPU 占用）
    let lastRender = 0;
    const updateBuffer = (text: string) => {
      const now = Date.now();
      if (now - lastRender < 80) return;
      lastRender = now;
      set((s) => ({
        streamingBuffer: { ...s.streamingBuffer, [nodeId]: text },
      }));
    };

    const typewriter =
      twSettings.enabled === false
        ? null
        : new Typewriter(updateBuffer, {
            threshold: twSettings.threshold ?? 20,
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
      if (typewriter) {
        // 加速吐完剩余内容（避免输出完成后瞬间闪现全文）
        await typewriter.finish();
      }
      const finalAnswer = typewriter ? typewriter.fullText : answer;
      if (finalAnswer) {
        // 首次生成：写入版本1（重新生成/版本切换的基础）
        const versions = await repos.answerVersions.list(nodeId);
        if (versions.length === 0) {
          await repos.answerVersions.add(nodeId, finalAnswer);
          await repos.nodes.updateNode(nodeId, {
            answer: finalAnswer,
            answerVersion: 1,
          });
        } else {
          await repos.nodes.updateNode(nodeId, { answer: finalAnswer });
        }
        set((s) => {
          const buffer = { ...s.streamingBuffer };
          delete buffer[nodeId];
          return { streamingBuffer: buffer };
        });
      }
      set({ streaming: false });
      await get().refreshPath();
    }
    return true;
  },

  createBranch: async (parentNodeId, params) => {
    const { treeService, currentTreeId } = get();
    if (!treeService) return "";
    const { node } = await treeService.createBranch(parentNodeId, {
      ...params,
      treeId: currentTreeId,
    });
    await get().navigateTo(node.id);
    return node.id;
  },

  createNewStart: async (parentNodeId, name) => {
    const { treeService, currentTreeId } = get();
    if (!treeService) return "";
    const { node } = await treeService.createNewStart(parentNodeId, {
      name,
      treeId: currentTreeId,
    });
    await get().navigateTo(node.id);
    return node.id;
  },

  createMerge: async (parentNodeIds, params) => {
    const { treeService, currentTreeId } = get();
    if (!treeService) return "";
    const { node } = await treeService.createMerge(parentNodeIds, {
      ...params,
      treeId: currentTreeId,
    });
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
    get().bumpFavVersion();
    await get().refreshPath();
  },

  toggleKeep: async (nodeId) => {
    const { repos } = get();
    if (!repos) return;
    const node = await repos.nodes.getNode(nodeId);
    if (!node) return;
    await repos.nodes.updateNode(nodeId, { isKept: !node.isKept });
    useGraphStore.getState().bumpGraphVersion();
    await get().refreshPath();
  },

  renameBranch: async (nodeId, name) => {
    const { repos } = get();
    if (!repos) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const session = await repos.sessions.getByStartNode(nodeId);
    if (session) {
      await repos.sessions.update(session.id, { name: trimmed });
    } else {
      // 非分支节点：更新节点摘要（分支提示线同样显示）
      await repos.nodes.updateNode(nodeId, { summary: trimmed });
    }
    useGraphStore.getState().bumpGraphVersion();
    await get().refreshPath();
  },

  deleteBranch: async (nodeId) => {
    const { repos, currentNodeId } = get();
    if (!repos) return { deletedCount: 0 };

    const descendants = await repos.nodes.getDescendantIds(nodeId);
    // 软删除全部子树节点 + 回收站记录（批量）
    await repos.nodes.softDeleteMany(descendants);
    await repos.recycleBin.addMany(descendants);

    // 若当前节点在删除的子树上 → 跳转到该分支的父节点
    if (currentNodeId && descendants.includes(currentNodeId)) {
      const parents = await repos.nodes.getParents(nodeId);
      if (parents.length > 0) {
        await get().navigateTo(parents[0].id);
      } else {
        const { currentTreeId } = get();
        set({ currentNodeId: null });
        if (currentTreeId) {
          await repos.settings.set(`chat.currentNodeId.${currentTreeId}`, null);
        }
        await get().refreshPath();
      }
    } else {
      await get().refreshPath();
    }
    // 树状图结构变化
    useGraphStore.getState().bumpGraphVersion();
    return { deletedCount: descendants.length };
  },

  stopStreaming: () => {
    streamController?.abort();
  },

  setUiError: (msg) => set({ uiError: msg }),
  clearError: () => set({ uiError: null, initError: null }),

  notice: null,
  noticeTone: "success",
  notifyTypes: { success: true, info: true },
  notifyDuration: 6,
  quote: null,
  noteVersion: 0,
  favVersion: 0,

  bumpNoteVersion: () => set((s) => ({ noteVersion: s.noteVersion + 1 })),
  bumpFavVersion: () => set((s) => ({ favVersion: s.favVersion + 1 })),
  setQuote: (quote) => set({ quote }),
  clearQuote: () => set({ quote: null }),
  setNotice: (msg, tone = "success") => {
    const { notifyTypes } = get();
    if (tone === "success" && notifyTypes.success === false) return;
    if (tone === "info" && notifyTypes.info === false) return;
    set({ notice: msg, noticeTone: tone });
  },
  setNotifyTypes: (types) => set({ notifyTypes: types }),
  setNotifyDuration: (seconds) => set({ notifyDuration: seconds }),
  clearNotice: () => set({ notice: null }),

  exportData: async () => {
    const { repos } = get();
    if (!repos) return;
    try {
      const json = await exportAll(repos);
      const fileName = `tongtu-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
      const ok = await confirmDialog({
        title: "导入 JSON 备份",
        message: "导入将覆盖当前所有数据，确定继续吗？",
        confirmText: "覆盖导入",
        danger: true,
      });
      if (!ok) return;
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

  createNoteFromMessage: async (nodeId) => {
    const { repos } = get();
    if (!repos) return null;
    const node = await repos.nodes.getNode(nodeId);
    if (!node) return null;
    const content = `**用户：**${node.question || "（无）"}\n\n${
      node.answer ? `**AI：**${node.answer}` : ""
    }`;
    const note = await createNoteFile(repos, {
      title: node.question.slice(0, 20) || "消息便签",
      content,
      nodeId,
      tags: [],
    });
    if (note) {
      useUIStore.getState().setSidebar("right", true);
      set({ notice: "📝 已创建便签" });
      get().bumpNoteVersion();
    }
    return note;
  },

  createBlankNote: async () => {
    const { repos } = get();
    if (!repos) return null;
    const note = await createNoteFile(repos, { title: "新便签", content: "" });
    if (note) {
      useUIStore.getState().setSidebar("right", true);
      get().bumpNoteVersion();
    }
    return note;
  },

  clearAllChat: async () => {
    const { repos, currentTreeId } = get();
    if (!repos) return;
    // 当前树全部节点软删除 + 回收站
    const all = await repos.nodes.getAllActive(currentTreeId);
    // 批量软删除 + 回收站记录
    await repos.nodes.softDeleteMany(all.map((n) => n.id));
    await repos.recycleBin.addMany(all.map((n) => n.id));
    // 清空会话（仅当前树：会话通过 start_node_id 关联节点，节点通过 tree_id 归属树）
    if (currentTreeId) {
      await repos.backend.execute(
        `DELETE FROM sessions WHERE is_active = 1 AND start_node_id IN (SELECT id FROM nodes WHERE tree_id = ?)`,
        [currentTreeId]
      );
    } else {
      await repos.backend.execute(`DELETE FROM sessions WHERE is_active = 1`);
    }
    // 重置当前节点
    if (currentTreeId) {
      await repos.settings.set(`chat.currentNodeId.${currentTreeId}`, null);
    }
    set({ currentNodeId: null });
    await get().refreshPath();
    useGraphStore.getState().bumpGraphVersion();
    set({
      notice: `🗑️ 已清空当前树对话（${all.length} 个节点移入回收站，可在回收站恢复）`,
      noticeTone: "info",
    });
  },

  createTree: async (name) => {
    const { repos } = get();
    if (!repos) return "";
    const tree = await repos.trees.create(name.trim() || "新树");
    // 刷新树列表（新建的树要立即出现在菜单中）
    const trees = await repos.trees.list();
    await repos.settings.set("chat.currentTreeId", tree.id);
    set({ currentTreeId: tree.id, currentNodeId: null, trees });
    await get().refreshPath();
    useGraphStore.getState().bumpGraphVersion();
    set({ notice: `🌳 已新建树「${tree.name}」` });
    return tree.id;
  },

  renameTree: async (treeId, name) => {
    const { repos } = get();
    if (!repos) return;
    await repos.trees.rename(treeId, name.trim() || "未命名");
    const trees = await repos.trees.list();
    set({ trees });
    set({ notice: "✏️ 已重命名" });
  },

  deleteTree: async (treeId) => {
    const { repos } = get();
    if (!repos) return;
    // 树内节点软删除 + 回收站
    const nodes = await repos.nodes.getAllActive(treeId);
    // 批量软删除 + 回收站记录
    await repos.nodes.softDeleteMany(nodes.map((n) => n.id));
    await repos.recycleBin.addMany(nodes.map((n) => n.id));
    // 清理该树的会话（避免孤儿会话残留）
    await repos.backend.execute(
      `DELETE FROM sessions WHERE start_node_id IN (SELECT id FROM nodes WHERE tree_id = ?)`,
      [treeId]
    );
    await repos.trees.remove(treeId);
    // 切到剩余第一棵树（或新建默认树）
    const trees = await repos.trees.list();
    const next =
      trees[0] ?? (await repos.trees.create("默认树"));
    await repos.settings.set("chat.currentTreeId", next.id);
    set({ currentTreeId: next.id, currentNodeId: null, trees });
    await get().refreshPath();
    useGraphStore.getState().bumpGraphVersion();
    set({
      notice: `🗑️ 已删除树（${nodes.length} 个节点移入回收站）`,
      noticeTone: "info",
    });
  },

  switchTree: async (treeId) => {
    const { repos } = get();
    if (!repos) return;
    await repos.settings.set("chat.currentTreeId", treeId);
    // 恢复该树上次位置
    const saved = await repos.settings.get<string | null>(
      `chat.currentNodeId.${treeId}`,
      null
    );
    set({ currentTreeId: treeId, currentNodeId: saved });
    await get().refreshPath();
    useGraphStore.getState().bumpGraphVersion();
  },

  regenerate: async (nodeId) => {
    const { repos, treeService, streaming } = get();
    if (!repos || !treeService || streaming) return;
    const node = await repos.nodes.getNode(nodeId);
    if (!node || !node.question) return;
    const config = providerManager.getActiveConfig();
    if (!config) {
      set({ uiError: "尚未配置 AI 服务，请点击输入卡片右侧的 ⚙ 进行设置" });
      return;
    }

    // 上下文：父链 + 当前问题（排除旧回答）
    const ctx = await treeService.getContextPath(nodeId);
    const contextMessages: ContextMessage[] = ctx.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    while (
      contextMessages.length > 0 &&
      contextMessages[contextMessages.length - 1].role === "assistant"
    ) {
      contextMessages.pop();
    }
    const messages: ChatMessage[] = contextMessages;
    if (messages.length === 0) {
      messages.push({ role: "user", content: node.question });
    }
    // 引用：重新生成时保持引用上下文（引用文本已持久化在节点 quote 列）
    if (node.quote) {
      while (
        messages.length > 0 &&
        messages[messages.length - 1].role === "user"
      ) {
        messages.pop();
      }
      messages.push({
        role: "user",
        content: `【引用内容】\n${node.quote}\n\n请结合以上引用及其出处上下文，回答：${node.question}`,
      });
    }

    // 流式生成（节流更新）
    const controller = new AbortController();
    streamController = controller;
    set({ streaming: true });
    // 立即清空旧内容显示（避免旧回答一直显示到新内容生成完）
    set((s) => ({
      streamingBuffer: { ...s.streamingBuffer, [nodeId]: "" },
    }));
    let answer = "";
    let lastRender = 0;
    const updateBuffer = (text: string) => {
      const t = Date.now();
      if (t - lastRender < 80) return;
      lastRender = t;
      set((s) => ({
        streamingBuffer: { ...s.streamingBuffer, [nodeId]: text },
      }));
    };
    try {
      for await (const chunk of providerManager.chat({
        messages,
        signal: controller.signal,
      })) {
        if (chunk.delta) {
          answer += chunk.delta;
          updateBuffer(answer);
        }
      }
    } catch (err) {
      const ce = err instanceof ChatError ? err : ChatError.fromError(err);
      if (ce.code !== "aborted") set({ uiError: ce.message });
    } finally {
      streamController = null;
      if (answer) {
        // 迁移旧答案为版本1（历史数据可能没有版本记录）
        const versions = await repos.answerVersions.list(nodeId);
        if (versions.length === 0 && node.answer) {
          await repos.answerVersions.add(nodeId, node.answer);
        }
        const newVersion = await repos.answerVersions.add(nodeId, answer);
        await repos.nodes.updateNode(nodeId, {
          answer,
          answerVersion: newVersion,
        });
      }
      set((s) => {
        const b = { ...s.streamingBuffer };
        delete b[nodeId];
        return { streamingBuffer: b };
      });
      set({ streaming: false });
      await get().refreshPath();
      useGraphStore.getState().bumpGraphVersion();
    }
  },

  switchAnswer: async (nodeId, dir) => {
    const { repos } = get();
    if (!repos) return;
    const node = await repos.nodes.getNode(nodeId);
    if (!node) return;
    const versions = await repos.answerVersions.list(nodeId);
    if (versions.length < 2) return;
    const idx = versions.findIndex((v) => v.version === node.answerVersion);
    const next = versions[Math.min(Math.max(idx + dir, 0), versions.length - 1)];
    if (!next || next.version === node.answerVersion) return;
    await repos.nodes.updateNode(nodeId, {
      answer: next.content,
      answerVersion: next.version,
    });
    await get().refreshPath();
  },

  exportMarkdown: async () => {
    const { repos, currentNodeId } = get();
    if (!repos || !currentNodeId) {
      set({ uiError: "请先创建对话，再导出 Markdown" });
      return;
    }
    try {
      const path = await repos.nodes.getPathToRoot(currentNodeId);
      const rootId = path[0]?.node.id ?? currentNodeId;
      const md = await exportTreeToMarkdown(repos, rootId);
      const name = `tongtu-${new Date().toISOString().slice(0, 10)}.md`;
      const saved = await saveTextFile(name, md, [
        { name: "Markdown", extensions: ["md"] },
      ]);
      if (saved) set({ notice: `✅ 已导出 Markdown：${saved}` });
    } catch (err) {
      set({ uiError: `导出失败：${(err as Error).message}` });
    }
  },

  importMarkdown: async () => {
    const { repos } = get();
    if (!repos) return;
    try {
      const file = await openTextFile([
        { name: "Markdown", extensions: ["md"] },
      ]);
      if (!file) return;
      // 确保有当前树：导入的节点必须归属某棵树（否则树状图不可见）
      let treeId = get().currentTreeId;
      if (!treeId) {
        const first = (await repos.trees.list())[0];
        treeId = first?.id ?? (await repos.trees.create("默认树")).id;
        set({ currentTreeId: treeId });
      }
      const root = await importMarkdownAsTree(repos, file.content, treeId);
      if (root) {
        await get().navigateTo(root.id);
        useGraphStore.getState().bumpGraphVersion();
        set({
          notice: `📄 已导入 Markdown，根节点：${root.question.slice(0, 20)}`,
        });
      } else {
        set({ uiError: "导入失败：未识别到标题结构（需要 # 标题）" });
      }
    } catch (err) {
      set({ uiError: `导入失败：${(err as Error).message}` });
    }
  },

  backupNow: async (silent = false) => {
    const { repos } = get();
    if (!repos) return;
    try {
      const json = await exportAll(repos);
      // 备份目录：数据随程序走（安装版=安装目录/backups；开发版=文档/AITreeBackups）
      const dataDir = await getAppDataDir();
      const dir = dataDir
        ? joinPath(dataDir, "backups")
        : await join(await documentDir(), "AITreeBackups");
      const file = await join(
        dir,
        `tongtu-backup-${new Date().toISOString().slice(0, 10)}.json`
      );
      await invoke("write_text_file", { path: file, content: json });
      await repos.settings.set("backup.lastBackupAt", new Date().toISOString());
      if (!silent) set({ notice: `💾 已备份：${file}`, noticeTone: "info" });
    } catch {
      // 备份失败静默（不打断用户）
    }
  },

  checkAutoBackup: async () => {
    const { repos } = get();
    if (!repos) return;
    const backupSettings = await repos.settings.get<{
      enabled?: boolean;
      intervalDays?: number;
    }>("backup", { enabled: true, intervalDays: 3 });
    if (backupSettings.enabled === false) return;
    const interval = backupSettings.intervalDays ?? 3;
    const last = await repos.settings.get<string | null>(
      "backup.lastBackupAt",
      null
    );
    if (
      last &&
      Date.now() - new Date(last).getTime() < interval * 86400000
    ) {
      return;
    }
    await get().backupNow(true);
  },

  cleanupNow: async () => {
    const { repos } = get();
    if (!repos) return null;
    const cleanupSettings = await repos.settings.get<{
      enabled?: boolean;
      days?: number;
    }>("cleanup", { enabled: true, days: 30 });
    if (cleanupSettings.enabled === false) return null;
    const days = cleanupSettings.days ?? 30;
    const result = await cleanupOnce(repos, days);
    const purged = await purgeExpired(repos);
    if (result.branches > 0 || purged > 0) {
      set({
        notice: `🧹 已清理 ${result.branches} 个不活跃分支（${result.nodes} 个节点）${
          purged > 0 ? `；回收站过期清理 ${purged} 项` : ""
        }`,
        noticeTone: "info",
      });
    }
    return { branches: result.branches, nodes: result.nodes };
  },
}));
