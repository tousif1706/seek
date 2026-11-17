import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import express from "express";
import type { Request, Response } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MODELS = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"] as const;

const rank = (c: number) => (c <= 5 ? "A" : c <= 10 ? "B" : c <= 20 ? "C" : "D");
const rating = (a: number) => (a <= 5 ? "A · Low Risk" : a <= 10 ? "B · Moderate" : a <= 20 ? "C · Complex" : "D · High Risk");

function countBranches(block: string, lang: string) {
  const clean = block.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*$|#.*$|\/\*[\s\S]*?\*\//gm, " ");
  const pats = lang === "Python"
    ? [/\bif\b/g, /\belif\b/g, /\bfor\b/g, /\bwhile\b/g, /\bexcept\b/g, /\band\b/g, /\bor\b/g]
    : [/\bif\b/g, /\belse\s+if\b/g, /\bfor\b/g, /\bwhile\b/g, /\bcase\b/g, /\bcatch\b/g, /&&/g, /\|\|/g, /\?[^:]+:/g];
  return 1 + pats.reduce((s, rx) => s + (clean.match(rx)?.length ?? 0), 0);
}

function analyzeComplexity(code: string, lang: string) {
  const lines = code.split(/\r?\n/);
  const loc = lines.filter((l) => l.trim()).length;
  const details: { name: string; line: number; complexity: number; nesting: number; rank: string }[] = [];

  if (lang === "Python") {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)(?:async\s+)?def\s+([a-zA-Z_]\w*)\s*\(/);
      if (!m) continue;
      const base = m[1].length, block = [lines[i]];
      let nest = 0;
      for (const nxt of lines.slice(i + 1)) {
        const t = nxt.trim(), ind = nxt.length - nxt.replace(/^ +/, "").length;
        if (t && ind <= base && !t.startsWith("#")) break;
        if (t) nest = Math.max(nest, Math.max(0, Math.floor((ind - base) / 4) - 1));
        block.push(nxt);
      }
      const cc = countBranches(block.join("\n"), lang);
      details.push({ name: `${m[2]}()`, line: i + 1, complexity: cc, nesting: nest, rank: rank(cc) });
    }
  } else {
    const rx = lang === "Java"
      ? /^\s*(?:public|private|protected|static|final|synchronized|\s)*[\w<>[\]]+\s+([a-zA-Z_]\w*)\s*\([^;]*\)\s*\{/
      : /^\s*(?:static|inline|virtual|const|unsigned|signed|[\w:<>]+)\s+(?:[\w:*&<>]+\s+)*([a-zA-Z_][\w:]*)\s*\([^;]*\)\s*(?:const)?\s*\{/;
    for (let i = 0; i < lines.length; i++) {
      const m = !/^\s*(if|else|for|while|switch|catch)\b/.test(lines[i]) ? lines[i].match(rx) : null;
      if (!m) continue;
      let depth = 0, nest = 0, started = false;
      const block: string[] = [];
      for (const cur of lines.slice(i)) {
        block.push(cur);
        for (const ch of cur) {
          if (ch === "{") { depth++; started = true; nest = Math.max(nest, depth - 1); }
          else if (ch === "}") depth--;
        }
        if (started && depth <= 0) break;
      }
      const cc = countBranches(block.join("\n"), lang);
      details.push({ name: `${m[1]}()`, line: i + 1, complexity: cc, nesting: nest, rank: rank(cc) });
    }
  }

  if (!details.length) {
    const cc = countBranches(code, lang);
    details.push({ name: "Module / Top-Level", line: 1, complexity: cc, nesting: 0, rank: rank(cc) });
  }
  const avg = Math.round((details.reduce((s, d) => s + d.complexity, 0) / details.length) * 100) / 100;
  return {
    method: `${lang} Control-Flow Scan`,
    average_complexity: avg,
    max_complexity: Math.max(...details.map((d) => d.complexity)),
    rating: rating(avg),
    maintainability_index: Math.max(0, Math.min(100, Math.round(100 - Math.log2(Math.max(loc, 1)) * 7.5 - avg * 2.4))),
    loc,
    details,
  };
}

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "Concise 1-2 sentence assessment." },
    bugs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { line: { type: Type.STRING }, severity: { type: Type.STRING }, title: { type: Type.STRING }, description: { type: Type.STRING }, fix: { type: Type.STRING } },
        required: ["line", "severity", "title", "description", "fix"],
      },
    },
    improvements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { title: { type: Type.STRING }, category: { type: Type.STRING }, description: { type: Type.STRING }, suggestion: { type: Type.STRING } },
        required: ["title", "category", "description", "suggestion"],
      },
    },
    complexity_notes: { type: Type.STRING },
    overall_score: { type: Type.NUMBER },
    improved_code_lines: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Refactored code lines preserving indentation." },
  },
  required: ["summary", "bugs", "improvements", "complexity_notes", "overall_score", "improved_code_lines"],
};

const statusOf = (err: unknown): number | undefined => {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.status === "number") return e.status;
    if (typeof e.code === "number") return e.code;
  }
  const m = String(err instanceof Error ? err.message : err).match(/\b(400|403|404|429|503)\b/);
  return m ? Number(m[1]) : undefined;
};

async function reviewWithGemini(code: string, lang: string) {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key || key === "MY_GEMINI_API_KEY") {
    throw new Error('GEMINI_API_KEY is missing. Add GEMINI_API_KEY="your_key" inside .env (or Settings > Secrets) and restart.');
  }
  const ai = new GoogleGenAI({ apiKey: key, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
  const numbered = code.split(/\r?\n/).map((l, i) => `${i + 1}: ${l}`).join("\n");
  const systemInstruction = `Senior engineer reviewing ${lang} code. Return exact bug line numbers, improvements, Big-O complexity_notes, overall_score (1-10), and improved_code_lines.`;
  let lastErr = "The AI model is temporarily busy. Please try again.";

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: `Review this ${lang} code:\n\n${numbered}`,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: SCHEMA,
            ...(model === "gemini-4-hydrogen" ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          },
        });
        const p = JSON.parse((res.text ?? "{}").trim());
        const sevs = new Set(["critical", "high", "medium", "low", "info"]);
        const score = Math.max(0, Math.min(10, Number(p.overall_score ?? 7) || 7));
        return {
          summary: String(p.summary ?? "Review completed."),
          bugs: (Array.isArray(p.bugs) ? p.bugs : []).map((b: Record<string, unknown>) => ({
            line: String(b.line ?? "N/A"),
            severity: sevs.has(String(b.severity ?? "info").toLowerCase()) ? String(b.severity).toLowerCase() : "info",
            title: String(b.title ?? "Code issue"),
            description: String(b.description ?? ""),
            fix: String(b.fix ?? ""),
          })),
          improvements: (Array.isArray(p.improvements) ? p.improvements : []).map((m: Record<string, unknown>) => ({
            title: String(m.title ?? "Improvement"),
            category: String(m.category ?? "Quality"),
            description: String(m.description ?? ""),
            suggestion: String(m.suggestion ?? ""),
          })),
          complexity_notes: String(p.complexity_notes ?? ""),
          overall_score: Number.isInteger(score) ? score : Math.round(score * 10) / 10,
          improved_code: Array.isArray(p.improved_code_lines) && p.improved_code_lines.length ? p.improved_code_lines.map(String).join("\n") : code,
        };
      } catch (err) {
        const codeNum = statusOf(err);
        const msg = err instanceof Error ? err.message : String(err);
        if (codeNum === 403 || (codeNum === 400 && /API_KEY_INVALID|API key not valid/.test(msg))) {
          throw new Error("The configured GEMINI_API_KEY was rejected. Verify it in .env or Settings > Secrets.");
        }
        lastErr = codeNum ? `${model} returned ${codeNum}` : msg || lastErr;
        if (attempt === 0 && codeNum !== 404) { await new Promise((r) => setTimeout(r, 600)); continue; }
        break;
      }
    }
  }
  throw new Error(`Could not reach Gemini right now (${lastErr}). Please wait a moment and click Try Again.`);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.post("/api/review", async (req: Request, res: Response) => {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const lang = typeof req.body?.language === "string" ? req.body.language : "Python";
    if (!code.trim()) return res.status(400).json({ error: "Please paste some code first." });
    try {
      res.json({ review: await reviewWithGemini(code, lang), complexity: analyzeComplexity(code, lang) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Something went wrong during review." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    app.use((await createServer({ server: { middlewareMode: true }, appType: "spa" })).middlewares);
  } else {
    const dist = path.join(__dirname, "dist");
    app.use(express.static(dist));
    app.get("*", (_req: Request, res: Response) => {
      const idx = path.join(dist, "index.html");
      if (fs.existsSync(idx)) res.sendFile(idx);
      else res.status(404).send("Build not found. Run npm run build first.");
    });
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`AI Code Reviewer running on http://localhost:${PORT}`));
}

startServer();
