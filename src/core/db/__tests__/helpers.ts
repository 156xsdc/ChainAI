/** 测试辅助：内存 SQLite + 完整仓库集合 */
import { NodeSqliteBackend } from "../backend";
import { createRepositories, initSchema, type AppRepositories } from "../index";

export async function createTestDb(): Promise<AppRepositories> {
  const backend = new NodeSqliteBackend(":memory:");
  await initSchema(backend);
  return createRepositories(backend);
}
