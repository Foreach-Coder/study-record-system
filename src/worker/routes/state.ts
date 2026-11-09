import { requireAuth } from "../auth";
import { behaviorFromRow, childFromRow, taskFromRow, type Row } from "../db";
import type { Env } from "../env";
import { json } from "../errors";
import { todayInShanghai } from "../../shared/dates";
import { SCHEMA_VERSION } from "../../shared/schema";

export async function getState(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);
  const [children, tasks, behaviors, meta] = await Promise.all([
    env.DB.prepare("SELECT * FROM children ORDER BY nickname ASC").all<Row>(),
    env.DB.prepare("SELECT * FROM tasks ORDER BY due_date ASC, created_at ASC, id ASC").all<Row>(),
    env.DB.prepare("SELECT * FROM behaviors ORDER BY occurred_on DESC, created_at DESC, id DESC").all<Row>(),
    env.DB.prepare("SELECT sync_cutoff_at FROM schema_meta WHERE id = 1").first<{ sync_cutoff_at: string | null }>(),
  ]);
  return json({
    schemaVersion: SCHEMA_VERSION,
    today: todayInShanghai(),
    serverTime: new Date().toISOString(),
    syncCutoffAt: meta?.sync_cutoff_at ?? null,
    children: children.results.map(childFromRow),
    tasks: tasks.results.map(taskFromRow),
    behaviors: behaviors.results.map(behaviorFromRow),
  });
}
