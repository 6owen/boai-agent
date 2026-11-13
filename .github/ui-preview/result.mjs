/*
 * [INPUT]: 录制计划、实际场景/步骤计数及 Actions 录制结果。
 * [OUTPUT]: 明确的完整、部分、失败或跳过；截图存在不等于计划完成。
 * [POS]: 录制与发布共用的纯结果规则。
 * [PROTOCOL]: 变化同步 Header 和所属 .folder.md。
 */
export const PREVIEW_VIEWS = ['chat', 'contacts', 'schedules', 'resources', 'settings'];
const actions = new Set(['click', 'hover', 'type', 'press', 'scroll', 'wait', 'shot']);

export function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || typeof plan.ui_change !== 'boolean' || !Array.isArray(plan.scenes)) throw new Error('录制计划缺少 ui_change 或 scenes');
  if (!plan.ui_change && plan.scenes.length === 0) return;
  if (!plan.ui_change || !plan.scenes.length || plan.scenes.length > 5) throw new Error('UI 录制必须包含 1–5 个场景');
  for (const scene of plan.scenes) {
    if (!PREVIEW_VIEWS.includes(scene?.start)) throw new Error(`未知录制页面：${scene?.start}`);
    if (!Array.isArray(scene.steps) || !scene.steps.length || scene.steps.length > 25 || !scene.steps.some(step => step?.do === 'shot')) throw new Error('每个场景需要 1–25 个步骤和至少一张截图');
    if (scene.steps.some(step => !actions.has(step?.do))) throw new Error('录制计划包含未知操作');
  }
}

export function previewOutcome(manifest, recordResult = 'success') {
  if (!manifest || manifest.leak || !Array.isArray(manifest.scenes) || manifest.scenes.some(scene => !scene || !Array.isArray(scene.shots))) return 'failed';
  const media = manifest.video || manifest.scenes.some(scene => scene.shots.length);
  const errors = !Array.isArray(manifest.errors) || manifest.errors.length > 0;
  if (manifest.skipped === 'no visible UI change found in the diff' && !errors && !media && recordResult === 'success') return 'skipped';
  if (!media) return 'failed';
  const complete = manifest.version === 1 && Number.isInteger(manifest.plannedScenes) && manifest.plannedScenes > 0 && manifest.plannedScenes === manifest.scenes.length &&
    manifest.scenes.every(scene => scene.status === 'complete' && scene.shots?.length > 0 && Number.isInteger(scene.plannedSteps) && scene.plannedSteps > 0 && scene.completedSteps === scene.plannedSteps && scene.failedSteps === 0);
  return complete && !errors && recordResult === 'success' ? 'complete' : 'partial';
}

export function recordingSummary(manifest, recordResult) {
  const status = previewOutcome(manifest, recordResult);
  const labels = { complete: '完整', partial: '部分完成', failed: '失败', skipped: '无需录制' };
  const scenes = Array.isArray(manifest?.scenes) ? manifest.scenes.filter(Boolean) : [];
  const completed = scenes.filter(scene => scene.status === 'complete').length;
  const counts = manifest?.plannedScenes ? ` · ${completed}/${manifest.plannedScenes} 个场景完成` : '';
  return `**录制：${labels[status]}**${counts}。固定 UI 行为断言见 Test，本预览供效果审阅。`;
}
