import type { LifeBookRunSnapshot } from "@short-drama/domain";

function mdEscape(value: string): string {
  return value.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderLifeBookMarkdown(snapshot: LifeBookRunSnapshot): string {
  const script = snapshot.script;
  const lines: string[] = [];
  lines.push(`# ${mdEscape(script?.title || snapshot.persona.title)}`);
  lines.push("");
  lines.push(`> Agent 每天替你过另一段人生。`);
  lines.push("");
  lines.push(`**人生副本**：${mdEscape(snapshot.persona.title)}`);
  lines.push(`**时代地点**：${mdEscape(snapshot.persona.era)} / ${mdEscape(snapshot.persona.location)}`);
  lines.push(`**身份**：${mdEscape(snapshot.persona.identity)}`);
  lines.push("");
  if (script?.logline) lines.push(`**一句话命运**：${mdEscape(script.logline)}`);
  if (script?.lifeArc) lines.push(`**人生弧光**：${mdEscape(script.lifeArc)}`);
  if (script?.relationshipArc) lines.push(`**关系弧光**：${mdEscape(script.relationshipArc)}`);
  lines.push("");
  if (script?.fullText) {
    lines.push("## 完整人生剧本");
    lines.push("");
    lines.push(mdEscape(script.fullText));
    lines.push("");
  }
  for (const chapter of script?.chapters ?? []) {
    lines.push(`## ${chapter.chapterIndex}. ${mdEscape(chapter.title)}（${mdEscape(chapter.ageRange)}）`);
    lines.push("");
    lines.push(`**命运选择**：${mdEscape(chapter.selectedChoiceLabel)}`);
    lines.push("");
    lines.push(mdEscape(chapter.fullText || chapter.summary));
    lines.push("");
    if (chapter.characterMoment) lines.push(`**人物瞬间**：${mdEscape(chapter.characterMoment)}`);
    if (chapter.consequence) lines.push(`**代价/伏笔**：${mdEscape(chapter.consequence)}`);
    if (chapter.cliffhanger) lines.push(`**转场**：${mdEscape(chapter.cliffhanger)}`);
    lines.push("");
    for (const page of chapter.pages) {
      lines.push(`### ${mdEscape(page.title)}`);
      lines.push(mdEscape(page.caption));
      if (page.imageUrl) lines.push(`图片：${page.imageUrl}`);
      lines.push("");
    }
  }
  lines.push("## 终章");
  lines.push("");
  if (script?.ending) lines.push(mdEscape(script.ending));
  if (script?.epitaph) lines.push(`> ${mdEscape(script.epitaph)}`);
  if (script?.scores?.length) {
    lines.push("");
    lines.push("## 人生评分");
    for (const score of script.scores) lines.push(`- ${mdEscape(score.label)}：${score.value}`);
  }
  return lines.join("\n");
}
