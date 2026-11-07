import { requireAuth } from "../auth";
import { behaviorFromRow, childFromRow, taskFromRow, type Row } from "../db";
import type { Env } from "../env";
import { json } from "../errors";
import { todayInShanghai } from "../../shared/dates";
import { SCHEMA_VERSION } from "../../shared/schema";

export async function getState(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);
  const [children, tasks, behaviors] = await Promise.all([
    env.DB.prepare("SELECT * FROM children ORDER BY nickname ASC").all<Row>(),
    env.DB.prepare("SELECT * FROM tasks ORDER BY due_date ASC, created_at ASC").all<Row>(),
    env.DB.prepare("SELECT * FROM behaviors ORDER BY occurred_on DESC, created_at DESC").all<Row>(),
  ]);
  return json({
    schemaVersion: SCHEMA_VERSION,
    today: todayInShanghai(),
    serverTime: new Date().toISOString(),
    children: children.results.map(childFromRow),
    tasks: tasks.results.map(taskFromRow),
    behaviors: behaviors.results.map(behaviorFromRow),
  });
}
