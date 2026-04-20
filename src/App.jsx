import { useState, useCallback, useMemo, useEffect, useRef } from "react";

// ─── Sympy-lite: tiny symbolic math via math.js-style eval ───

function parseExpr(str) {
  if (!str) return null;
  let s = str.replace(/\^/g, "**");
  s = s.replace(/(\d)([A-Za-z])/g, "$1*$2");
  s = s.replace(/(\d)\(/g, "$1*(");
  s = s.replace(/\)\(/g, ")*(");
  return s;
}

function evalExpr(exprStr, varName, value) {
  if (!exprStr) return NaN;
  const parsed = parseExpr(exprStr);
  const fn = new Function(varName, `return ${parsed};`);
  return fn(value);
}

function findVariable(exprStr) {
  const parsed = parseExpr(exprStr);
  const vars = parsed.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const reserved = new Set(["Math", "PI", "E", "abs", "sqrt", "pow", "log", "exp", "sin", "cos", "tan", "max", "min", "round", "floor", "ceil", "return"]);
  const unique = [...new Set(vars.filter(v => !reserved.has(v)))];
  return unique[0] || "Q";
}

function solveEquation(expr1Str, expr2Str, varName, lo = -1000, hi = 10000) {
  const f = (x) => evalExpr(expr1Str, varName, x) - evalExpr(expr2Str, varName, x);
  let a = lo, b = hi;
  let fa = f(a), fb = f(b);
  if (fa * fb > 0) {
    for (let x = lo; x <= hi; x += 0.5) {
      if (f(x) * f(x + 0.5) <= 0) {
        a = x; b = x + 0.5;
        fa = f(a); fb = f(b);
        break;
      }
    }
  }
  for (let i = 0; i < 100; i++) {
    const mid = (a + b) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-10) return mid;
    if (fa * fm < 0) { b = mid; fb = fm; }
    else { a = mid; fa = fm; }
  }
  return (a + b) / 2;
}

function integrate(exprStr, varName, lo, hi, n = 1000) {
  const h = (hi - lo) / n;
  let sum = evalExpr(exprStr, varName, lo) + evalExpr(exprStr, varName, hi);
  for (let i = 1; i < n; i++) {
    const x = lo + i * h;
    sum += (i % 2 === 0 ? 2 : 4) * evalExpr(exprStr, varName, x);
  }
  return (h / 3) * sum;
}

function solveTwoEq(mac1Str, mac2Str, var1, var2, total) {
  const f = (a1) => evalExpr(mac1Str, var1, a1) - evalExpr(mac2Str, var2, total - a1);
  let lo = 0, hi = total;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  const a1 = (lo + hi) / 2;
  return { [var1]: a1, [var2]: total - a1 };
}

const R = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

// ─── Canvas Graph Component ───
function GraphCanvas({ drawFn, width = 700, height = 450 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !drawFn) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    drawFn(ctx, width, height);
  }, [drawFn, width, height]);
  return <canvas ref={canvasRef} style={{ maxWidth: "100%", borderRadius: 8 }} />;
}

// ─── Drawing: Externality ───
function drawExternality(ctx, W, H, vars) {
  const { MSB, MPC, MSC, MEC } = vars;
  const varName = findVariable(MSB);

  const Q_c = solveEquation(MSB, MPC, varName, 0, 500);
  const P_c = evalExpr(MSB, varName, Q_c);
  const Q_e = solveEquation(MSB, MSC, varName, 0, 500);
  const P_e = evalExpr(MSB, varName, Q_e);

  const Q_max = Q_c * 1.35;
  const P_msb_0 = evalExpr(MSB, varName, 0);
  const P_max = P_msb_0 * 1.2;

  const mx = 100, my = 40, gw = W - mx - 30, gh = H - my - 60;
  const toX = (q) => mx + (q / Q_max) * gw;
  const toY = (p) => my + gh - (p / P_max) * gh;

  ctx.fillStyle = "#faf9f6";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my + gh); ctx.lineTo(mx + gw, my + gh); ctx.stroke();

  ctx.font = "bold 13px 'DM Mono', monospace";
  ctx.fillStyle = "#222";
  ctx.fillText("Q", mx + gw / 2, H - 8);
  ctx.fillText("P", 12, my + gh / 2);

  const drawCurve = (exprStr, color, label) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const q = (i / 200) * Q_max;
      const p = evalExpr(exprStr, varName, q);
      if (i === 0) ctx.moveTo(toX(q), toY(p)); else ctx.lineTo(toX(q), toY(p));
    }
    ctx.stroke();
    const qEnd = Q_max * 0.92;
    const pEnd = evalExpr(exprStr, varName, qEnd);
    ctx.font = "11px 'DM Mono', monospace";
    ctx.fillStyle = color;
    ctx.fillText(label, toX(qEnd) - ctx.measureText(label).width - 4, toY(pEnd) - 6);
  };

  drawCurve(MPC, "#4a7fb5", "S = MPC");
  drawCurve(MSB, "#7b5ea7", "D = MSB");
  drawCurve(MSC, "#c0392b", "MSC");

  const Wx = toX(Q_e), Wy = toY(P_e);
  const Xx = toX(Q_c), Xy = toY(evalExpr(MSC, varName, Q_c));
  const Yx = toX(Q_c), Yy = toY(P_c);
  const Zx = toX(Q_e), Zy = toY(evalExpr(MPC, varName, Q_e));

  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#c0392b";
  ctx.beginPath(); ctx.moveTo(Wx, Wy); ctx.lineTo(Xx, Xy); ctx.lineTo(Yx, Yy); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#4a7fb5";
  ctx.beginPath(); ctx.moveTo(Wx, Wy); ctx.lineTo(Zx, Zy); ctx.lineTo(Yx, Yy); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.setLineDash([5, 4]); ctx.strokeStyle = "#999"; ctx.lineWidth = 1;
  [[Q_e, P_e], [Q_c, P_c]].forEach(([q, p]) => {
    ctx.beginPath(); ctx.moveTo(toX(q), toY(0)); ctx.lineTo(toX(q), toY(p)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(toX(0), toY(p)); ctx.lineTo(toX(q), toY(p)); ctx.stroke();
  });
  ctx.setLineDash([]);

  [[Wx, Wy, "W"], [Xx, Xy, "X"], [Yx, Yy, "Y"], [Zx, Zy, "Z"]].forEach(([x, y, l]) => {
    ctx.fillStyle = "#222";
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = "bold 12px 'DM Mono', monospace";
    ctx.fillText(l, x + 6, y - 6);
  });

  ctx.font = "10px 'DM Mono', monospace";
  ctx.fillStyle = "#555";
  ctx.fillText(R(Q_e, 1), toX(Q_e) - 8, toY(0) + 14);
  ctx.fillText(R(Q_c, 1), toX(Q_c) - 8, toY(0) + 14);
  ctx.fillText("Qe", toX(Q_e) - 6, toY(0) + 26);
  ctx.fillText("Qc", toX(Q_c) - 6, toY(0) + 26);

  // P_e and P_c labels on the y-axis at the equilibrium price levels — grey, like Qe/Qc
  ctx.font = "10px 'DM Mono', monospace";
  ctx.fillStyle = "#555";
  const peText = `Pe = ${R(P_e, 1)}`;
  const pcText = `Pc = ${R(P_c, 1)}`;
  ctx.fillText(peText, mx - ctx.measureText(peText).width - 8, toY(P_e) + 4);
  ctx.fillText(pcText, mx - ctx.measureText(pcText).width - 8, toY(P_c) + 4);

  // y-intercept labels for MSB, MSC, MPC — colored to match each curve.
  // If two intercepts are too close to label cleanly, nudge the later ones up.
  const P_msc_0 = evalExpr(MSC, varName, 0);
  const P_mpc_0 = evalExpr(MPC, varName, 0);
  const intercepts = [
    { name: "MSB", val: P_msb_0, color: "#7b5ea7" },
    { name: "MSC", val: P_msc_0, color: "#c0392b" },
    { name: "MPC", val: P_mpc_0, color: "#4a7fb5" },
  ].sort((a, b) => a.val - b.val); // label bottom-up so nudges push upward

  const pxGap = 14; // min vertical px between two intercept labels
  const usedPx = [];
  ctx.font = "bold 10px 'DM Mono', monospace";
  intercepts.forEach(({ name, val, color }) => {
    // dot on the y-axis
    ctx.fillStyle = "#222";
    ctx.beginPath(); ctx.arc(toX(0), toY(val), 3, 0, Math.PI * 2); ctx.fill();

    // place label; nudge up if too close to an already-placed one
    let py = toY(val);
    usedPx.forEach(prev => {
      if (Math.abs(py - prev) < pxGap) py = prev - pxGap;
    });
    usedPx.push(py);

    ctx.fillStyle = color;
    const text = `${name} = ${R(val, 1)}`;
    ctx.fillText(text, mx - ctx.measureText(text).width - 8, py + 4);
  });

  ctx.font = "bold 13px 'DM Mono', monospace";
  ctx.fillStyle = "#222";
  ctx.fillText("Negative Externality", W / 2 - 80, 22);
}

// ─── Drawing: MSC with IC label INSIDE the shaded area ───
function drawMSC(ctx, W, H, mscStr, aOld, aNew) {
  const varName = findVariable(mscStr);
  const mscOld = evalExpr(mscStr, varName, aOld);
  const mscNew = evalExpr(mscStr, varName, aNew);
  const aMax = aNew * 1.4;
  const pMax = evalExpr(mscStr, varName, aMax) * 1.2;

  const mx = 80, my = 40, gw = W - mx - 30, gh = H - my - 60;
  const toX = (a) => mx + (a / aMax) * gw;
  const toY = (p) => my + gh - (p / pMax) * gh;

  ctx.fillStyle = "#faf9f6";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my + gh); ctx.lineTo(mx + gw, my + gh); ctx.stroke();

  ctx.font = "bold 13px 'DM Mono', monospace";
  ctx.fillStyle = "#222";
  ctx.fillText("A", mx + gw / 2, H - 8);
  ctx.fillText("$", 12, my + gh / 2);

  // MSC curve
  ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const a = (i / 200) * aMax;
    const p = evalExpr(mscStr, varName, a);
    if (i === 0) ctx.moveTo(toX(a), toY(p)); else ctx.lineTo(toX(a), toY(p));
  }
  ctx.stroke();

  // shaded area under curve between aOld and aNew
  ctx.fillStyle = "rgba(74,127,181,0.25)";
  ctx.beginPath();
  ctx.moveTo(toX(aOld), toY(0));
  for (let i = 0; i <= 100; i++) {
    const a = aOld + (i / 100) * (aNew - aOld);
    ctx.lineTo(toX(a), toY(evalExpr(mscStr, varName, a)));
  }
  ctx.lineTo(toX(aNew), toY(0));
  ctx.closePath();
  ctx.fill();

  // dashed lines
  ctx.setLineDash([5, 4]); ctx.strokeStyle = "#999"; ctx.lineWidth = 1;
  [[aOld, mscOld], [aNew, mscNew]].forEach(([a, p]) => {
    ctx.beginPath(); ctx.moveTo(toX(a), toY(0)); ctx.lineTo(toX(a), toY(p)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(toX(0), toY(p)); ctx.lineTo(toX(a), toY(p)); ctx.stroke();
  });
  ctx.setLineDash([]);

  // points
  ctx.fillStyle = "#222";
  [[aOld, mscOld], [aNew, mscNew]].forEach(([a, p]) => {
    ctx.beginPath(); ctx.arc(toX(a), toY(p), 4, 0, Math.PI * 2); ctx.fill();
  });

  // FIX 1: IC label — positioned inside the shaded area
  // Use the centroid of the region: x at midpoint, y at 1/3 of the curve height (lower = more inside)
  const ic = R(integrate(mscStr, varName, aOld, aNew));
  const aMid = (aOld + aNew) / 2;
  const mscAtMid = evalExpr(mscStr, varName, aMid);
  // Place at ~35% of curve height at midpoint (0 = bottom/x-axis, mscAtMid = curve)
  const labelPriceY = mscAtMid * 0.35;
  ctx.font = "bold 12px 'DM Mono', monospace";
  ctx.fillStyle = "#3a6a9e";
  const icText = `IC = ${ic}`;
  const textWidth = ctx.measureText(icText).width;
  ctx.fillText(icText, toX(aMid) - textWidth / 2, toY(labelPriceY));

  // axis labels
  ctx.font = "10px 'DM Mono', monospace";
  ctx.fillStyle = "#555";
  ctx.fillText(R(aOld, 1), toX(aOld) - 8, toY(0) + 14);
  ctx.fillText(R(aNew, 1), toX(aNew) - 8, toY(0) + 14);
  ctx.fillText("A_old", toX(aOld) - 12, toY(0) + 26);
  ctx.fillText("A_new", toX(aNew) - 12, toY(0) + 26);
  ctx.fillText(R(mscOld, 1), 10, toY(mscOld) + 4);
  ctx.fillText(R(mscNew, 1), 10, toY(mscNew) + 4);

  // curve label
  ctx.font = "11px 'DM Mono', monospace";
  ctx.fillStyle = "#c0392b";
  ctx.fillText("MSC", toX(aMax * 0.92) - 20, toY(evalExpr(mscStr, varName, aMax * 0.92)) - 8);

  // y intercept
  const y0 = evalExpr(mscStr, varName, 0);
  ctx.fillStyle = "#222";
  ctx.beginPath(); ctx.arc(toX(0), toY(y0), 3, 0, Math.PI * 2); ctx.fill();
  ctx.font = "10px 'DM Mono', monospace";
  ctx.fillStyle = "#555";
  ctx.fillText(R(y0, 1), 10, toY(y0) + 4);

  ctx.font = "bold 13px 'DM Mono', monospace";
  ctx.fillStyle = "#222";
  ctx.fillText("MSC: Incremental Cost", W / 2 - 80, 22);
}

// ─── Tabs ───
const TABS = [
  { id: "externality", label: "Externality", icon: "\u2696\uFE0F" },
  { id: "abatement", label: "Abatement", icon: "\uD83C\uDFED" },
  { id: "time", label: "Time Value", icon: "\u23F3" },
];

// ─── JSON Upload Component ───
function JsonUpload({ onLoad, label }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        onLoad(data);
      } catch (err) {
        setError("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ marginBottom: 16, padding: 14, background: "#faf9f6", borderRadius: 8, border: "1.5px dashed #ccc" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "#666" }}>{label || "Load from JSON"}</span>
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            padding: "6px 14px",
            background: "#222",
            color: "#f5f3ee",
            border: "none",
            borderRadius: 5,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
          }}
        >
          Choose File
        </button>
        {fileName && <span style={{ fontSize: 11, color: "#4a7fb5" }}>{"\u2713"} {fileName}</span>}
        {error && <span style={{ fontSize: 11, color: "#c0392b" }}>{error}</span>}
      </div>
      <input ref={fileRef} type="file" accept=".json" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}

// ─── Main App ───
export default function App() {
  const [tab, setTab] = useState("externality");

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ee", fontFamily: "'DM Mono', 'Courier New', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet" />
      <Header />
      <nav style={{ display: "flex", justifyContent: "center", gap: 4, padding: "0 16px 16px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 20px",
              background: tab === t.id ? "#222" : "transparent",
              color: tab === t.id ? "#f5f3ee" : "#555",
              border: "1.5px solid " + (tab === t.id ? "#222" : "#ccc"),
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 500,
              transition: "all 0.2s",
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </nav>
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "0 16px 60px" }}>
        {tab === "externality" && <ExternalityPanel />}
        {tab === "abatement" && <AbatementPanel />}
        {tab === "time" && <TimePanel />}
      </main>
      <footer style={{ textAlign: "center", padding: "24px 16px", color: "#999", fontSize: 11 }}>
        Environmental Economics Calculator — Built for academic use
      </footer>
    </div>
  );
}

function Header() {
  return (
    <header style={{ textAlign: "center", padding: "40px 16px 20px" }}>
      <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 900, color: "#222", margin: 0, letterSpacing: -1 }}>
        Env Econ Toolkit
      </h1>
      <p style={{ color: "#888", fontSize: 13, marginTop: 6, maxWidth: 500, marginInline: "auto" }}>
        Externalities, abatement costs, present value — all in one place.
      </p>
    </header>
  );
}

// ─── Shared UI ───
function Card({ children, title }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: 24, marginBottom: 16, border: "1px solid #e5e2db", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      {title && <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 500, color: "#222" }}>{title}</h3>}
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, small }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 3 }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: small ? 120 : "100%",
          boxSizing: "border-box",
          padding: "8px 10px",
          border: "1.5px solid #ddd",
          borderRadius: 6,
          fontFamily: "inherit",
          fontSize: 13,
          background: "#faf9f6",
          outline: "none",
        }}
      />
    </label>
  );
}

function Btn({ children, onClick, secondary, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 22px",
        background: disabled ? "#ccc" : secondary ? "transparent" : "#222",
        color: disabled ? "#999" : secondary ? "#222" : "#f5f3ee",
        border: secondary ? "1.5px solid #222" : "none",
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: 500,
        marginRight: 8,
        marginTop: 8,
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function ResultRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0ede6", fontSize: 13 }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ fontWeight: 500, color: "#222" }}>{value}</span>
    </div>
  );
}

// ─── Externality Panel ───
function ExternalityPanel() {
  const [vars, setVars] = useState({ MSB: "", MPC: "", MEC: "", MSC: "", MAC_1: "", MAC_2: "", TAC_1: "", TAC_2: "" });
  const [results, setResults] = useState(null);
  const [graphFn, setGraphFn] = useState(null);
  const [mode, setMode] = useState(null);
  const [evalTarget, setEvalTarget] = useState("");
  const [evalVal, setEvalVal] = useState("");
  const [evalResult, setEvalResult] = useState(null);
  const [totalAbatement, setTotalAbatement] = useState("");
  const [tsbLower, setTsbLower] = useState("");
  const [tsbUpper, setTsbUpper] = useState("");

  const set = (k) => (v) => setVars(prev => ({ ...prev, [k]: v }));

  const handleJsonLoad = (data) => {
    const source = data.variables || data;
    // start from blank slate so old values don't linger across uploads
    const newVars = { MSB: "", MPC: "", MEC: "", MSC: "", MAC_1: "", MAC_2: "", TAC_1: "", TAC_2: "" };
    for (const [key, val] of Object.entries(source)) {
      if (val === "" || val === undefined || val === null) continue;
      const strVal = String(val);
      if (key === "MPB") {
        newVars.MSB = strVal;
      } else if (key === "MAC_MKT") {
        newVars.MAC_1 = strVal;
      } else if (key === "TAC" && !key.includes("_")) {
        newVars.TAC_1 = strVal;
      } else if (key in newVars) {
        newVars[key] = strVal;
      }
    }
    setVars(newVars);
    // reset auxiliary inputs + any stale result/graph
    setTotalAbatement(source.total_abatement !== undefined ? String(source.total_abatement) : "");
    setTsbLower(source.tsb_lower !== undefined ? String(source.tsb_lower) : "");
    setTsbUpper(source.tsb_upper !== undefined ? String(source.tsb_upper) : "");
    setEvalTarget("");
    setEvalVal("");
    setEvalResult(null);
    setResults(null);
    setGraphFn(null);
    setMode(null);
  };

  const derive = (v) => {
    const nv = { ...v };
    if (nv.MPC && nv.MEC && !nv.MSC) nv.MSC = `(${nv.MPC})+(${nv.MEC})`;
    if (nv.MSC && nv.MEC && !nv.MPC) nv.MPC = `(${nv.MSC})-(${nv.MEC})`;
    if (nv.MSC && nv.MPC && !nv.MEC) nv.MEC = `(${nv.MSC})-(${nv.MPC})`;
    return nv;
  };

  // Figure out which cost variable is missing and display the derived expression.
  // If the user has entered MPC and MSC (but not MEC), this computes MEC = MSC - MPC
  // and likewise for MSC = MPC + MEC, or MPC = MSC - MEC.
  const computeDerive = () => {
    const dv = derive(vars);
    const items = [];
    let derivedKey = null;
    if (!vars.MSC && dv.MSC)      { items.push(["MSC (derived)", dv.MSC], ["formula", "MPC + MEC"]); derivedKey = "MSC"; }
    else if (!vars.MPC && dv.MPC) { items.push(["MPC (derived)", dv.MPC], ["formula", "MSC - MEC"]); derivedKey = "MPC"; }
    else if (!vars.MEC && dv.MEC) { items.push(["MEC (derived)", dv.MEC], ["formula", "MSC - MPC"]); derivedKey = "MEC"; }
    else {
      // nothing to derive — tell the user what's needed
      const filled = ["MPC","MEC","MSC"].filter(k => vars[k]);
      setResults({ title: "Derive Missing Variable",
        items: [["Status", filled.length === 3 ? "All three already filled in" : `Need two of MPC / MEC / MSC (you have ${filled.length})`]] });
      setMode("derive");
      return;
    }
    // also fill the form field so the user can see the new value
    setVars(prev => ({ ...prev, [derivedKey]: dv[derivedKey] }));
    setResults({ title: "Derive Missing Variable", items });
    setMode("derive");
  };

  const computeCompetitive = () => {
    const dv = derive(vars);
    const vn = findVariable(dv.MSB);
    const Q = solveEquation(dv.MSB, dv.MPC, vn, 0, 500);
    const P = evalExpr(dv.MSB, vn, Q);
    setResults({ title: "Competitive Equilibrium (MSB = MPC)", items: [["Q*", R(Q)], ["P*", R(P)]] });
    setMode("competitive");
  };

  const computeEfficient = () => {
    const dv = derive(vars);
    const vn = findVariable(dv.MSB);
    const Q = solveEquation(dv.MSB, dv.MSC, vn, 0, 500);
    const P = evalExpr(dv.MSB, vn, Q);
    setResults({ title: "Efficient Equilibrium (MSB = MSC)", items: [["Q*", R(Q)], ["P*", R(P)]] });
    setMode("efficient");
  };

  const computePigouvian = () => {
    const dv = derive(vars);
    const vn = findVariable(dv.MSB);
    const Q_e = solveEquation(dv.MSB, dv.MSC, vn, 0, 500);
    const tax = evalExpr(dv.MEC, vn, Q_e);
    setResults({ title: "Pigouvian Tax", items: [["Efficient Q", R(Q_e)], ["t = MEC @ Q_e", R(tax)]] });
    setMode("pigouvian");
  };

  const computeFullSolve = () => {
    const dv = derive(vars);
    const vn = findVariable(dv.MSB);
    const Q_c = solveEquation(dv.MSB, dv.MPC, vn, 0, 500);
    const P_c = evalExpr(dv.MSB, vn, Q_c);
    const Q_e = solveEquation(dv.MSB, dv.MSC, vn, 0, 500);
    const P_e = evalExpr(dv.MSB, vn, Q_e);
    const tax = evalExpr(dv.MEC, vn, Q_e);
    const P_msb_0 = evalExpr(dv.MSB, vn, 0);
    const P_mpc_0 = evalExpr(dv.MPC, vn, 0);
    const P_msc_0 = evalExpr(dv.MSC, vn, 0);
    setResults({
      title: "Full Solve",
      items: [
        ["Competitive Q", R(Q_c)], ["Competitive P", R(P_c)],
        ["Efficient Q", R(Q_e)], ["Efficient P", R(P_e)],
        ["Pigouvian Tax", R(tax)],
        ["MSB @ Q=0", R(P_msb_0)], ["MPC @ Q=0", R(P_mpc_0)], ["MSC @ Q=0", R(P_msc_0)],
      ],
    });
    setGraphFn(() => (ctx, w, h) => drawExternality(ctx, w, h, dv));
    setMode("full");
  };

  const doEval = () => {
    if (!evalTarget || !evalVal) return;
    const dv = derive(vars);
    const expr = dv[evalTarget];
    if (!expr) return;
    const vn = findVariable(expr);
    const v = parseFloat(evalVal);
    setEvalResult({ name: evalTarget, varName: vn, val: v, result: R(evalExpr(expr, vn, v)) });
  };

  const computeCostEffective = () => {
    const dv = derive(vars);
    if (!dv.MAC_1 || !dv.MAC_2 || !totalAbatement) return;
    const v1 = findVariable(dv.MAC_1);
    const v2 = findVariable(dv.MAC_2);
    const total = parseFloat(totalAbatement);
    const sol = solveTwoEq(dv.MAC_1, dv.MAC_2, v1, v2, total);
    const macAtSol = evalExpr(dv.MAC_1, v1, sol[v1]);
    setResults({
      title: "Cost Effective Solution",
      items: [[v1, R(sol[v1])], [v2, R(sol[v2])], ["MAC @ solution", R(macAtSol)]],
    });
    setMode("costeff");
  };

  const computeTSB = () => {
    const dv = derive(vars);
    if (!dv.MSB || tsbLower === "" || tsbUpper === "") return;
    const vn = findVariable(dv.MSB);
    const lo = parseFloat(tsbLower);
    const hi = parseFloat(tsbUpper);
    const tsb = integrate(dv.MSB, vn, lo, hi);
    setResults({ title: "Total Social Benefit", items: [["TSB", R(tsb)], ["From", lo], ["To", hi]] });
    setMode("tsb");
  };

  const computeCostSavings = () => {
    const dv = derive(vars);
    if (!dv.MAC_1 || !dv.MAC_2 || !dv.TAC_1 || !dv.TAC_2 || !totalAbatement) return;
    const v1 = findVariable(dv.MAC_1);
    const v2 = findVariable(dv.MAC_2);
    const total = parseFloat(totalAbatement);
    const sol = solveTwoEq(dv.MAC_1, dv.MAC_2, v1, v2, total);
    const equal = total / 2;
    const tv1 = findVariable(dv.TAC_1);
    const tv2 = findVariable(dv.TAC_2);
    const tac1_opt = evalExpr(dv.TAC_1, tv1, sol[v1]);
    const tac2_opt = evalExpr(dv.TAC_2, tv2, sol[v2]);
    const tac1_eq = evalExpr(dv.TAC_1, tv1, equal);
    const tac2_eq = evalExpr(dv.TAC_2, tv2, equal);
    const withT = tac1_opt + tac2_opt;
    const withoutT = tac1_eq + tac2_eq;
    setResults({
      title: "Cost Savings from Trading",
      items: [
        [v1 + " (optimal)", R(sol[v1])], [v2 + " (optimal)", R(sol[v2])],
        ["TAC w/ trading", R(withT)], ["TAC w/o trading", R(withoutT)],
        ["Savings", R(withoutT - withT)],
      ],
    });
    setMode("savings");
  };

  const allVars = derive(vars);
  const availableEval = Object.entries(allVars).filter(([, v]) => v);

  return (
    <>
      <Card title="Equations">
        <JsonUpload label="Upload preload.json (Externality)" onLoad={handleJsonLoad} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Field label="MSB (demand)" value={vars.MSB} onChange={set("MSB")} placeholder="e.g. 200-2Q" />
          <Field label="MPC (supply)" value={vars.MPC} onChange={set("MPC")} placeholder="e.g. 20+2Q" />
          <Field label="MEC (externality)" value={vars.MEC} onChange={set("MEC")} placeholder="e.g. 2Q" />
          <Field label="MSC" value={vars.MSC} onChange={set("MSC")} placeholder="auto-derives from MPC+MEC" />
          <Field label="MAC_1" value={vars.MAC_1} onChange={set("MAC_1")} placeholder="optional" />
          <Field label="MAC_2" value={vars.MAC_2} onChange={set("MAC_2")} placeholder="optional" />
          <Field label="TAC_1" value={vars.TAC_1} onChange={set("TAC_1")} placeholder="optional" />
          <Field label="TAC_2" value={vars.TAC_2} onChange={set("TAC_2")} placeholder="optional" />
        </div>
        <Field label="Total Abatement Standard (for Cost Effective / Cost Savings)" value={totalAbatement} onChange={setTotalAbatement} placeholder="e.g. 100" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Field label="TSB lower bound" value={tsbLower} onChange={setTsbLower} placeholder="e.g. 20" />
          <Field label="TSB upper bound" value={tsbUpper} onChange={setTsbUpper} placeholder="e.g. 30" />
        </div>
      </Card>

      <Card title="Operations">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <Btn onClick={computeDerive} secondary disabled={["MPC","MEC","MSC"].filter(k => vars[k]).length < 2}>Derive Missing (MCE / MSC / MPC)</Btn>
          <Btn onClick={computeCompetitive} disabled={!allVars.MSB || !allVars.MPC}>Competitive EQ</Btn>
          <Btn onClick={computeEfficient} disabled={!allVars.MSB || !allVars.MSC}>Efficient EQ</Btn>
          <Btn onClick={computePigouvian} disabled={!allVars.MEC || !allVars.MSB || !allVars.MSC}>Pigouvian Tax</Btn>
          <Btn onClick={computeFullSolve} disabled={!allVars.MSB || !allVars.MPC || !allVars.MSC || !allVars.MEC}>Full Solve + Graph</Btn>
          <Btn onClick={computeCostEffective} secondary disabled={!allVars.MAC_1 || !allVars.MAC_2 || !totalAbatement}>Cost Effective</Btn>
          <Btn onClick={computeTSB} secondary disabled={!allVars.MSB || tsbLower === "" || tsbUpper === ""}>TSB</Btn>
          <Btn onClick={computeCostSavings} secondary disabled={!allVars.MAC_1 || !allVars.MAC_2 || !allVars.TAC_1 || !allVars.TAC_2 || !totalAbatement}>Cost Savings</Btn>
        </div>
      </Card>

      <Card title="Evaluate Any Equation">
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ fontSize: 11, color: "#666" }}>
            Variable
            <select value={evalTarget} onChange={e => setEvalTarget(e.target.value)} style={{ display: "block", marginTop: 3, padding: "8px 10px", border: "1.5px solid #ddd", borderRadius: 6, fontFamily: "inherit", fontSize: 13, background: "#faf9f6" }}>
              <option value="">select</option>
              {availableEval.map(([k]) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <Field label="Value" value={evalVal} onChange={setEvalVal} placeholder="e.g. 50" small />
          <Btn onClick={doEval} disabled={!evalTarget || !evalVal}>Evaluate</Btn>
        </div>
        {evalResult && (
          <div style={{ marginTop: 12, padding: 12, background: "#faf9f6", borderRadius: 6, fontSize: 13 }}>
            {evalResult.name} @ {evalResult.varName}={evalResult.val} = <strong>{evalResult.result}</strong>
          </div>
        )}
      </Card>

      {results && (
        <Card title={results.title}>
          {results.items.map(([l, v], i) => <ResultRow key={i} label={l} value={v} />)}
        </Card>
      )}

      {graphFn && (
        <Card title="Graph">
          <GraphCanvas drawFn={graphFn} />
        </Card>
      )}
    </>
  );
}

// ─── Abatement Panel ───
function AbatementPanel() {
  const [msc, setMsc] = useState("");
  const [aOld, setAOld] = useState("");
  const [aNew, setANew] = useState("");
  const [results, setResults] = useState(null);
  const [graphFn, setGraphFn] = useState(null);
  const [graphType, setGraphType] = useState(null);

  const handleJsonLoad = (data) => {
    const source = data.variables || data;
    // reset all fields first so old values don't linger
    setMsc(source.MSC ? String(source.MSC) : "");
    setAOld(source.A_old !== undefined ? String(source.A_old) : "");
    setANew(source.A_new !== undefined ? String(source.A_new) : "");
    setResults(null);
    setGraphFn(null);
    setGraphType(null);
  };

  const compute = () => {
    const vn = findVariable(msc);
    const a1 = parseFloat(aOld), a2 = parseFloat(aNew);
    const mscOld = evalExpr(msc, vn, a1);
    const mscNew = evalExpr(msc, vn, a2);
    const tscOld = integrate(msc, vn, 0, a1);
    const tscNew = integrate(msc, vn, 0, a2);
    const ic = tscNew - tscOld;
    setResults({
      items: [
        ["MSC @ A_old", R(mscOld)], ["MSC @ A_new", R(mscNew)],
        ["TSC @ A_old", R(tscOld)], ["TSC @ A_new", R(tscNew)],
        ["Incremental Cost", R(ic)],
      ],
    });
  };

  const showMSCGraph = () => {
    const a1 = parseFloat(aOld), a2 = parseFloat(aNew);
    setGraphFn(() => (ctx, w, h) => drawMSC(ctx, w, h, msc, a1, a2));
    setGraphType("msc");
  };

  const showTSCGraph = () => {
    const vn = findVariable(msc);
    const a1 = parseFloat(aOld), a2 = parseFloat(aNew);
    setGraphFn(() => (ctx, w, h) => {
      const aMax = a2 * 1.4;
      const tscMax = integrate(msc, vn, 0, aMax) * 1.3;
      const mx = 80, my = 40, gw = w - mx - 50, gh = h - my - 60;
      const toX = (a) => mx + (a / aMax) * gw;
      const toY = (p) => my + gh - (p / tscMax) * gh;

      ctx.fillStyle = "#faf9f6"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my + gh); ctx.lineTo(mx + gw, my + gh); ctx.stroke();

      ctx.font = "bold 13px 'DM Mono', monospace";
      ctx.fillStyle = "#222";
      ctx.fillText("A", mx + gw / 2, h - 8);
      ctx.fillText("$", 12, my + gh / 2);

      // TSC curve
      ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const a = (i / 200) * aMax;
        const tsc = integrate(msc, vn, 0, a, 200);
        if (i === 0) ctx.moveTo(toX(a), toY(tsc)); else ctx.lineTo(toX(a), toY(tsc));
      }
      ctx.stroke();

      const tscOld = integrate(msc, vn, 0, a1);
      const tscNew = integrate(msc, vn, 0, a2);
      const ic = R(tscNew - tscOld);

      // points on curve
      ctx.fillStyle = "#222";
      [[a1, tscOld], [a2, tscNew]].forEach(([a, t]) => {
        ctx.beginPath(); ctx.arc(toX(a), toY(t), 4, 0, Math.PI * 2); ctx.fill();
      });

      // FIX 2: Dashed lines — horizontal lines for BOTH tscOld and tscNew extend to A_new
      ctx.setLineDash([5, 4]); ctx.strokeStyle = "#999"; ctx.lineWidth = 1;

      // Vertical at A_old
      ctx.beginPath(); ctx.moveTo(toX(a1), toY(0)); ctx.lineTo(toX(a1), toY(tscOld)); ctx.stroke();
      // Vertical at A_new
      ctx.beginPath(); ctx.moveTo(toX(a2), toY(0)); ctx.lineTo(toX(a2), toY(tscNew)); ctx.stroke();

      // Horizontal for TSC_old — extends from y-axis all the way past A_new to the bracket
      const bx = toX(a2) + 16;
      ctx.beginPath(); ctx.moveTo(toX(0), toY(tscOld)); ctx.lineTo(bx, toY(tscOld)); ctx.stroke();
      // Horizontal for TSC_new — extends from y-axis to A_new and the bracket
      ctx.beginPath(); ctx.moveTo(toX(0), toY(tscNew)); ctx.lineTo(bx, toY(tscNew)); ctx.stroke();

      ctx.setLineDash([]);

      // Right-side bracket showing IC
      ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx, toY(tscOld)); ctx.lineTo(bx, toY(tscNew)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - 5, toY(tscOld)); ctx.lineTo(bx + 5, toY(tscOld)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - 5, toY(tscNew)); ctx.lineTo(bx + 5, toY(tscNew)); ctx.stroke();

      // IC label
      ctx.font = "bold 12px 'DM Mono', monospace";
      ctx.fillStyle = "#222";
      ctx.fillText(`IC = ${ic}`, bx + 10, (toY(tscOld) + toY(tscNew)) / 2 + 4);

      // Curve label
      ctx.font = "11px 'DM Mono', monospace";
      ctx.fillStyle = "#c0392b";
      ctx.fillText("TSC", toX(aMax * 0.9) - 10, toY(integrate(msc, vn, 0, aMax * 0.9, 200)) - 8);

      // Axis labels
      ctx.font = "10px 'DM Mono', monospace";
      ctx.fillStyle = "#555";
      ctx.fillText(R(a1, 1), toX(a1) - 8, toY(0) + 14);
      ctx.fillText("A_old", toX(a1) - 12, toY(0) + 26);
      ctx.fillText(R(a2, 1), toX(a2) - 8, toY(0) + 14);
      ctx.fillText("A_new", toX(a2) - 12, toY(0) + 26);
      ctx.fillText(R(tscOld, 1), 10, toY(tscOld) + 4);
      ctx.fillText(R(tscNew, 1), 10, toY(tscNew) + 4);

      ctx.font = "bold 13px 'DM Mono', monospace";
      ctx.fillStyle = "#222";
      ctx.fillText("TSC: Incremental Cost", w / 2 - 80, 22);
    });
    setGraphType("tsc");
  };

  return (
    <>
      <Card title="Marginal Social Cost of Abatement">
        <JsonUpload label="Upload preload.json (Abatement)" onLoad={handleJsonLoad} />
        <Field label="MSC equation" value={msc} onChange={setMsc} placeholder="4+0.75A" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Field label="A_old" value={aOld} onChange={setAOld} placeholder="e.g. 10" />
          <Field label="A_new" value={aNew} onChange={setANew} placeholder="e.g. 20" />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <Btn onClick={compute} disabled={!msc || !aOld || !aNew}>Compute Incremental Cost</Btn>
          <Btn onClick={showMSCGraph} secondary disabled={!msc || !aOld || !aNew}>Graph MSC</Btn>
          <Btn onClick={showTSCGraph} secondary disabled={!msc || !aOld || !aNew}>Graph TSC</Btn>
        </div>
      </Card>
      {results && (
        <Card title="Incremental Cost Results">
          {results.items.map(([l, v], i) => <ResultRow key={i} label={l} value={v} />)}
        </Card>
      )}
      {graphFn && <Card title="Graph"><GraphCanvas drawFn={graphFn} /></Card>}
    </>
  );
}

// ─── Time Value Panel ───
function TimePanel() {
  const [years, setYears] = useState([
    { year: "", nominal: "", cpi: "", nrb: "", benefit: "", cost: "" },
    { year: "", nominal: "", cpi: "", nrb: "", benefit: "", cost: "" },
  ]);
  const [discountRate, setDiscountRate] = useState("");
  const [inflationRate, setInflationRate] = useState("");
  const [baseYear, setBaseYear] = useState("");
  const [pvFV, setPvFV] = useState("");
  const [pvRate, setPvRate] = useState("");
  const [pvT, setPvT] = useState("");
  const [pvResult, setPvResult] = useState(null);
  const [results, setResults] = useState(null);
  const [mode, setMode] = useState(null);

  const handleJsonLoad = (data) => {
    const source = data.variables || data;
    setDiscountRate(source.discount_rate !== undefined ? String(source.discount_rate) : "");
    setInflationRate(source.inflation_rate !== undefined ? String(source.inflation_rate) : "");
    setBaseYear(source.start_year !== undefined ? String(source.start_year) : "");
    setResults(null);
    setMode(null);
    setPvResult(null);

    const yearData = data.years || {};
    if (Object.keys(yearData).length > 0) {
      const newYears = Object.entries(yearData).map(([yr, vals]) => ({
        year: parseInt(yr),
        nominal: vals.nominal !== undefined ? vals.nominal : "",
        cpi: vals.CPI !== undefined ? vals.CPI : (vals.cpi !== undefined ? vals.cpi : ""),
        nrb: vals.nrb !== undefined ? vals.nrb : (vals.NRB !== undefined ? vals.NRB : ""),
        benefit: vals.benefit !== undefined ? vals.benefit : "",
        cost: vals.cost !== undefined ? vals.cost : "",
      }));
      newYears.sort((a, b) => a.year - b.year);
      setYears(newYears);
    }
  };

  const addYear = () => {
    const lastYear = years.length > 0 ? years[years.length - 1].year + 1 : 2020;
    setYears([...years, { year: lastYear, nominal: "", cpi: "", nrb: "", benefit: "", cost: "" }]);
  };
  const removeYear = (i) => setYears(years.filter((_, j) => j !== i));
  const updateYear = (i, field, val) => {
    const ny = [...years];
    ny[i] = { ...ny[i], [field]: val };
    setYears(ny);
  };

  const convertNominalToReal = () => {
    const by = parseInt(baseYear) || years[0]?.year;
    const sortedYears = [...years].sort((a, b) => a.year - b.year);

    let p;
    let source;
    if (inflationRate) {
      // Direct inflation rate provided (e.g. 0.05 for 5%)
      p = parseFloat(inflationRate);
      source = "direct";
    } else {
      // Derive from CPI values
      const first = sortedYears[0], last = sortedYears[sortedYears.length - 1];
      const cpiFirst = parseFloat(first.cpi), cpiLast = parseFloat(last.cpi);
      p = (cpiLast - cpiFirst) / cpiFirst;
      source = "cpi";
    }

    const rows = sortedYears.map(y => {
      const t = y.year - by;
      const real = R(parseFloat(y.nominal) / (1 + p) ** t);
      return { ...y, t, real, p };
    });

    setResults({ type: "nominal_to_real", rows, inflationRate: R(p * 100), baseYear: by, inflationSource: source });
    setMode("real");
  };

  const computeGrowthRate = () => {
    if (!results || results.type !== "nominal_to_real") return;
    const rows = results.rows;
    if (rows.length < 2) return;
    const first = rows[0], last = rows[rows.length - 1];
    const growth = R(((last.real - first.real) / first.real) * 100);
    setResults(prev => ({ ...prev, growth, growthFrom: first.year, growthTo: last.year }));
  };

  const buildPVTable = () => {
    const r = parseFloat(discountRate);
    const p = inflationRate ? parseFloat(inflationRate) : 0;
    const sortedYears = [...years].sort((a, b) => a.year - b.year);
    const by = sortedYears[0].year;
    let totalPV = 0;
    const rows = sortedYears.map(y => {
      const t = y.year - by;
      const nom = parseFloat(y.nominal);
      // Step 1: inflation correction — nominal to real
      const realVal = R(nom / (1 + p) ** t);
      // Step 2: discounting — real to present value
      const df = R(1 / (1 + r) ** t);
      const pv = R(realVal * df);
      totalPV += pv;
      return { ...y, t, realVal, df, pv };
    });
    setResults({ type: "pv_table", rows, totalPV: R(totalPV), r, p });
    setMode("pv");
  };

  const computePVNB = () => {
    const r = parseFloat(discountRate);
    const sortedYears = [...years].sort((a, b) => a.year - b.year);
    const by = sortedYears[0].year;
    let totalPVNB = 0;
    const rows = sortedYears.map(y => {
      const t = y.year - by;
      const nrb = parseFloat(y.nrb) || 0;
      const df = R(1 / (1 + r) ** t);
      const pv = R(nrb * df);
      totalPVNB += pv;
      return { ...y, t, df, pv };
    });
    setResults({ type: "pvnb", rows, totalPVNB: R(totalPVNB), r });
    setMode("pvnb");
  };

  const computePVSingle = () => {
    const fv = parseFloat(pvFV);
    const r = parseFloat(pvRate);
    const t = parseFloat(pvT);
    if (isNaN(fv) || isNaN(r) || isNaN(t)) return;
    const pv = R(fv / (1 + r) ** t);
    setPvResult({ fv, r, t, pv });
  };

  const computeBCA = () => {
    const r = parseFloat(discountRate);
    const p = inflationRate ? parseFloat(inflationRate) : 0;
    const sortedYears = [...years].sort((a, b) => a.year - b.year);
    const by = sortedYears[0].year;
    let totalPVB = 0;
    let totalPVC = 0;
    const rows = sortedYears.map(y => {
      const t = y.year - by;
      const nomB = parseFloat(y.benefit) || 0;
      const nomC = parseFloat(y.cost) || 0;
      // Step 1: inflation correction
      const realB = R(nomB / (1 + p) ** t);
      const realC = R(nomC / (1 + p) ** t);
      // Step 2: discounting
      const df = R(1 / (1 + r) ** t);
      const pvB = R(realB * df);
      const pvC = R(realC * df);
      totalPVB += pvB;
      totalPVC += pvC;
      return { ...y, t, realB, realC, df, pvB, pvC };
    });
    const pvnb = R(totalPVB - totalPVC);
    const bcr = totalPVC !== 0 ? R(totalPVB / totalPVC) : "N/A";
    const feasible = totalPVB >= totalPVC;
    setResults({ type: "bca", rows, totalPVB: R(totalPVB), totalPVC: R(totalPVC), pvnb, bcr, feasible, r, p });
    setMode("bca");
  };

  const hasBenefitCost = years.some(y => y.benefit || y.cost);

  return (
    <>
      <Card title="Year Data">
        <JsonUpload label="Upload preload.json (Time Value)" onLoad={handleJsonLoad} />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e2db" }}>
                {["Year", "Nominal", "CPI", "NRB", "Benefit", "Cost", ""].map(h => (
                  <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontWeight: 500, color: "#666", fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map((y, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f0ede6" }}>
                  {["year", "nominal", "cpi", "nrb", "benefit", "cost"].map(f => (
                    <td key={f} style={{ padding: 4 }}>
                      <input
                        type="text"
                        value={y[f]}
                        onChange={e => updateYear(i, f, e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", border: "1px solid #eee", borderRadius: 4, fontFamily: "inherit", fontSize: 13, background: "#faf9f6" }}
                      />
                    </td>
                  ))}
                  <td style={{ padding: 4 }}>
                    <button onClick={() => removeYear(i)} style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 16 }}>{"\u00D7"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Btn onClick={addYear} secondary>+ Add Year</Btn>
      </Card>

      <Card title="Parameters">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
          <Field label="Discount Rate (r)" value={discountRate} onChange={setDiscountRate} placeholder="0.10" />
          <Field label="Inflation Rate (p)" value={inflationRate} onChange={setInflationRate} placeholder="0.05" />
          <Field label="Base Year" value={baseYear} onChange={setBaseYear} placeholder="e.g. 2011" />
        </div>
      </Card>

      <Card title="Operations">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <Btn onClick={convertNominalToReal} disabled={years.length < 2 || (!years[0].cpi && !inflationRate)}>{`Nominal \u2192 Real`}</Btn>
          <Btn onClick={computeGrowthRate} disabled={!results || results.type !== "nominal_to_real"} secondary>Growth Rate</Btn>
          <Btn onClick={buildPVTable} disabled={years.length < 1 || !discountRate}>PV Table</Btn>
          <Btn onClick={computePVNB} disabled={years.length < 1 || !discountRate || !years[0].nrb}>PVNB</Btn>
          <Btn onClick={computeBCA} disabled={years.length < 1 || !discountRate || !hasBenefitCost}>BCA (PVB/PVC)</Btn>
        </div>
      </Card>

      <Card title="PV of Single Future Amount">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
          <Field label="Future Value (FV)" value={pvFV} onChange={setPvFV} placeholder="e.g. 500" />
          <Field label="Discount Rate (r)" value={pvRate} onChange={setPvRate} placeholder="e.g. 0.08" />
          <Field label="Periods (t)" value={pvT} onChange={setPvT} placeholder="e.g. 3" />
        </div>
        <Btn onClick={computePVSingle} disabled={!pvFV || !pvRate || !pvT}>Calculate PV</Btn>
        {pvResult && (
          <div style={{ marginTop: 12, padding: 14, background: "#faf9f6", borderRadius: 6, fontSize: 13 }}>
            <ResultRow label="FV" value={pvResult.fv} />
            <ResultRow label="r" value={pvResult.r} />
            <ResultRow label="t" value={pvResult.t} />
            <ResultRow label={`PV = ${pvResult.fv} / (1+${pvResult.r})^${pvResult.t}`} value={pvResult.pv} />
          </div>
        )}
      </Card>

      {results && results.type === "nominal_to_real" && (
        <Card title="Real Values">
          <ResultRow label="Inflation Rate" value={results.inflationRate + "%"} />
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e2db" }}>
                  {["Year", "Nominal", "CPI", "t", "Real"].map(h => (
                    <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontWeight: 500, color: "#666", fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f0ede6" }}>
                    <td style={{ padding: "6px" }}>{r.year}</td>
                    <td style={{ padding: "6px" }}>{r.nominal}</td>
                    <td style={{ padding: "6px" }}>{r.cpi}</td>
                    <td style={{ padding: "6px" }}>{r.t}</td>
                    <td style={{ padding: "6px", fontWeight: 500 }}>{r.real}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {results.growth !== undefined && (
            <div style={{ marginTop: 12, padding: 12, background: "#faf9f6", borderRadius: 6, fontSize: 13 }}>
              Growth Rate ({results.growthFrom}{"\u2192"}{results.growthTo}): <strong>{results.growth}%</strong>
            </div>
          )}
        </Card>
      )}

      {results && results.type === "pv_table" && (
        <Card title="Present Value Table">
          {results.p > 0 && <ResultRow label="Inflation Rate (p)" value={R(results.p * 100) + "%"} />}
          <ResultRow label="Discount Rate (r)" value={R(results.r * 100) + "%"} />
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e2db" }}>
                  {["Year", "Nominal", "Real (÷(1+p)^t)", "Discount Factor", "PV"].map(h => (
                    <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontWeight: 500, color: "#666", fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f0ede6" }}>
                    <td style={{ padding: "6px" }}>{r.year}</td>
                    <td style={{ padding: "6px" }}>{r.nominal}</td>
                    <td style={{ padding: "6px" }}>{r.realVal}</td>
                    <td style={{ padding: "6px" }}>{r.df}</td>
                    <td style={{ padding: "6px", fontWeight: 500 }}>{r.pv}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ResultRow label="Total PVC" value={results.totalPV} />
        </Card>
      )}

      {results && results.type === "pvnb" && (
        <Card title="PVNB Table">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e2db" }}>
                  {["Year", "NRB", "Discount Factor", "PV"].map(h => (
                    <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontWeight: 500, color: "#666", fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f0ede6" }}>
                    <td style={{ padding: "6px" }}>{r.year}</td>
                    <td style={{ padding: "6px" }}>{r.nrb}</td>
                    <td style={{ padding: "6px" }}>{r.df}</td>
                    <td style={{ padding: "6px", fontWeight: 500 }}>{r.pv}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ResultRow label="Total PVNB" value={results.totalPVNB} />
        </Card>
      )}

      {results && results.type === "bca" && (
        <Card title="Benefit-Cost Analysis">
          {results.p > 0 && <ResultRow label="Inflation Rate (p)" value={R(results.p * 100) + "%"} />}
          <ResultRow label="Discount Rate (r)" value={R(results.r * 100) + "%"} />
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e2db" }}>
                  {["Year", "Nom. Benefit", "Nom. Cost", "Real Benefit", "Real Cost", "DF", "PV Benefit", "PV Cost"].map(h => (
                    <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontWeight: 500, color: "#666", fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f0ede6" }}>
                    <td style={{ padding: "6px" }}>{r.year}</td>
                    <td style={{ padding: "6px" }}>{r.benefit}</td>
                    <td style={{ padding: "6px" }}>{r.cost}</td>
                    <td style={{ padding: "6px" }}>{r.realB}</td>
                    <td style={{ padding: "6px" }}>{r.realC}</td>
                    <td style={{ padding: "6px" }}>{r.df}</td>
                    <td style={{ padding: "6px", fontWeight: 500, color: "#2d7d46" }}>{r.pvB}</td>
                    <td style={{ padding: "6px", fontWeight: 500, color: "#c0392b" }}>{r.pvC}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12 }}>
            <ResultRow label="PVB (Total)" value={results.totalPVB} />
            <ResultRow label="PVC (Total)" value={results.totalPVC} />
            <ResultRow label="PVNB = PVB − PVC" value={results.pvnb} />
            <ResultRow label="BCR = PVB / PVC" value={results.bcr} />
            <div style={{
              marginTop: 10,
              padding: "10px 14px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              background: results.feasible ? "#e8f5e9" : "#fce4ec",
              color: results.feasible ? "#2e7d32" : "#c62828",
            }}>
              {results.feasible
                ? `\u2713 Feasible — PVNB > 0 and BCR > 1`
                : `\u2717 Not Feasible — PVNB < 0 and BCR < 1`}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}