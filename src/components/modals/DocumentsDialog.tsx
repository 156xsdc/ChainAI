/**
 * 资料库对话框：当前树的 PDF 资料
 * - 导入（解析文字层，扫描件会提示不支持）
 * - 勾选 + 页码范围 → 附带发送
 * - 删除
 */
import { useEffect, useMemo, useState } from "react";
import { FileText, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { Modal } from "../common/Modal";
import { useChatStore } from "../../store/chatStore";
import { confirmDialog } from "../../store/dialogStore";
import { buildDocContext, parsePageRange } from "../../core/documents/context";
import { estimateImageTokens } from "../../core/ai/multimodal";
import type { DocRef } from "../../core/db";

export function DocumentsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const documents = useChatStore((s) => s.documents);
  const pendingDocs = useChatStore((s) => s.pendingDocs);
  const loadDocuments = useChatStore((s) => s.loadDocuments);
  const importDocument = useChatStore((s) => s.importDocument);
  const importImage = useChatStore((s) => s.importImage);
  const deleteDocument = useChatStore((s) => s.deleteDocument);
  const setPendingDocs = useChatStore((s) => s.setPendingDocs);

  /** docId → 页码范围（默认全部） */
  const [ranges, setRanges] = useState<Record<string, string>>({});
  /** 勾选中的文档 */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 每次打开：用已有的附带状态回填勾选
  useEffect(() => {
    if (!open) return;
    void loadDocuments();
    setSelected(new Set(pendingDocs.map((d) => d.docId)));
    const init: Record<string, string> = {};
    for (const d of pendingDocs) init[d.docId] = d.pages;
    setRanges(init);
  }, [open, loadDocuments, pendingDocs]);

  /** 估算 token（按当前勾选与页码） */
  const estimate = useMemo(() => {
    let tokens = 0;
    let pages = 0;
    for (const doc of documents) {
      if (!selected.has(doc.id)) continue;
      if (doc.kind === "image") {
        tokens += estimateImageTokens([
          { mimeType: doc.mimeType, data: "", width: doc.width, height: doc.height },
        ]);
        pages += 1;
        continue;
      }
      const block = buildDocContext(doc, ranges[doc.id] ?? "all");
      tokens += block.tokens;
      pages += block.pageCount;
    }
    return { tokens, pages };
  }, [documents, selected, ranges]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = () => {
    const refs: DocRef[] = [];
    for (const doc of documents) {
      if (!selected.has(doc.id)) continue;
      if (doc.kind === "image") {
        refs.push({
          docId: doc.id,
          name: doc.name,
          pages: "",
          kind: "image",
          thumb: doc.thumb || undefined,
        });
        continue;
      }
      const range = (ranges[doc.id] ?? "all").trim() || "all";
      const picked = parsePageRange(range, doc.pages.length);
      refs.push({
        docId: doc.id,
        name: doc.name,
        kind: "pdf",
        pages:
          picked.length === doc.pages.length
            ? "all"
            : picked.length === 0
              ? "all"
              : `${picked[0] + 1}${picked.length > 1 ? `-${picked[picked.length - 1] + 1}` : ""}`,
      });
    }
    setPendingDocs(refs);
    onClose();
  };

  const handleDelete = async (docId: string, name: string) => {
    const ok = await confirmDialog({
      title: "删除资料",
      message: `删除「${name}」？只删资料库里的副本与提取文字，不影响已发出的消息内容。`,
      confirmText: "删除",
      danger: true,
    });
    if (ok) await deleteDocument(docId);
  };

  return (
    <Modal open={open} title="资料库" onClose={onClose} width={520}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-neutral-400">
            当前树的 PDF 资料（只支持有文字层的 PDF）
          </span>
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={() => void importDocument()}
              className="flex items-center gap-1 rounded-lg bg-neutral-800 px-2.5 py-1.5 text-[11px] text-white hover:bg-neutral-700"
            >
              <Plus size={12} /> PDF
            </button>
            <button
              onClick={() => void importImage()}
              className="flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[11px] text-neutral-600 hover:bg-neutral-100"
            >
              <ImageIcon size={12} /> 图片
            </button>
          </div>
        </div>

        <div className="max-h-[46vh] min-h-[100px] overflow-y-auto rounded-xl border border-neutral-200">
          {documents.length === 0 && (
            <div className="px-3 py-8 text-center text-[11px] text-neutral-400">
              还没有资料，点右上角「导入 PDF」
            </div>
          )}
          {documents.map((doc) => {
            const checked = selected.has(doc.id);
            return (
              <div
                key={doc.id}
                className={`flex items-center gap-2 border-b border-neutral-100 px-3 py-2 last:border-b-0 ${
                  checked ? "bg-neutral-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 accent-neutral-800"
                  checked={checked}
                  onChange={() => toggle(doc.id)}
                />
                {doc.kind === "image" && doc.thumb ? (
                  <img
                    src={doc.thumb}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded border border-neutral-200 object-cover"
                  />
                ) : (
                  <FileText size={13} className="shrink-0 text-neutral-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-neutral-700">
                    {doc.name}
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    {doc.kind === "image"
                      ? `${doc.width}×${doc.height} 图片`
                      : `${doc.pageCount} 页`}
                  </div>
                </div>
                {checked && doc.kind !== "image" && (
                  <input
                    value={ranges[doc.id] ?? "all"}
                    onChange={(e) =>
                      setRanges((prev) => ({ ...prev, [doc.id]: e.target.value }))
                    }
                    placeholder="页范围 如 1-5"
                    className="w-24 shrink-0 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-neutral-400"
                    title="页码范围：1-5 / 3 / 1,3,5 / all"
                  />
                )}
                <button
                  onClick={() => void handleDelete(doc.id, doc.name)}
                  className="shrink-0 rounded p-1 text-neutral-300 hover:bg-neutral-100 hover:text-red-500"
                  title="删除资料"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[11px] text-neutral-400">
            {selected.size > 0
              ? `已选 ${selected.size} 份 · ${estimate.pages} 页 · 约 ${estimate.tokens} tokens`
              : "勾选资料后可附带发送"}
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={onClose}
              className="rounded-xl px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
            >
              取消
            </button>
            <button
              onClick={apply}
              className="rounded-xl bg-neutral-800 px-3 py-1.5 text-xs text-white hover:bg-neutral-700"
            >
              附带
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
