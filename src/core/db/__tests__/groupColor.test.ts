import { describe, it, expect } from "vitest";
import { createTestDb } from "./helpers";

describe("分组颜色更新链路", () => {
  it("updateGroup 颜色更新后 listGroups 能读到", async () => {
    const repo = await createTestDb();
    const g = await repo.groups.createGroup({ name: "测试组" });
    expect(g.color).toBe("#dcdcdc");

    await repo.groups.updateGroup(g.id, { color: "#E8F1F8" });
    const list = await repo.groups.listGroups();
    expect(list[0].color).toBe("#E8F1F8");
  });
});
