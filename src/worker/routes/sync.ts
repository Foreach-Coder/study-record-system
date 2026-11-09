import { requireAuth } from "../auth";
import type { Env } from "../env";
import { ApiProblem, json } from "../errors";
import { readJson } from "../http";

export async function updateSyncCutoff(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);
  const body = await readJson(request);
  const raw = typeof body.cutoffAt === "string" ? body.cutoffAt.trim() : "";
  if (!raw) throw new ApiProblem(422, "validation", "cutoffAt 不能为空", { cutoffAt: "请提供消息发送时间" });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiProblem(422, "validation", "cutoffAt 不是合法时间", { cutoffAt: "请提供 ISO 时间" });
  }
  const next = parsed.toISOString();
  await env.DB.prepare(
    `UPDATE schema_meta
        SET sync_cutoff_at = CASE
              WHEN sync_cutoff_at IS NULL OR sync_cutoff_at < ?1 THEN ?1
              ELSE sync_cutoff_at
            END,
            updated_at = ?2
      WHERE id = 1`,
  ).bind(next, new Date().toISOString()).run();
  const row = await env.DB.prepare("SELECT sync_cutoff_at FROM schema_meta WHERE id = 1")
    .first<{ sync_cutoff_at: string | null }>();
  return json({ ok: true, syncCutoffAt: row?.sync_cutoff_at ?? null });
}
