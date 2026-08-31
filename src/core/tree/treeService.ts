/**
 * TreeService：对话树核心业务逻辑
 * - addChild：追加普通子节点（同会话内继续）
 * - createBranch：创建分支（= 新会话起点，继承父链上下文）
 * - createNewStart：从新开始（不继承，虚线连接）
 * - createMerge：综合合并（多父链，创建新会话）
 *
 * ⚠️ 注意：不使用多语句事务（BEGIN/COMMIT）。
 * tauri-plugin-sql 底层为连接池（sqlx Pool），跨调用无法保证同一连接，
 * 事务内写入可能对其他连接不可见。因此改为顺序执行 + 失败补偿。
 */
import type { SqlBackend } from "../db/backend";
import type { NodeRepository, SessionRepository } from "../db";
import type { NodeType, RelationType, TreeEdge, TreeNode } from "../db/types";
import type { Session } from "../db/types";

export type InheritMode = "all" | "count" | "none";

export interface CreateBranchInput {
  /** 分支名称（会话名） */
  name?: string;
  /** 是否立即提问（创建后可直接继续对话） */
  question?: string;
  /** 继承模式：all=全部 / count=最近N条 / none=不继承（新开始） */
  inheritMode?: InheritMode;
  /** inheritMode=count 时的继承条数 */
  inheritCount?: number;
  color?: string;
  /** 所属树 */
  treeId?: string | null;
}

export interface CreateMergeInput {
  name?: string;
  question?: string;
  inheritCount?: number;
  color?: string;
  treeId?: string | null;
}

export interface BranchResult {
  node: TreeNode;
  edge: TreeEdge | null;
  session: Session;
}

export class TreeService {
  constructor(
    /** 保留兼容签名（事务已改为顺序执行+补偿，当前不使用） */
    _db: SqlBackend,
    private readonly nodes: NodeRepository,
    private readonly sessions: SessionRepository
  ) {}

  /** 在父节点下追加普通子节点（同会话内线性继续，继承上下文） */
  async addChild(
    parentNodeId: string,
    input: { question?: string; answer?: string; type?: NodeType; color?: string; treeId?: string | null } = {}
  ): Promise<{ node: TreeNode; edge: TreeEdge }> {
    const node = await this.nodes.createNode({
      question: input.question ?? "",
      answer: input.answer ?? "",
      type: input.type ?? "normal",
      color: input.color,
      treeId: input.treeId,
    });
    try {
      const edge = await this.nodes.addEdge(parentNodeId, node.id, "inherit");
      if (!edge) throw new Error("创建边失败");
      return { node, edge };
    } catch (err) {
      // 补偿：边创建失败时删除已创建的节点
      await this.nodes.softDeleteNode(node.id).catch(() => {});
      throw err;
    }
  }

  /** 创建分支（新会话起点）：
   * - 继承模式 all/count → 实线（继承关系）
   * - 继承模式 none → 虚线 + 新开始节点（不继承）
   */
  async createBranch(
    parentNodeId: string,
    input: CreateBranchInput = {}
  ): Promise<BranchResult> {
    const mode: InheritMode = input.inheritMode ?? "count";
    const isNewStart = mode === "none";
    const nodeType: NodeType = isNewStart ? "new_start" : "normal";
    const relation: RelationType = isNewStart ? "non_inherit" : "inherit";
    // 未显式指定树时，继承父节点的树（避免 tree_id 为 NULL 导致树状图不可见）
    const parentNode = await this.nodes.getNode(parentNodeId);
    const treeId = input.treeId ?? parentNode?.treeId ?? null;

    const node = await this.nodes.createNode({
      question: input.question ?? "",
      type: nodeType,
      color: isNewStart ? "#9a6b3f" : input.color, // 新开始节点用特殊颜色
      summary: isNewStart ? "新开始" : undefined,
      treeId,
    });

    try {
      const edge = await this.nodes.addEdge(parentNodeId, node.id, relation);

      // 查找父节点所属会话（作为新会话的 parent）
      const parentSession = await this.sessions.getByStartNode(parentNodeId);
      const session = await this.sessions.create({
        name: input.name ?? (input.question ? input.question.slice(0, 30) : "新分支"),
        startNodeId: node.id,
        parentId: parentSession?.id ?? null,
        inheritCount:
          mode === "count"
            ? input.inheritCount ?? 10
            : mode === "none"
              ? 0
              : -1, // -1 表示全部
      });

      return { node, edge, session };
    } catch (err) {
      await this.nodes.softDeleteNode(node.id).catch(() => {});
      throw err;
    }
  }

  /** 从新开始（显式语义，等价于 createBranch none 模式） */
  createNewStart(
    parentNodeId: string,
    input: Omit<CreateBranchInput, "inheritMode"> = {}
  ): Promise<BranchResult> {
    return this.createBranch(parentNodeId, { ...input, inheritMode: "none" });
  }

  /** 综合合并：从多条父链创建合并节点（新会话），每条父链均继承 */
  async createMerge(
    parentNodeIds: string[],
    input: CreateMergeInput = {}
  ): Promise<BranchResult & { edges: TreeEdge[] }> {
    if (parentNodeIds.length < 2) {
      throw new Error("合并至少需要两个父节点");
    }

    // 未显式指定树时，继承第一个父节点的树
    const firstParent = await this.nodes.getNode(parentNodeIds[0]);
    const treeId = input.treeId ?? firstParent?.treeId ?? null;

    const node = await this.nodes.createNode({
      question: input.question ?? "",
      type: "merge",
      color: input.color ?? "#5b5bd6", // 合并节点特殊颜色
      summary: "合并",
      treeId,
    });

    try {
      const edges: TreeEdge[] = [];
      for (const parentId of parentNodeIds) {
        const edge = await this.nodes.addEdge(parentId, node.id, "inherit");
        if (edge) edges.push(edge);
      }
      if (edges.length < 2) throw new Error("合并边创建失败");

      const session = await this.sessions.create({
        name: input.name ?? "综合合并",
        startNodeId: node.id,
        parentId: null,
        inheritCount: input.inheritCount ?? 10,
      });

      return { node, edge: edges[0], edges, session };
    } catch (err) {
      await this.nodes.softDeleteNode(node.id).catch(() => {});
      throw err;
    }
  }

  /**
   * 上下文链（从根到当前节点的完整消息序列）
   * 合并节点（多父）会综合**所有父链**的消息：递归收集各父链路径，
   * 去重（共享祖先只出现一次），按节点创建时间排序。
   */
  async getContextPath(
    nodeId: string
  ): Promise<Array<{ role: "user" | "assistant"; content: string; nodeId: string }>> {
    const entries: Array<{
      nodeId: string;
      role: "user" | "assistant";
      content: string;
      createdAt: string;
    }> = [];
    const seen = new Set<string>();
    await this.collectAncestors(nodeId, seen, entries);
    // 确保自身消息在列（多父时 collectAncestors 已收集，seen 去重）
    await this.pushNodeMessages(nodeId, seen, entries);
    entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return entries.map((e) => ({
      role: e.role,
      content: e.content,
      nodeId: e.nodeId,
    }));
  }

  /**
   * 合并节点上下文：每条父链各取最近 N 条消息，合并去重后按时间排序。
   * 与 getContextPath（全量综合）的区别：按"每链 N 条"截断，
   * 避免全局 slice 把后创建的父链全部截掉（只剩一条链）。
   */
  async getMergeContextPath(
    nodeId: string,
    perChainCount: number
  ): Promise<Array<{ role: "user" | "assistant"; content: string; nodeId: string }>> {
    const parents = await this.nodes.getParentsWithEdge(nodeId);
    const entries: Array<{
      nodeId: string;
      role: "user" | "assistant";
      content: string;
      createdAt: string;
    }> = [];
    const seen = new Set<string>();
    const n = Math.max(1, perChainCount);
    for (const p of parents) {
      // 该父链从根到父的完整路径（含父自身）
      const path = await this.nodes.getPathToRoot(p.parent.id);
      const chain: Array<{
        nodeId: string;
        role: "user" | "assistant";
        content: string;
        createdAt: string;
      }> = [];
      for (const seg of path) {
        const nd = seg.node;
        if (nd.question) {
          chain.push({
            nodeId: nd.id,
            role: "user",
            content: nd.question,
            createdAt: nd.createdAt,
          });
        }
        if (nd.answer) {
          chain.push({
            nodeId: nd.id,
            role: "assistant",
            content: nd.answer,
            createdAt: nd.createdAt,
          });
        }
      }
      // 每条链取最近 N 条消息
      for (const e of chain.slice(-n)) {
        if (seen.has(e.nodeId)) continue;
        seen.add(e.nodeId);
        entries.push(e);
      }
    }
    // 合并节点自身消息
    await this.pushNodeMessages(nodeId, seen, entries);
    entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return entries.map((e) => ({
      role: e.role,
      content: e.content,
      nodeId: e.nodeId,
    }));
  }

  /** 递归收集祖先消息：多父节点展开所有父链，单父/根沿主链回溯 */
  private async collectAncestors(
    nodeId: string,
    seen: Set<string>,
    entries: Array<{
      nodeId: string;
      role: "user" | "assistant";
      content: string;
      createdAt: string;
    }>
  ): Promise<void> {
    // 防环保护（异常数据可能形成循环边）
    if (seen.has(nodeId)) return;
    const parents = await this.nodes.getParentsWithEdge(nodeId);
    if (parents.length > 1) {
      // 合并节点：自身消息 + 所有父链递归
      await this.pushNodeMessages(nodeId, seen, entries);
      for (const p of parents) {
        await this.collectAncestors(p.parent.id, seen, entries);
      }
      return;
    }
    const path = await this.nodes.getPathToRoot(nodeId);
    for (const seg of path) {
      await this.pushNodeMessages(seg.node.id, seen, entries);
    }
  }

  /** 收集单个节点的消息（去重） */
  private async pushNodeMessages(
    nodeId: string,
    seen: Set<string>,
    entries: Array<{
      nodeId: string;
      role: "user" | "assistant";
      content: string;
      createdAt: string;
    }>
  ): Promise<void> {
    if (seen.has(nodeId)) return;
    const n = await this.nodes.getNode(nodeId);
    if (!n) return;
    seen.add(nodeId);
    if (n.question) {
      entries.push({
        nodeId: n.id,
        role: "user",
        content: n.question,
        createdAt: n.createdAt,
      });
    }
    if (n.answer) {
      entries.push({
        nodeId: n.id,
        role: "assistant",
        content: n.answer,
        createdAt: n.createdAt,
      });
    }
  }
}
