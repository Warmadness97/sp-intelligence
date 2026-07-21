import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  LayoutDashboard, Briefcase, GitCompare, AlertTriangle, Settings as SettingsIcon,
  RefreshCw, Sparkles, Plus, Trash2, X, ChevronDown, ChevronUp, TrendingUp,
  TrendingDown, Minus, Loader2, Info
} from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, Tooltip
} from "recharts";

/* ---------------------------------------------------------------
   Design tokens
   bg #0A0E14 / panel #131822 / panel-alt #1B222E / border #262F3D
   text-primary #ECEFF3 / text-secondary #8B94A6
   accent (signature) gold #C9A227 · FCN steel-blue #5B8DEF · BEN gold #C9A227
   risk: safe #4ADE80 · watch #FBBF24 · danger #F87171
------------------------------------------------------------------*/

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
`;

const DIMENSIONS = [
  { key: "macro", label: "宏觀經濟", sub: "利率／通膨／央行" },
  { key: "volatility", label: "市場波動", sub: "VIX／MOVE／信用利差" },
  { key: "underlying", label: "標的健康度", sub: "趨勢／波動／財報" },
  { key: "sentiment", label: "AI新聞情緒", sub: "新聞情緒分析" },
  { key: "technical", label: "技術面", sub: "均線／RSI／MACD" },
  { key: "holdingRisk", label: "持倉風險", sub: "距KI／集中度／到期分布" },
];

const DEFAULT_WEIGHTS = {
  BASE: { macro: 25, volatility: 20, underlying: 20, sentiment: 15, technical: 10, holdingRisk: 10 },
  FCN:  { macro: 18, volatility: 30, underlying: 15, sentiment: 12, technical: 7,  holdingRisk: 18 },
  BEN:  { macro: 18, volatility: 14, underlying: 26, sentiment: 12, technical: 20, holdingRisk: 10 },
};

const DEFAULT_SCORES = { macro: 55, volatility: 50, underlying: 60, sentiment: 55, technical: 50 };

function riskZone(distance) {
  if (distance === null || distance === undefined || isNaN(distance)) return { label: "未設定", color: "#8B94A6" };
  if (distance >= 25) return { label: "安全", color: "#4ADE80" };
  if (distance >= 15) return { label: "留意", color: "#FBBF24" };
  if (distance >= 8) return { label: "警戒", color: "#F97316" };
  return { label: "危險", color: "#F87171" };
}

function holdingRiskSubscore(distance) {
  if (distance === null || distance === undefined || isNaN(distance)) return 60;
  if (distance >= 25) return 95;
  if (distance >= 15) return 75;
  if (distance >= 8) return 50;
  if (distance >= 3) return 25;
  return 10;
}

function weightedScore(scores, weights) {
  let total = 0;
  for (const d of DIMENSIONS) total += (scores[d.key] ?? 0) * (weights[d.key] ?? 0) / 100;
  return Math.round(total * 10) / 10;
}

function scoreBand(score) {
  if (score >= 75) return { label: "偏積極", color: "#4ADE80" };
  if (score >= 45) return { label: "中性", color: "#FBBF24" };
  return { label: "偏保守", color: "#F87171" };
}

function uid() { return Math.random().toString(36).slice(2, 10); }

// Browser localStorage — this is a standalone site (not a Claude.ai artifact),
// so persisting to the visitor's own browser is the right, privacy-friendly default.
async function storageGet(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
async function storageSet(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* best effort */ }
}

// Calls our own /api/claude serverless function, which holds the real Anthropic
// API key server-side (see api/claude.js). The browser never sees the key.
async function callClaude(promptText) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: promptText }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "AI 服務暫時無法使用");
  const text = (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
  return text;
}

function parseJsonLoose(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e) { return null; }
}

/* ---------------------------------------------------------------
   Small UI atoms
------------------------------------------------------------------*/

function Badge({ children, color }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: `${color}1A`, color, border: `1px solid ${color}44` }}
    >
      {children}
    </span>
  );
}

function Panel({ children, className = "" }) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{ backgroundColor: "#131822", border: "1px solid #262F3D" }}
    >
      {children}
    </div>
  );
}

function StatLabel({ children }) {
  return (
    <div className="text-xs uppercase tracking-wider" style={{ color: "#8B94A6", fontFamily: "Inter, sans-serif" }}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------
   Score computation hook-like helper
------------------------------------------------------------------*/

function useComputedScores(holdings, dimScores, weights) {
  return useMemo(() => {
    const withType = (type) => holdings.filter((h) => h.type === type);
    const avgHoldingRisk = (list) => {
      if (list.length === 0) return 60;
      const sum = list.reduce((a, h) => a + holdingRiskSubscore(h.kiDistance), 0);
      return Math.round((sum / list.length) * 10) / 10;
    };

    const fcnHoldings = withType("FCN");
    const benHoldings = withType("BEN");

    const overallScores = { ...dimScores, holdingRisk: avgHoldingRisk(holdings) };
    const fcnScores = { ...dimScores, holdingRisk: avgHoldingRisk(fcnHoldings) };
    const benScores = { ...dimScores, holdingRisk: avgHoldingRisk(benHoldings) };

    return {
      overall: weightedScore(overallScores, weights.BASE),
      fcn: fcnHoldings.length ? weightedScore(fcnScores, weights.FCN) : null,
      ben: benHoldings.length ? weightedScore(benScores, weights.BEN) : null,
      fcnCount: fcnHoldings.length,
      benCount: benHoldings.length,
      overallScores,
    };
  }, [holdings, dimScores, weights]);
}

/* ---------------------------------------------------------------
   Main App
------------------------------------------------------------------*/

export default function SPIntelligencePlatform() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [holdings, setHoldings] = useState([]);
  const [dimScores, setDimScores] = useState(DEFAULT_SCORES);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [reports, setReports] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    (async () => {
      const [h, s, w, r] = await Promise.all([
        storageGet("sp-holdings"),
        storageGet("sp-dimension-scores"),
        storageGet("sp-custom-weights"),
        storageGet("sp-ai-reports"),
      ]);
      if (h) setHoldings(h);
      if (s) setDimScores(s);
      if (w) setWeights(w);
      if (r) setReports(r);
      setReady(true);
    })();
  }, []);

  const persistHoldings = useCallback((next) => {
    setHoldings(next);
    storageSet("sp-holdings", next);
  }, []);
  const persistScores = useCallback((next) => {
    setDimScores(next);
    storageSet("sp-dimension-scores", next);
  }, []);
  const persistWeights = useCallback((next) => {
    setWeights(next);
    storageSet("sp-custom-weights", next);
  }, []);
  const persistReports = useCallback((next) => {
    setReports(next);
    storageSet("sp-ai-reports", next);
  }, []);

  const computed = useComputedScores(holdings, dimScores, weights);

  const addHolding = (holding) => persistHoldings([...holdings, { ...holding, id: uid() }]);
  const removeHolding = (id) => persistHoldings(holdings.filter((h) => h.id !== id));
  const updateHolding = (id, patch) => persistHoldings(holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)));

  const generateReport = async () => {
    setAiLoading(true);
    setAiError("");
    try {
      const holdingsSummary = holdings.length
        ? holdings.map((h) => `${h.name}(${h.type}, 標的:${h.underlyings}, 距KI:${h.kiDistance ?? "未設定"}%, 到期:${h.maturityDate || "未設定"})`).join("；")
        : "目前無持倉";
      const prompt = `你是專門追蹤 FCN（Fixed Coupon Note）與 BEN（Bonus Enhanced Note）結構型商品的市場分析助理。請使用網路搜尋工具確認今天的最新總體經濟與市場波動狀況（利率、通膨、VIX、信用利差等），然後只回覆一個 JSON 物件，不要有任何前言、註解或 Markdown 符號，格式如下：
{"summary":"針對結構型商品投資人的今日總經與市場摘要，繁體中文，80-120字","stance":"偏保守 或 中性 或 偏積極","reasoning":"給出此投資積極度建議的理由，繁體中文，60-100字","alerts":["風險警示1","風險警示2"]}

背景資訊：
目前 SP Intelligence Score（0-100，分數越高代表市場與持倉狀況越有利）＝ ${computed.overall}
六大構面分數：宏觀經濟=${dimScores.macro}、市場波動=${dimScores.volatility}、標的健康度=${dimScores.underlying}、AI新聞情緒=${dimScores.sentiment}、技術面=${dimScores.technical}、持倉風險=${computed.overallScores.holdingRisk}
目前持倉：${holdingsSummary}

alerts 陣列請針對距離 Knock-In 過近（如小於 10%）或到期集中、標的集中等情況提出具體警示；若無明顯風險可回傳空陣列。`;

      const text = await callClaude(prompt);
      const parsed = parseJsonLoose(text);
      const entry = {
        id: uid(),
        timestamp: new Date().toISOString(),
        summary: parsed?.summary || text || "AI 未回傳有效內容",
        stance: parsed?.stance || "中性",
        reasoning: parsed?.reasoning || "",
        alerts: parsed?.alerts || [],
      };
      persistReports([entry, ...reports].slice(0, 8));
    } catch (e) {
      setAiError("AI 報告產生失敗，請稍後再試一次。");
    } finally {
      setAiLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0A0E14" }}>
        <style>{FONT_IMPORT}</style>
        <div className="flex items-center gap-3" style={{ color: "#8B94A6", fontFamily: "Inter, sans-serif" }}>
          <Loader2 className="animate-spin" size={20} />
          <span>載入平台資料中…</span>
        </div>
      </div>
    );
  }

  const latestReport = reports[0];
  const band = scoreBand(computed.overall);

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#0A0E14", fontFamily: "Inter, sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      <Sidebar tab={tab} setTab={setTab} />
      <main className="flex-1 min-w-0">
        <TopBar computed={computed} band={band} latestReport={latestReport} />
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
          {tab === "dashboard" && (
            <Dashboard
              computed={computed}
              dimScores={dimScores}
              weights={weights}
              holdings={holdings}
              band={band}
              reports={reports}
              generateReport={generateReport}
              aiLoading={aiLoading}
              aiError={aiError}
            />
          )}
          {tab === "holdings" && (
            <HoldingsView holdings={holdings} addHolding={addHolding} removeHolding={removeHolding} updateHolding={updateHolding} />
          )}
          {tab === "compare" && <CompareView holdings={holdings} weights={weights} dimScores={dimScores} />}
          {tab === "risk" && <RiskView holdings={holdings} />}
          {tab === "settings" && <SettingsView dimScores={dimScores} persistScores={persistScores} weights={weights} persistWeights={persistWeights} />}
        </div>
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------
   Sidebar / TopBar
------------------------------------------------------------------*/

function Sidebar({ tab, setTab }) {
  const items = [
    { key: "dashboard", label: "儀表板", icon: LayoutDashboard },
    { key: "holdings", label: "持倉管理", icon: Briefcase },
    { key: "compare", label: "商品比較", icon: GitCompare },
    { key: "risk", label: "Knock-In 風險", icon: AlertTriangle },
    { key: "settings", label: "評分設定", icon: SettingsIcon },
  ];
  return (
    <aside className="w-16 md:w-56 shrink-0 flex flex-col" style={{ backgroundColor: "#0D121B", borderRight: "1px solid #262F3D" }}>
      <div className="h-16 flex items-center px-4 gap-2" style={{ borderBottom: "1px solid #262F3D" }}>
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: "#C9A227", color: "#0A0E14", fontFamily: "Fraunces, serif", fontWeight: 700 }}
        >
          SP
        </div>
        <div className="hidden md:block leading-tight">
          <div style={{ color: "#ECEFF3", fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: "0.95rem" }}>SP Intelligence</div>
          <div style={{ color: "#8B94A6", fontSize: "0.65rem" }}>結構型商品追蹤平台</div>
        </div>
      </div>
      <nav className="flex-1 py-3 px-2 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          const active = tab === it.key;
          return (
            <button
              key={it.key}
              onClick={() => setTab(it.key)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
              style={{
                backgroundColor: active ? "#1B222E" : "transparent",
                color: active ? "#C9A227" : "#8B94A6",
              }}
            >
              <Icon size={18} className="shrink-0" />
              <span className="hidden md:inline text-sm font-medium">{it.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="hidden md:block p-3 text-xs" style={{ color: "#4A5568", borderTop: "1px solid #262F3D" }}>
        資料為手動輸入示範，未接入即時報價
      </div>
    </aside>
  );
}

function TopBar({ computed, band, latestReport }) {
  return (
    <div
      className="h-16 flex items-center justify-between px-4 md:px-6"
      style={{ borderBottom: "1px solid #262F3D", backgroundColor: "#0A0E14" }}
    >
      <div>
        <div style={{ color: "#ECEFF3", fontWeight: 600, fontSize: "0.9rem" }}>投資組合總覽</div>
        <div style={{ color: "#8B94A6", fontSize: "0.7rem" }}>
          {latestReport ? `最後 AI 報告：${new Date(latestReport.timestamp).toLocaleString("zh-TW")}` : "尚未產生 AI 報告"}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge color={band.color}>{band.label}</Badge>
        <div className="flex items-baseline gap-1">
          <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: "1.6rem", color: "#ECEFF3" }}>
            {computed.overall}
          </span>
          <span style={{ color: "#8B94A6", fontSize: "0.7rem" }}>/100</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Dashboard
------------------------------------------------------------------*/

function Dashboard({ computed, dimScores, weights, holdings, band, reports, generateReport, aiLoading, aiError }) {
  const radarData = DIMENSIONS.map((d) => ({
    dim: d.label,
    score: d.key === "holdingRisk" ? computed.overallScores.holdingRisk : dimScores[d.key],
    weight: weights.BASE[d.key],
  }));
  const latestReport = reports[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Panel className="lg:col-span-3 p-5">
          <div className="flex items-center justify-between mb-1">
            <StatLabel>SP Intelligence Score · 六大構面</StatLabel>
            <Info size={14} style={{ color: "#4A5568" }} />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="#262F3D" />
                <PolarAngleAxis dataKey="dim" tick={{ fill: "#8B94A6", fontSize: 11 }} />
                <Radar dataKey="score" stroke="#C9A227" fill="#C9A227" fillOpacity={0.28} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {DIMENSIONS.map((d) => (
              <div key={d.key} className="flex items-center justify-between px-2 py-1.5 rounded" style={{ backgroundColor: "#1B222E" }}>
                <span style={{ color: "#8B94A6", fontSize: "0.68rem" }}>{d.label}</span>
                <span style={{ color: "#ECEFF3", fontFamily: "JetBrains Mono, monospace", fontSize: "0.75rem" }}>
                  {d.key === "holdingRisk" ? computed.overallScores.holdingRisk : dimScores[d.key]}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <div className="lg:col-span-2 flex flex-col gap-4">
          <Panel className="p-5 flex flex-col items-center justify-center text-center flex-1">
            <StatLabel>SP Intelligence Score</StatLabel>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: "3.2rem", color: "#ECEFF3", lineHeight: 1 }} className="mt-2">
              {computed.overall}
            </div>
            <Badge color={band.color}>{band.label}</Badge>
          </Panel>
          <div className="grid grid-cols-2 gap-4">
            <Panel className="p-4">
              <StatLabel>FCN 評分</StatLabel>
              <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: "1.7rem", color: "#5B8DEF" }}>
                {computed.fcn ?? "—"}
              </div>
              <div style={{ color: "#4A5568", fontSize: "0.7rem" }}>{computed.fcnCount} 檔持倉</div>
            </Panel>
            <Panel className="p-4">
              <StatLabel>BEN 評分</StatLabel>
              <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: "1.7rem", color: "#C9A227" }}>
                {computed.ben ?? "—"}
              </div>
              <div style={{ color: "#4A5568", fontSize: "0.7rem" }}>{computed.benCount} 檔持倉</div>
            </Panel>
          </div>
        </div>
      </div>

      <Panel className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: "#C9A227" }} />
            <span style={{ color: "#ECEFF3", fontWeight: 600, fontSize: "0.9rem" }}>AI 每日市場摘要與投資建議</span>
          </div>
          <button
            onClick={generateReport}
            disabled={aiLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity"
            style={{ backgroundColor: "#C9A227", color: "#0A0E14", opacity: aiLoading ? 0.6 : 1 }}
          >
            {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {aiLoading ? "分析中…" : "產生今日報告"}
          </button>
        </div>

        {aiError && <div className="text-sm mb-3" style={{ color: "#F87171" }}>{aiError}</div>}

        {latestReport ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge color={latestReport.stance === "偏積極" ? "#4ADE80" : latestReport.stance === "偏保守" ? "#F87171" : "#FBBF24"}>
                {latestReport.stance}
              </Badge>
              <span style={{ color: "#4A5568", fontSize: "0.7rem" }}>
                {new Date(latestReport.timestamp).toLocaleString("zh-TW")}
              </span>
            </div>
            <p style={{ color: "#ECEFF3", fontSize: "0.88rem", lineHeight: 1.6 }}>{latestReport.summary}</p>
            {latestReport.reasoning && (
              <p style={{ color: "#8B94A6", fontSize: "0.82rem", lineHeight: 1.6 }}>建議理由：{latestReport.reasoning}</p>
            )}
            {latestReport.alerts?.length > 0 && (
              <div className="space-y-1 pt-1">
                {latestReport.alerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm" style={{ color: "#FBBF24" }}>
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: "#4A5568", fontSize: "0.85rem" }}>
            尚未產生報告。按下「產生今日報告」，AI 會搜尋最新總經與市場狀況，並依你目前的分數與持倉給出摘要與投資積極度建議。
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------
   Holdings view
------------------------------------------------------------------*/

function emptyForm() {
  return { name: "", type: "FCN", underlyings: "", coupon: "", issueDate: "", maturityDate: "", notional: "", kiDistance: "" };
}

function HoldingsView({ holdings, addHolding, removeHolding, updateHolding }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const submit = () => {
    if (!form.name.trim()) return;
    addHolding({
      ...form,
      coupon: form.coupon === "" ? null : Number(form.coupon),
      notional: form.notional === "" ? null : Number(form.notional),
      kiDistance: form.kiDistance === "" ? null : Number(form.kiDistance),
    });
    setForm(emptyForm());
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div style={{ color: "#ECEFF3", fontWeight: 600 }}>持倉管理</div>
          <div style={{ color: "#8B94A6", fontSize: "0.78rem" }}>共 {holdings.length} 檔商品</div>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ backgroundColor: showForm ? "#1B222E" : "#C9A227", color: showForm ? "#ECEFF3" : "#0A0E14" }}
        >
          {showForm ? <X size={15} /> : <Plus size={15} />}
          {showForm ? "取消" : "新增持倉"}
        </button>
      </div>

      {showForm && (
        <Panel className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="商品名稱">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="例：AAPL/TSM FCN 25-04" />
            </Field>
            <Field label="型態">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
                <option value="FCN">FCN</option>
                <option value="BEN">BEN</option>
              </select>
            </Field>
            <Field label="標的（逗號分隔）">
              <input value={form.underlyings} onChange={(e) => setForm({ ...form, underlyings: e.target.value })} style={inputStyle} placeholder="例：AAPL, TSM" />
            </Field>
            <Field label="票面利率 %">
              <input type="number" value={form.coupon} onChange={(e) => setForm({ ...form, coupon: e.target.value })} style={inputStyle} placeholder="12" />
            </Field>
            <Field label="發行日">
              <input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="到期日">
              <input type="date" value={form.maturityDate} onChange={(e) => setForm({ ...form, maturityDate: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="名目本金">
              <input type="number" value={form.notional} onChange={(e) => setForm({ ...form, notional: e.target.value })} style={inputStyle} placeholder="100000" />
            </Field>
            <Field label="目前距離 KI（%）">
              <input type="number" value={form.kiDistance} onChange={(e) => setForm({ ...form, kiDistance: e.target.value })} style={inputStyle} placeholder="例：18" />
            </Field>
          </div>
          <button onClick={submit} className="mt-4 px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: "#C9A227", color: "#0A0E14" }}>
            儲存持倉
          </button>
        </Panel>
      )}

      {holdings.length === 0 && !showForm && (
        <Panel className="p-10 text-center">
          <div style={{ color: "#8B94A6" }}>還沒有任何持倉紀錄。新增第一筆 FCN 或 BEN 商品，開始追蹤 Knock-In 風險與評分。</div>
        </Panel>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {holdings.map((h) => {
          const zone = riskZone(h.kiDistance);
          return (
            <Panel key={h.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: "#ECEFF3", fontWeight: 600, fontSize: "0.9rem" }}>{h.name}</span>
                    <Badge color={h.type === "FCN" ? "#5B8DEF" : "#C9A227"}>{h.type}</Badge>
                  </div>
                  <div style={{ color: "#8B94A6", fontSize: "0.75rem" }} className="mt-1">{h.underlyings || "—"}</div>
                </div>
                <button onClick={() => removeHolding(h.id)} style={{ color: "#4A5568" }}>
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <MiniStat label="票面利率" value={h.coupon !== null && h.coupon !== undefined ? `${h.coupon}%` : "—"} />
                <MiniStat label="到期日" value={h.maturityDate || "—"} />
                <MiniStat label="距KI" value={h.kiDistance !== null && h.kiDistance !== undefined ? `${h.kiDistance}%` : "—"} color={zone.color} />
              </div>
              <div className="mt-2">
                <Badge color={zone.color}>{zone.label}</Badge>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span style={{ color: "#8B94A6", fontSize: "0.72rem" }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div className="rounded px-2 py-1.5" style={{ backgroundColor: "#1B222E" }}>
      <div style={{ color: "#4A5568", fontSize: "0.62rem" }}>{label}</div>
      <div style={{ color: color || "#ECEFF3", fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem" }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  backgroundColor: "#1B222E",
  border: "1px solid #262F3D",
  borderRadius: "8px",
  padding: "8px 10px",
  color: "#ECEFF3",
  fontSize: "0.85rem",
  outline: "none",
};

/* ---------------------------------------------------------------
   Compare view
------------------------------------------------------------------*/

function CompareView({ holdings, weights, dimScores }) {
  if (holdings.length === 0) {
    return (
      <Panel className="p-10 text-center">
        <div style={{ color: "#8B94A6" }}>目前沒有商品可比較，先到「持倉管理」新增至少一筆商品。</div>
      </Panel>
    );
  }
  const rows = holdings.map((h) => {
    const w = weights[h.type] || weights.BASE;
    const scores = { ...dimScores, holdingRisk: holdingRiskSubscore(h.kiDistance) };
    const score = weightedScore(scores, w);
    return { ...h, score, zone: riskZone(h.kiDistance) };
  });

  return (
    <Panel className="p-5 overflow-x-auto">
      <div style={{ color: "#ECEFF3", fontWeight: 600, marginBottom: "0.75rem" }}>商品比較</div>
      <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "#8B94A6", fontSize: "0.72rem", textAlign: "left" }}>
            <th className="pb-2 pr-3">商品</th>
            <th className="pb-2 pr-3">型態</th>
            <th className="pb-2 pr-3">標的</th>
            <th className="pb-2 pr-3">票面利率</th>
            <th className="pb-2 pr-3">到期日</th>
            <th className="pb-2 pr-3">距KI</th>
            <th className="pb-2 pr-3">SP 子分數</th>
            <th className="pb-2 pr-3">風險燈號</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid #262F3D" }}>
              <td className="py-2 pr-3" style={{ color: "#ECEFF3" }}>{r.name}</td>
              <td className="py-2 pr-3"><Badge color={r.type === "FCN" ? "#5B8DEF" : "#C9A227"}>{r.type}</Badge></td>
              <td className="py-2 pr-3" style={{ color: "#8B94A6" }}>{r.underlyings || "—"}</td>
              <td className="py-2 pr-3" style={{ color: "#ECEFF3", fontFamily: "JetBrains Mono, monospace" }}>
                {r.coupon !== null && r.coupon !== undefined ? `${r.coupon}%` : "—"}
              </td>
              <td className="py-2 pr-3" style={{ color: "#8B94A6" }}>{r.maturityDate || "—"}</td>
              <td className="py-2 pr-3" style={{ color: "#ECEFF3", fontFamily: "JetBrains Mono, monospace" }}>
                {r.kiDistance !== null && r.kiDistance !== undefined ? `${r.kiDistance}%` : "—"}
              </td>
              <td className="py-2 pr-3" style={{ color: "#C9A227", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{r.score}</td>
              <td className="py-2 pr-3"><Badge color={r.zone.color}>{r.zone.label}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/* ---------------------------------------------------------------
   Risk view
------------------------------------------------------------------*/

function RiskView({ holdings }) {
  const chartData = holdings.map((h) => ({
    name: h.name.length > 10 ? h.name.slice(0, 10) + "…" : h.name,
    distance: h.kiDistance ?? 0,
    color: riskZone(h.kiDistance).color,
  }));

  const underlyingCounts = {};
  holdings.forEach((h) => {
    (h.underlyings || "").split(/[,、]/).map((s) => s.trim()).filter(Boolean).forEach((u) => {
      underlyingCounts[u] = (underlyingCounts[u] || 0) + 1;
    });
  });
  const concentrated = Object.entries(underlyingCounts).filter(([, c]) => c >= 2);

  if (holdings.length === 0) {
    return (
      <Panel className="p-10 text-center">
        <div style={{ color: "#8B94A6" }}>目前沒有持倉資料，新增持倉後即可看到 Knock-In 距離與集中度分析。</div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <div style={{ color: "#ECEFF3", fontWeight: 600, marginBottom: "0.75rem" }}>各持倉距離 Knock-In 百分比</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="#1B222E" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#8B94A6", fontSize: 10 }} />
              <YAxis tick={{ fill: "#8B94A6", fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1B222E", border: "1px solid #262F3D", color: "#ECEFF3" }} />
              <Bar dataKey="distance" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-3 text-xs" style={{ color: "#8B94A6" }}>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "#4ADE80" }} />≥25% 安全</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "#FBBF24" }} />15-25% 留意</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "#F97316" }} />8-15% 警戒</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "#F87171" }} />&lt;8% 危險</span>
        </div>
      </Panel>

      <Panel className="p-5">
        <div style={{ color: "#ECEFF3", fontWeight: 600, marginBottom: "0.5rem" }}>Worst-of 標的集中度</div>
        {concentrated.length === 0 ? (
          <div style={{ color: "#4ADE80", fontSize: "0.85rem" }}>目前沒有標的重複出現在多筆持倉中，集中度風險低。</div>
        ) : (
          <div className="space-y-2">
            {concentrated.map(([name, count]) => (
              <div key={name} className="flex items-center gap-2 text-sm" style={{ color: "#FBBF24" }}>
                <AlertTriangle size={14} />
                <span>{name} 同時出現在 {count} 檔持倉中，建議留意集中曝險</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------
   Settings view
------------------------------------------------------------------*/

function SettingsView({ dimScores, persistScores, weights, persistWeights }) {
  const [localScores, setLocalScores] = useState(dimScores);
  const [editType, setEditType] = useState(null);
  const [localWeights, setLocalWeights] = useState(weights);

  const scoreKeys = DIMENSIONS.filter((d) => d.key !== "holdingRisk");

  const applyScores = () => persistScores(localScores);

  const weightTotal = (type) => Object.values(localWeights[type]).reduce((a, b) => a + Number(b), 0);

  const applyWeights = (type) => {
    if (weightTotal(type) !== 100) return;
    persistWeights({ ...localWeights, [type]: localWeights[type] });
  };
  const resetWeights = (type) => {
    const next = { ...localWeights, [type]: DEFAULT_WEIGHTS[type] };
    setLocalWeights(next);
    persistWeights(next);
  };

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <div style={{ color: "#ECEFF3", fontWeight: 600, marginBottom: "0.25rem" }}>五大手動評分構面</div>
        <div style={{ color: "#8B94A6", fontSize: "0.78rem", marginBottom: "1rem" }}>
          尚未接入即時報價來源前，先用滑桿手動設定 0–100 分（持倉風險由持倉資料自動計算）。
        </div>
        <div className="space-y-4">
          {scoreKeys.map((d) => (
            <div key={d.key}>
              <div className="flex items-center justify-between mb-1">
                <span style={{ color: "#ECEFF3", fontSize: "0.85rem" }}>{d.label} <span style={{ color: "#4A5568", fontSize: "0.7rem" }}>· {d.sub}</span></span>
                <span style={{ color: "#C9A227", fontFamily: "JetBrains Mono, monospace" }}>{localScores[d.key]}</span>
              </div>
              <input
                type="range" min={0} max={100} value={localScores[d.key]}
                onChange={(e) => setLocalScores({ ...localScores, [d.key]: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          ))}
        </div>
        <button onClick={applyScores} className="mt-4 px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: "#C9A227", color: "#0A0E14" }}>
          套用分數
        </button>
      </Panel>

      {["BASE", "FCN", "BEN"].map((type) => (
        <Panel key={type} className="p-5">
          <button className="w-full flex items-center justify-between" onClick={() => setEditType(editType === type ? null : type)}>
            <span style={{ color: "#ECEFF3", fontWeight: 600 }}>
              {type === "BASE" ? "整體組合權重" : `${type} 專屬權重`}
            </span>
            {editType === type ? <ChevronUp size={16} style={{ color: "#8B94A6" }} /> : <ChevronDown size={16} style={{ color: "#8B94A6" }} />}
          </button>
          {editType === type && (
            <div className="mt-4 space-y-3">
              {DIMENSIONS.map((d) => (
                <div key={d.key} className="flex items-center justify-between gap-3">
                  <span style={{ color: "#8B94A6", fontSize: "0.8rem" }}>{d.label}</span>
                  <input
                    type="number" min={0} max={100}
                    value={localWeights[type][d.key]}
                    onChange={(e) => setLocalWeights({ ...localWeights, [type]: { ...localWeights[type], [d.key]: Number(e.target.value) } })}
                    style={{ ...inputStyle, width: "80px" }}
                  />
                </div>
              ))}
              <div className="flex items-center justify-between pt-2">
                <span style={{ color: weightTotal(type) === 100 ? "#4ADE80" : "#F87171", fontSize: "0.8rem" }}>
                  總和：{weightTotal(type)}% {weightTotal(type) !== 100 && "（需等於 100%）"}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => resetWeights(type)} className="px-3 py-1.5 rounded-lg text-xs" style={{ backgroundColor: "#1B222E", color: "#8B94A6" }}>
                    重置預設
                  </button>
                  <button
                    onClick={() => applyWeights(type)}
                    disabled={weightTotal(type) !== 100}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: "#C9A227", color: "#0A0E14", opacity: weightTotal(type) !== 100 ? 0.5 : 1 }}
                  >
                    套用權重
                  </button>
                </div>
              </div>
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}
