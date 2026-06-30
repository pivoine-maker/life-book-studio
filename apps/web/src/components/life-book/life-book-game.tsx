"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { LifeBookRunSnapshot, LifeSelectedDecision } from "@short-drama/domain";

function panel(extra?: CSSProperties): CSSProperties {
  return { background: "rgba(15,23,42,.78)", border: "1px solid rgba(226,232,240,.14)", borderRadius: 24, padding: 20, boxShadow: "0 24px 80px rgba(0,0,0,.28)", ...extra };
}
function button(kind: "primary" | "secondary" | "ghost" = "secondary"): CSSProperties {
  return { border: kind === "primary" ? "none" : "1px solid rgba(226,232,240,.16)", borderRadius: 14, padding: "12px 16px", color: "#fff7ed", background: kind === "primary" ? "linear-gradient(135deg,#a855f7,#2563eb,#0891b2)" : kind === "ghost" ? "transparent" : "rgba(30,41,59,.86)", fontWeight: 800, cursor: "pointer" };
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

export function LifeBookGame() {
  const [snapshot, setSnapshot] = useState<LifeBookRunSnapshot | null>(null);
  const [seedText, setSeedText] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const pages = useMemo(() => snapshot?.script?.chapters.flatMap((chapter) => chapter.pages.map((page) => ({ ...page, title: `${chapter.title}｜${page.title}` }))) ?? [], [snapshot]);
  const page = pages[Math.min(pageIndex, Math.max(0, pages.length - 1))];
  const allSelected = Boolean(snapshot?.questionnaire.length) && snapshot!.questionnaire.every((q) => selected[q.questionId]);

  const refresh = async (runId: string) => {
    const data = (await (await fetch(`/api/life-book-runs/${runId}`)).json()) as { snapshot?: LifeBookRunSnapshot };
    if (data.snapshot) setSnapshot(data.snapshot);
  };

  const createRun = async () => {
    setBusy(true); setError(null);
    try {
      const data = await postJson<{ snapshot: LifeBookRunSnapshot }>("/api/life-book-runs", { seedText });
      setSnapshot(data.snapshot);
      setSelected({});
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  const submitDecisions = async () => {
    if (!snapshot) return;
    setBusy(true); setError(null);
    try {
      const selectedDecisions: LifeSelectedDecision[] = Object.entries(selected).map(([questionId, optionId]) => ({ questionId, optionId }));
      const data = await postJson<{ snapshot: LifeBookRunSnapshot }>(`/api/life-book-runs/${snapshot.runId}/submit-decisions`, { selectedDecisions });
      setSnapshot(data.snapshot);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  const renderBook = async () => {
    if (!snapshot) return;
    const startedAt = new Date().toISOString();
    setRendering(true);
    setError(null);
    setSnapshot({
      ...snapshot,
      status: "rendering",
      renderJob: {
        status: "rendering",
        totalPages: snapshot.renderJob?.totalPages || pages.length,
        generatedPages: snapshot.renderJob?.generatedPages || 0,
        startedAt,
        updatedAt: startedAt,
      },
    });
    void postJson<{ snapshot: LifeBookRunSnapshot }>(`/api/life-book-runs/${snapshot.runId}/render`, {})
      .then((data) => setSnapshot(data.snapshot))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setRendering(false));
  };

  useEffect(() => {
    if (!snapshot?.runId) return;
    if (snapshot.renderJob?.status !== "rendering") return;
    const id = window.setInterval(() => void refresh(snapshot.runId), 1800);
    return () => window.clearInterval(id);
  }, [snapshot?.runId, snapshot?.renderJob?.status, snapshot?.updatedAt]);

  return <div style={{ minHeight: "100vh", padding: 20, color: "#f8fafc", background: "radial-gradient(circle at 20% 0%, rgba(56,189,248,.25), transparent 32%), radial-gradient(circle at 80% 12%, rgba(168,85,247,.24), transparent 32%), #020617" }}>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(440px,.95fr) minmax(560px,1.05fr)", gap: 18, height: "calc(100vh - 40px)" }}>
      <section style={{ ...panel({ overflowY: "auto", display: "grid", gap: 16, alignContent: "start" }) }}>
        <div><div style={{ color: "#38bdf8", fontSize: 12, fontWeight: 900, letterSpacing: 1.4 }}>LIFE BOOK STUDIO</div><h1 style={{ margin: "8px 0 0", fontSize: 34 }}>一次性选完人生，生成完整故事书</h1></div>
        {!snapshot && <div style={{ ...panel(), display: "grid", gap: 12 }}>
          <textarea value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder="输入你想体验的人生副本，例如：20世纪80年代韩国财阀家小儿子的一生" style={{ minHeight: 100, borderRadius: 14, padding: 14, background: "rgba(2,6,23,.7)", color: "#f8fafc", border: "1px solid rgba(226,232,240,.14)" }} />
          <button style={button("primary")} disabled={busy} onClick={() => void createRun()}>{busy ? "生成问卷中..." : "生成完整人生问卷"}</button>
        </div>}
        {snapshot && <>
          <div style={panel()}><div style={{ color: "#94a3b8", fontSize: 12 }}>人生副本</div><h2>{snapshot.persona.title}</h2><div style={{ lineHeight: 1.7, color: "#cbd5e1" }}>{snapshot.persona.coreTension}</div></div>
          {snapshot.questionnaire.map((q, i) => <div key={q.questionId} style={panel()}>
            <div style={{ color: "#38bdf8", fontWeight: 900 }}>#{i + 1} · {q.lifeAge}</div><h3>{q.stageTitle}</h3><p style={{ color: "#cbd5e1", lineHeight: 1.7 }}>{q.setup}</p><p style={{ color: "#fde68a" }}>赌注：{q.stakes}</p>
            <div style={{ display: "grid", gap: 10 }}>{q.options.map((o) => <button key={o.choiceId} onClick={() => setSelected((s) => ({ ...s, [q.questionId]: o.choiceId }))} style={{ textAlign: "left", borderRadius: 14, padding: 14, border: selected[q.questionId] === o.choiceId ? "2px solid #38bdf8" : "1px solid rgba(226,232,240,.14)", background: "rgba(30,41,59,.86)", color: "#f8fafc" }}>
              <b>{o.label}</b><div style={{ color: "#dbeafe", marginTop: 6 }}>{o.description}</div><div style={{ color: "#94a3b8", fontSize: 12, marginTop: 8 }}>短期：{o.shortTermTradeoff}｜长期：{o.longTermRisk}</div>
            </button>)}</div>
          </div>)}
          {snapshot.status === "questionnaire_ready" && <button style={button("primary")} disabled={busy || !allSelected} onClick={() => void submitDecisions()}>{busy ? "写完整人生中..." : "提交选择，生成完整故事书剧本"}</button>}
          {snapshot.script && <div style={panel({ display: "grid", gap: 12 })}>
            <h2 style={{ margin: 0 }}>完整人生剧本</h2>
            <div style={{ color: "#cbd5e1", lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 520, overflowY: "auto", paddingRight: 8 }}>
              {snapshot.script.fullText || snapshot.script.chapters.map((chapter) => `## ${chapter.title}\n\n${chapter.fullText || chapter.summary}`).join("\n\n")}
            </div>
          </div>}
          {snapshot.script && <button style={button("primary")} disabled={rendering || snapshot.renderJob?.status === "rendering"} onClick={() => void renderBook()}>{rendering || snapshot.renderJob?.status === "rendering" ? "绘图中..." : "开始绘制完整故事书"}</button>}
          {snapshot && <a style={{ ...button("ghost"), textAlign: "center" }} href={`/api/life-book-runs/${snapshot.runId}/download`}>下载 JSON</a>}
        </>}
        {error && <div style={{ color: "#fecaca", background: "rgba(127,29,29,.5)", padding: 12, borderRadius: 12 }}>{error}</div>}
      </section>
      <section style={{ ...panel({ display: "grid", gridTemplateRows: "auto 1fr auto", gap: 14, minHeight: 0 }) }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div><div style={{ color: "#38bdf8", fontSize: 12, fontWeight: 900 }}>COMPLETE STORYBOOK</div><h2>{snapshot?.script?.title || "等待故事书生成"}</h2>{snapshot?.renderJob && <div style={{ color: "#94a3b8" }}>绘图：{snapshot.renderJob.generatedPages}/{snapshot.renderJob.totalPages} · {snapshot.renderJob.status}{snapshot.renderJob.error ? ` · ${snapshot.renderJob.error}` : ""}</div>}</div>
          {snapshot?.anchorPack?.anchors?.length ? <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
            {snapshot.anchorPack.anchors.map((anchor) => <div key={anchor.anchorId} style={{ width: 110, flex: "0 0 auto", border: "1px solid rgba(226,232,240,.14)", borderRadius: 12, overflow: "hidden", background: "rgba(2,6,23,.5)" }}>
              {anchor.imageUrl ? <img src={anchor.imageUrl} alt={anchor.label} style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} /> : <div style={{ aspectRatio: "1/1", display: "grid", placeItems: "center", color: "#64748b", fontSize: 12 }}>锚点生成中</div>}
              <div style={{ padding: 6, fontSize: 11, color: anchor.status === "generated" ? "#bbf7d0" : "#fca5a5" }}>{anchor.label} · {anchor.status}</div>
            </div>)}
          </div> : (snapshot?.renderJob?.status === "rendering" ? <div style={{ color: "#94a3b8", fontSize: 12 }}>正在生成角色锚点图，锚点完成后会并行绘制故事页。</div> : null)}
        </div>
        {page ? <div style={{ minHeight: 0, display: "grid", gridTemplateRows: "minmax(0,1fr) auto", gap: 12 }}><div style={{ borderRadius: 20, overflow: "hidden", background: "#020617" }}>{page.imageUrl ? <img src={page.imageUrl} alt={page.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#94a3b8" }}>{snapshot?.renderJob?.status === "rendering" ? "并行绘图中" : "等待绘图"}：{page.title}</div>}</div><div><h3>{page.title}</h3><p style={{ color: "#cbd5e1", lineHeight: 1.7 }}>{page.caption}</p></div></div> : <div style={{ display: "grid", placeItems: "center", border: "1px dashed rgba(226,232,240,.18)", borderRadius: 20, color: "#94a3b8" }}>完整剧本生成后会显示章节和页面</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><button style={button()} disabled={pageIndex <= 0} onClick={() => setPageIndex((v) => Math.max(0, v - 1))}>上一页</button><b>{pages.length ? `${pageIndex + 1}/${pages.length}` : "0/0"}</b><button style={button()} disabled={pageIndex >= pages.length - 1} onClick={() => setPageIndex((v) => Math.min(pages.length - 1, v + 1))}>下一页</button></div>
      </section>
    </div>
  </div>;
}
