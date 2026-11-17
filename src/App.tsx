import { useEffect, useMemo, useRef, useState } from "react";
import { LANGUAGE_CONFIG, PRESETS, SEVERITY_META, scoreMeta } from "./constants";
import type { ActiveTab, ComplexityResult, ReviewResult, SupportedLanguage } from "./types";

const LANGUAGES = Object.keys(LANGUAGE_CONFIG) as SupportedLanguage[];
const MODULES = [
  ["01. Bugs & Edge Cases", "Pinpoints line-level logic defects and boundary risks."],
  ["02. Refactoring Improvements", "Actionable suggestions for readability and safety."],
  ["03. Cyclomatic Complexity", "Function branch count, nesting depth, and maintainability."],
  ["04. Overall Health Score", "Clear 0–10 code health rating paired with justification."],
  ["05. Before / After Diff", "Side-by-side Original vs AI-Improved comparison with one-click apply."],
];
const WORKFLOW = [
  ["01. Line-Level Defect Scan", "Identifies null dereferences, off-by-one loops, unhandled edge cases, and unsafe mutations with exact line references."],
  ["02. Control-Flow Complexity", "Measures cyclomatic branch density, nesting depth, and a 0–100 Maintainability Index for each function or method block."],
  ["03. Side-by-Side Refactored Diff", "Generates an idiomatic rewrite in your chosen language so you can compare changes side by side and apply them back into the editor."],
];
const SCALE_ROWS = [
  ["A", "rank-a", "1 – 5", "Low Risk · Simple", "Easy to test and reason about; keep as-is."],
  ["B", "rank-b", "6 – 10", "Moderate · Well-Structured", "Acceptable branching; ensure branch unit tests exist."],
  ["C", "rank-c", "11 – 20", "Complex · Elevated Risk", "Extract helper functions and flatten nested conditionals."],
  ["D", "rank-d", "21+", "High Risk · Fragile", "Refactor into smaller single-responsibility units immediately."],
];

export default function App() {
  const [language, setLanguage] = useState<SupportedLanguage>("Python");
  const [code, setCode] = useState(LANGUAGE_CONFIG.Python.starter);
  const [presetId, setPresetId] = useState("");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [complexity, setComplexity] = useState<ComplexityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("bugs");
  const [openBugIdx, setOpenBugIdx] = useState<number | null>(0);
  const [focusedLine, setFocusedLine] = useState<number | null>(null);

  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lines = useMemo(() => code.split(/\r?\n/), [code]);
  const flaggedLines = useMemo(() => {
    const s = new Set<number>();
    if (focusedLine !== null) s.add(focusedLine);
    for (const b of review?.bugs ?? []) {
      for (const n of String(b.line ?? "").match(/\d+/g) ?? []) s.add(Number(n));
    }
    return s;
  }, [review, focusedLine]);

  const switchLanguage = (next: SupportedLanguage) => {
    const isStarter = Object.values(LANGUAGE_CONFIG).some((c) => c.starter.trim() === code.trim());
    setLanguage(next);
    if (isStarter || !code.trim()) setCode(LANGUAGE_CONFIG[next].starter);
    setFocusedLine(null);
  };

  const loadPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setLanguage(p.language);
    setCode(p.code);
    setReview(null);
    setComplexity(null);
    setError(null);
    setFocusedLine(null);
  };

  const runReview = async () => {
    if (!code.trim()) {
      setReview(null);
      setError("Please paste some code first before running a review.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review could not complete.");
      setReview(data.review);
      setComplexity(data.complexity);
      setActiveTab("bugs");
      setOpenBugIdx(0);
      setFocusedLine(null);
    } catch (err) {
      setReview(null);
      setError(err instanceof Error ? err.message : "Something went wrong during review.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runReview(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const score = review?.overall_score ?? 0;
  const sMeta = scoreMeta(score);

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#workspace" className="brand-wordmark">AI Code Reviewer</a>
          <nav aria-label="Primary navigation" className="topbar-nav">
            <a href="#workspace" className="nav-link">Workspace</a>
            <a href="#how-it-works" className="nav-link">How It Works</a>
            <a href="#complexity-scale" className="nav-link">Complexity Scale</a>
            <button type="button" onClick={() => loadPreset("py-invoice")} className="nav-link nav-link-btn">Sample Bugs</button>
          </nav>
          <div className="topbar-actions">
            <button type="button" onClick={runReview} disabled={loading} className="btn btn-primary btn-sm">
              {loading ? "Reviewing..." : "Review Code"}
            </button>
          </div>
        </div>
      </header>

      <main id="workspace" className="main-container">
        <div className="workbench-grid">
          <aside aria-label="Review settings" className="sidebar-card">
            <div>
              <h2 className="sidebar-heading">Settings</h2>
              <p className="sidebar-subtext">Select the language for syntax inspection and control-flow complexity scoring.</p>
              <div className="language-list">
                {LANGUAGES.map((l) => (
                  <button key={l} type="button" onClick={() => switchLanguage(l)} className={`lang-btn${language === l ? " is-selected" : ""}`}>
                    <span>{l}</span>
                    <span className="lang-ext">{LANGUAGE_CONFIG[l].ext}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="sidebar-divider">
              <h3 className="sidebar-subheading">How It Works</h3>
              <ol className="steps-list">
                <li><strong>01.</strong> Paste or write your code in the editor</li>
                <li><strong>02.</strong> Click <strong>Review Code</strong> to scan</li>
                <li><strong>03.</strong> Inspect bugs, suggestions, complexity &amp; diff</li>
              </ol>
            </div>
            <div className="sidebar-divider">
              <h3 className="sidebar-subheading">Included Checks</h3>
              <ul className="checks-list">
                <li>Bugs &amp; edge-case detection</li>
                <li>Refactoring &amp; style guidance</li>
                <li>Cyclomatic complexity &amp; MI</li>
                <li>0–10 code health score</li>
                <li>Side-by-side Before / After diff</li>
              </ul>
            </div>
          </aside>

          <div className="workspace-column">
            <section className="hero-card">
              <div className="hero-content">
                <div className="hero-copy">
                  <h1 className="hero-title">Instant AI Code Review</h1>
                  <p className="hero-description">Paste your code to detect bugs, uncover refactoring improvements, calculate cyclomatic complexity, and compare a cleaner AI-improved diff.</p>
                </div>
                <div className="hero-metrics tabular-nums">
                  <div><span className="hero-metric-label">Language</span><span className="hero-metric-value">{language}</span></div>
                  <div className="hero-metric-sep" aria-hidden="true" />
                  <div><span className="hero-metric-label">Inspection</span><span className="hero-metric-value">5 Modules</span></div>
                  <div className="hero-metric-sep" aria-hidden="true" />
                  <div><span className="hero-metric-label">Health Scale</span><span className="hero-metric-value">0–10 Rating</span></div>
                </div>
              </div>
            </section>

            <div className="split-panels">
              <section aria-label="Code Editor" className="panel-card">
                <div className="panel-header">
                  <div className="panel-title-group">
                    <h2 className="panel-title">Your Code</h2>
                    <span className="meta-dot" aria-hidden="true">·</span>
                    <div className="editor-meta tabular-nums">{language} · {lines.length} {lines.length === 1 ? "line" : "lines"} · {code.length} chars</div>
                  </div>
                  <select aria-label="Load example preset" value={presetId} onChange={(e) => e.target.value && loadPreset(e.target.value)} className="preset-select">
                    <option value="">Load example...</option>
                    {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>

                <div className="editor-body">
                  <div ref={gutterRef} className="line-gutter tabular-nums" aria-hidden="true">
                    {lines.map((_, i) => <div key={i} className={`gutter-line${flaggedLines.has(i + 1) ? " is-highlighted" : ""}`}>{i + 1}</div>)}
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onScroll={() => gutterRef.current && textareaRef.current && (gutterRef.current.scrollTop = textareaRef.current.scrollTop)}
                    spellCheck={false}
                    aria-label="Source code input"
                    placeholder="Paste your code here..."
                    className="code-textarea"
                  />
                </div>

                <div className="panel-footer">
                  <p className="shortcut-hint">Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to review</p>
                  <div className="footer-actions">
                    {(review || error) && (
                      <button type="button" onClick={() => { setReview(null); setComplexity(null); setError(null); setFocusedLine(null); }} className="btn btn-outline btn-md">Clear Results</button>
                    )}
                    <button type="button" onClick={runReview} disabled={loading} className="btn btn-primary btn-md">{loading ? "Reviewing..." : "Review Code"}</button>
                  </div>
                </div>
              </section>

              <section aria-label="Review Results" className="panel-card">
                {loading ? (
                  <div className="results-loading" aria-busy="true">
                    <div className="skeleton" style={{ height: 22, width: "42%" }} />
                    <div className="skeleton" style={{ height: 54, width: "100%" }} />
                    <div className="skeleton" style={{ height: 38, width: "100%" }} />
                    <div className="skeleton" style={{ height: 140, width: "100%" }} />
                  </div>
                ) : error ? (
                  <div className="results-error">
                    <h2 className="error-title">Review could not complete</h2>
                    <p className="error-message">{error}</p>
                    <div><button type="button" onClick={runReview} className="btn btn-primary btn-md">Try Again</button></div>
                  </div>
                ) : !review ? (
                  <div className="results-empty">
                    <div>
                      <h2>Review Results</h2>
                      <p>Paste your code in the editor and click <strong>Review Code</strong> to run a full inspection across five modules.</p>
                      <div className="module-list">
                        {MODULES.map(([n, d]) => <div key={n} className="module-row"><span className="module-name">{n}</span><span className="module-desc">{d}</span></div>)}
                      </div>
                    </div>
                    <div className="results-empty-footer">
                      <span className="results-empty-lang">Active language: {language}</span>
                      <button type="button" onClick={runReview} className="btn btn-outline btn-md">Review Current Code</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="results-summary-header">
                      <div className="results-top-row">
                        <h2 className="panel-title">Review Results</h2>
                        <div className={`results-score-inline tabular-nums ${sMeta.cls}`}>
                          Score {score}/10 · {sMeta.label}
                          {complexity ? <span style={{ color: "#64748b" }}> · MI {complexity.maintainability_index}/100</span> : null}
                        </div>
                      </div>
                      {review.summary && <p className="summary-callout">{review.summary}</p>}
                    </div>

                    <div role="tablist" aria-label="Review sections" className="tabs-bar">
                      {([
                        ["bugs", `Bugs (${review.bugs.length})`],
                        ["improvements", `Improvements (${review.improvements.length})`],
                        ["complexity", "Complexity"],
                        ["score", `Score (${score}/10)`],
                        ["diff", "Before / After"],
                      ] as [ActiveTab, string][]).map(([k, lbl]) => (
                        <button key={k} type="button" role="tab" aria-selected={activeTab === k} onClick={() => setActiveTab(k)} className={`tab-btn${activeTab === k ? " is-active" : ""}`}>
                          {lbl}
                        </button>
                      ))}
                    </div>

                    <div className="tab-content">
                      {activeTab === "bugs" && (review.bugs.length === 0 ? (
                        <div className="bugs-clean-box">
                          <div className="bugs-clean-title">No bugs found. Nice and clean.</div>
                          <div className="bugs-clean-desc">No runtime defects, bounds issues, or logic errors were detected in this snippet.</div>
                        </div>
                      ) : (
                        <div className="accordion-list">
                          {review.bugs.map((bug, i) => {
                            const open = openBugIdx === i;
                            const sev = SEVERITY_META[bug.severity] ?? SEVERITY_META.info;
                            return (
                              <div key={i} className="accordion-item">
                                <button type="button" className="accordion-trigger" onClick={() => { setOpenBugIdx(open ? null : i); const m = bug.line.match(/\d+/); if (m) setFocusedLine(Number(m[0])); }}>
                                  <div>
                                    <div className="accordion-title">{bug.title}</div>
                                    <div className="accordion-meta tabular-nums">Line {bug.line} · <span className={sev.cls}>{sev.label}</span></div>
                                  </div>
                                  <span className={`accordion-chevron${open ? " is-open" : ""}`}>▾</span>
                                </button>
                                {open && (
                                  <div className="accordion-body">
                                    <p className="accordion-desc">{bug.description}</p>
                                    {bug.fix && <div className="fix-box"><span className="fix-label">Suggested Fix</span><div className="fix-text">{bug.fix}</div></div>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}

                      {activeTab === "improvements" && (review.improvements.length === 0 ? (
                        <p className="error-message">No specific improvements suggested for this snippet.</p>
                      ) : review.improvements.map((m, i) => (
                        <div key={i} className="improvement-item">
                          <div className="improvement-head"><h3 className="improvement-title">{m.title}</h3><span className="improvement-cat">{m.category}</span></div>
                          <p className="improvement-desc">{m.description}</p>
                          {m.suggestion && <pre className="improvement-code">{m.suggestion}</pre>}
                        </div>
                      )))}

                      {activeTab === "complexity" && complexity && (
                        <div>
                          <div className="metrics-grid tabular-nums">
                            {[["Method", complexity.method], ["Avg. Complexity", complexity.average_complexity], ["Rating", complexity.rating], ["Maintainability", `${complexity.maintainability_index}/100`]].map(([k, v]) => (
                              <div key={String(k)} className="metric-tile"><span className="metric-tile-label">{k}</span><span className="metric-tile-value">{v}</span></div>
                            ))}
                          </div>
                          {complexity.details.length > 0 && (
                            <div>
                              <div className="subblock-title">Function Breakdown</div>
                              <div className="table-wrapper">
                                <table className="data-table compact">
                                  <thead><tr><th>Block / Function</th><th className="text-right">Line</th><th className="text-right">Cyclomatic</th><th className="text-right">Nesting</th><th className="text-right">Rank</th></tr></thead>
                                  <tbody>
                                    {complexity.details.map((r, i) => (
                                      <tr key={i}><td className="mono">{r.name}</td><td className="mono tabular-nums text-right">{r.line}</td><td className="mono tabular-nums text-right">{r.complexity}</td><td className="mono tabular-nums text-right">{r.nesting}</td><td className="mono tabular-nums text-right">{r.rank}</td></tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          {review.complexity_notes && <div className="complexity-notes"><div className="subblock-title">AI Complexity Notes</div><p>{review.complexity_notes}</p></div>}
                        </div>
                      )}

                      {activeTab === "score" && (
                        <div>
                          <span className="metric-tile-label">Overall Code Health</span>
                          <h3 className="score-heading tabular-nums">{score}/10 <span className="score-heading-sub">— {sMeta.label}</span></h3>
                          <div className="progress-track"><div className={`progress-fill ${sMeta.bar}`} style={{ width: `${Math.min(100, Math.max(0, score * 10))}%` }} /></div>
                          <div className="score-status-box"><div className={`score-status-label ${sMeta.cls}`}>{sMeta.label}</div><p className="score-status-desc">{sMeta.msg}</p></div>
                          <div className="score-stats-row tabular-nums">
                            {[["Bugs Detected", review.bugs.length], ["Suggestions", review.improvements.length], ["Lines Reviewed", complexity?.loc ?? lines.length]].map(([k, v]) => (
                              <div key={String(k)}><span className="metric-tile-label">{k}</span><span className="metric-tile-value">{v}</span></div>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeTab === "diff" && (!review.improved_code ? (
                        <p className="error-message">No improved version was returned for this code.</p>
                      ) : (
                        <>
                          <div className="diff-toolbar">
                            <span className="results-empty-lang">Before / After comparison ({language})</span>
                            <button type="button" onClick={() => setCode(review.improved_code)} className="btn btn-primary btn-xs">Apply to Editor</button>
                          </div>
                          <div className="diff-grid">
                            {([["Original", lines, false], ["AI-Improved", review.improved_code.split(/\r?\n/), true]] as [string, string[], boolean][]).map(([hdr, arr, imp]) => (
                              <div key={hdr} className={`diff-pane${imp ? " is-improved" : ""}`}>
                                <div className="diff-pane-header">{hdr}</div>
                                <div className="diff-pre mono">
                                  {arr.map((ln, i) => <div key={i} className="diff-code-line"><span className="diff-line-num tabular-nums">{i + 1}</span><span className="diff-line-text">{ln || " "}</span></div>)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>
        </div>

        <section id="how-it-works" className="content-section">
          <div className="section-header">
            <h2 className="section-title">Structured Review Workflow</h2>
            <p className="section-subtitle">Every submission combines static control-flow measurement with contextual AI reasoning across correctness, clarity, and maintainability.</p>
          </div>
          <div className="workflow-grid">
            {WORKFLOW.map(([t, d]) => <article key={t} className="workflow-card"><h3>{t}</h3><p>{d}</p></article>)}
          </div>
        </section>

        <section id="complexity-scale" className="content-section">
          <div className="section-header">
            <h2 className="section-title">Cyclomatic Complexity Reference</h2>
            <p className="section-subtitle">Standard branching thresholds used to score functions in the Complexity tab.</p>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Rank</th><th>Cyclomatic Score</th><th>Risk Classification</th><th>Recommended Action</th></tr></thead>
              <tbody>
                {SCALE_ROWS.map(([rk, cls, sc, risk, act]) => (
                  <tr key={rk}><td className={`mono ${cls}`}>{rk}</td><td className="mono tabular-nums">{sc}</td><td>{risk}</td><td className="muted">{act}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <span>AI Code Reviewer · Static Complexity &amp; Gemini Review</span>
          <a href="#workspace" className="footer-link">Back to Editor</a>
        </div>
      </footer>
    </div>
  );
}
