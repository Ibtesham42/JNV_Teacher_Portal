import { applyCleanup, previewCleanup } from "@/lib/teacherCleanup";
import { requireAdmin, route } from "@/lib/security/api";

/** Preview: what the tidy-up would merge / remove. Nothing is changed. */
export const GET = route(async () => {
  await requireAdmin();
  return { plan: await previewCleanup() };
});

/** Apply the tidy-up (the plan is recomputed on the server, never trusted from the client). */
export const POST = route(async () => {
  await requireAdmin();
  const plan = await previewCleanup();
  const r = await applyCleanup(plan);
  return { ok: true, ...r, remaining: plan.totalAfter };
});
