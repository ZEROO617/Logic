// 표준 IEEE/ANSI 논리 게이트 기호를 캔버스에 그린다.
import { MIN_VARIADIC_INPUTS, MAX_VARIADIC_INPUTS } from "./gates.js";

const GRID_SIZE = 20;
const BUBBLE_R = 3.5;
// 부정 버블과 출력 핀 점이 겹쳐 보이지 않도록 둘 사이에 확보하는 여백.
const BUBBLE_GAP = 5;

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.world = world; // { circuit, icRegistry, selection, wireDraft, viewport }
  }

  resize() {
    const wrap = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = wrap.clientWidth * dpr;
    this.canvas.height = wrap.clientHeight * dpr;
    this.canvas.style.width = wrap.clientWidth + "px";
    this.canvas.style.height = wrap.clientHeight + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw() {
    const { ctx, canvas } = this;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    ctx.clearRect(0, 0, cssW, cssH);

    const { circuit, icRegistry, selection, wireDraft, rubberBand, camera } = this.world;
    this.drawGrid(cssW, cssH, camera);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    for (const wire of circuit.wires.values()) this.drawWire(wire, circuit);
    if (wireDraft) this.drawWireDraft(wireDraft);
    for (const gate of circuit.gates.values()) {
      this.drawGate(gate, icRegistry, selection.has(gate.id));
    }
    for (const gate of circuit.gates.values()) {
      if (selection.has(gate.id) && gate.canResize()) this.drawResizeControls(gate);
    }
    if (rubberBand) this.drawRubberBand(rubberBand);
    ctx.restore();
  }

  // 카메라가 이동해도 화면 전체를 채우도록, 보이는 영역을 월드 좌표로
  // 환산해 그 범위만큼 격자선을 그린다(격자 자체는 translate하지 않음).
  drawGrid(w, h, camera) {
    const ctx = this.ctx;
    const left = -camera.x, top = -camera.y;
    const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE;
    ctx.strokeStyle = "#e2e6ec";
    ctx.lineWidth = 1;
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.beginPath();
    for (let x = startX; x < left + w; x += GRID_SIZE) { ctx.moveTo(x + 0.5, top); ctx.lineTo(x + 0.5, top + h); }
    for (let y = startY; y < top + h; y += GRID_SIZE) { ctx.moveTo(left, y + 0.5); ctx.lineTo(left + w, y + 0.5); }
    ctx.stroke();
    ctx.restore();
  }

  drawWire(wire, circuit) {
    const from = circuit.gates.get(wire.fromGateId);
    const to = circuit.gates.get(wire.toGateId);
    if (!from || !to) return;
    const p1 = from.outputPinPos(wire.fromPin, this.world.icRegistry);
    const p2 = to.inputPinPos(wire.toPin, this.world.icRegistry);
    const value = from.outputValues[wire.fromPin] ?? 0;
    this.strokeWirePath(p1, p2, value ? "#f59e0b" : "#94a3b8");
  }

  drawWireDraft(draft) {
    this.strokeWirePath(draft.from, draft.to, "#2563eb", true);
  }

  strokeWirePath(p1, p2, color, dashed = false) {
    const ctx = this.ctx;
    const dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.5);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.bezierCurveTo(p1.x + dx, p1.y, p2.x - dx, p2.y, p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawGate(gate, icRegistry, selected) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(gate.x, gate.y);
    ctx.strokeStyle = selected ? "#2563eb" : "#334155";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = selected ? 2.5 : 1.5;

    const draw = this.shapeDrawers[gate.type] || this.shapeDrawers.DEFAULT;
    draw.call(this, gate);

    ctx.restore();
    this.drawPins(gate, icRegistry);
  }

  drawPins(gate, icRegistry) {
    const ctx = this.ctx;
    const def = gate.getDef(icRegistry);
    const numOut = gate.numOutputsOf(def);
    for (let i = 0; i < gate.numInputs; i++) {
      const p = gate.inputPinPos(i, icRegistry);
      this.drawPinDot(p, gate.inputValues[i]);
    }
    for (let i = 0; i < numOut; i++) {
      const p = gate.outputPinPos(i, icRegistry);
      this.drawPinDot(p, gate.outputValues[i]);
    }
  }

  drawPinDot(p, value) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = value ? "#f59e0b" : "#cbd5e1";
    ctx.fill();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawRubberBand(band) {
    const ctx = this.ctx;
    const x = Math.min(band.x1, band.x2), y = Math.min(band.y1, band.y2);
    const w = Math.abs(band.x2 - band.x1), h = Math.abs(band.y2 - band.y1);
    ctx.fillStyle = "rgba(37, 99, 235, 0.1)";
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  drawResizeControls(gate) {
    const { minus, plus } = gate.resizeButtonRects();
    this.drawResizeButton(minus, "−", gate.numInputs > MIN_VARIADIC_INPUTS);
    this.drawResizeButton(plus, "+", gate.numInputs < MAX_VARIADIC_INPUTS);
  }

  drawResizeButton(rect, label, enabled) {
    const ctx = this.ctx;
    ctx.fillStyle = enabled ? "#ffffff" : "#f1f5f9";
    ctx.strokeStyle = enabled ? "#2563eb" : "#cbd5e1";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = enabled ? "#2563eb" : "#94a3b8";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
  }

  get shapeDrawers() {
    return {
      INPUT: function (gate) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.rect(0, 0, gate.width, gate.height);
        ctx.fillStyle = gate.on ? "#fef3c7" : "#ffffff";
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#334155";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(gate.on ? "1" : "0", gate.width / 2, gate.height / 2);
      },
      OUTPUT: function (gate) { this.drawBulb(gate); },
      NOT: function (gate) {
        const ctx = this.ctx;
        const { width: w, height: h } = gate;
        const bubbleCx = w - BUBBLE_GAP - BUBBLE_R;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(bubbleCx - BUBBLE_R, h / 2);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.arc(bubbleCx, h / 2, BUBBLE_R, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      },
      AND: function (gate) { this.drawAndShape(gate, false); },
      NAND: function (gate) { this.drawAndShape(gate, true); },
      OR: function (gate) { this.drawOrShape(gate, false, false); },
      NOR: function (gate) { this.drawOrShape(gate, true, false); },
      XOR: function (gate) { this.drawOrShape(gate, false, true); },
      XNOR: function (gate) { this.drawOrShape(gate, true, true); },
      IC: function (gate) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.rect(0, 0, gate.width, gate.height);
        ctx.fill(); ctx.stroke();
        const def = gate.getDef(this.world.icRegistry);
        ctx.fillStyle = "#334155";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(def.label, gate.width / 2, gate.height / 2);
      },
      DEFAULT: function (gate) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.rect(0, 0, gate.width, gate.height);
        ctx.fill(); ctx.stroke();
      },
    };
  }

  drawAndShape(gate, bubble) {
    const ctx = this.ctx;
    const { width: w, height: h } = gate;
    const bubbleShift = bubble ? BUBBLE_R * 2 + BUBBLE_GAP : 0;
    const flatW = w * 0.5 - bubbleShift * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(flatW, 0);
    ctx.arc(flatW, h / 2, h / 2, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (bubble) this.drawBubble(w - BUBBLE_GAP - BUBBLE_R, h / 2);
    this.labelGate(gate, bubble ? "NAND" : "AND");
  }

  drawOrShape(gate, bubble, xor) {
    const ctx = this.ctx;
    const { width: w, height: h } = gate;
    const bubbleShift = bubble ? BUBBLE_R * 2 + BUBBLE_GAP : 0;
    const tipX = w - bubbleShift;
    const backCurveX = xor ? 10 : 0;

    const drawBody = (offsetX) => {
      ctx.beginPath();
      ctx.moveTo(offsetX, 0);
      ctx.quadraticCurveTo(offsetX + w * 0.35, 0, tipX, h / 2);
      ctx.quadraticCurveTo(offsetX + w * 0.35, h, offsetX, h);
      ctx.quadraticCurveTo(offsetX + 14, h / 2, offsetX, 0);
      ctx.closePath();
    };
    if (xor) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(14, h / 2, 0, h);
      ctx.stroke();
    }
    drawBody(backCurveX);
    ctx.fill(); ctx.stroke();
    if (bubble) this.drawBubble(w - BUBBLE_GAP - BUBBLE_R, h / 2);
    let label = "OR";
    if (bubble && xor) label = "XNOR"; else if (bubble) label = "NOR"; else if (xor) label = "XOR";
    this.labelGate(gate, label);
  }

  drawBubble(cx, cy) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(cx, cy, BUBBLE_R, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }

  drawBulb(gate) {
    const ctx = this.ctx;
    const { width: w, height: h } = gate;
    const r = h * 0.42;
    const cx = r + 2, cy = h / 2;
    const on = !!gate.inputValues[0];

    if (on) { ctx.save(); ctx.shadowColor = "#f59e0b"; ctx.shadowBlur = 8; }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = on ? "#fbbf24" : "#f8fafc";
    ctx.fill();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (on) ctx.restore();

    ctx.strokeStyle = on ? "#b45309" : "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.35, cy + r * 0.3);
    ctx.lineTo(cx - r * 0.1, cy - r * 0.3);
    ctx.lineTo(cx + r * 0.15, cy + r * 0.1);
    ctx.lineTo(cx + r * 0.35, cy - r * 0.3);
    ctx.stroke();

    const baseX = cx + r * 0.6;
    const baseW = Math.max(4, w - baseX);
    ctx.fillStyle = "#94a3b8";
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1;
    ctx.fillRect(baseX, cy - r * 0.5, baseW, r);
    ctx.strokeRect(baseX, cy - r * 0.5, baseW, r);
    for (let i = 1; i < 3; i++) {
      const lx = baseX + (baseW * i) / 3;
      ctx.beginPath();
      ctx.moveTo(lx, cy - r * 0.5);
      ctx.lineTo(lx, cy + r * 0.5);
      ctx.stroke();
    }
  }

  labelGate(gate, text) {
    if (this.noLabel) return;
    const ctx = this.ctx;
    ctx.fillStyle = "#334155";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, gate.width / 2 + 4, gate.height / 2);
  }
}

// 팔레트에 쓸 작은 게이트 아이콘을 오프스크린 캔버스에 그려 반환한다.
export function renderGateIcon(type) {
  const w = 30, h = 20;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const renderer = new Renderer(canvas, { icRegistry: null });
  renderer.noLabel = true;
  const ctx = renderer.ctx;

  if (type === "IC") {
    ctx.strokeStyle = "#334155";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.rect(6, 3, w - 12, h - 6);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, h / 2); ctx.lineTo(6, h / 2);
    ctx.moveTo(w - 6, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();
    return canvas;
  }

  const fakeGate = { type, x: 0, y: 0, width: w - 6, height: h - 4, on: false, inputValues: [0], outputValues: [0] };
  ctx.save();
  ctx.translate(3, 2);
  ctx.strokeStyle = "#334155";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 1.3;
  const draw = renderer.shapeDrawers[type] || renderer.shapeDrawers.DEFAULT;
  draw.call(renderer, fakeGate);
  ctx.restore();
  return canvas;
}
