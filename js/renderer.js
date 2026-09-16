// 표준 IEEE/ANSI 논리 게이트 기호를 캔버스에 그린다.
const GRID_SIZE = 20;

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
    this.drawGrid(cssW, cssH);

    const { circuit, icRegistry, selection, wireDraft, rubberBand } = this.world;

    for (const wire of circuit.wires.values()) this.drawWire(wire, circuit);
    if (wireDraft) this.drawWireDraft(wireDraft);
    for (const gate of circuit.gates.values()) {
      this.drawGate(gate, icRegistry, selection.has(gate.id));
    }
    if (rubberBand) this.drawRubberBand(rubberBand);
  }

  drawGrid(w, h) {
    const ctx = this.ctx;
    ctx.strokeStyle = "#e2e6ec";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += GRID_SIZE) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (let y = 0; y < h; y += GRID_SIZE) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();
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
      OUTPUT: function (gate) {
        const ctx = this.ctx;
        const cx = gate.width / 2, cy = gate.height / 2, r = gate.height / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = gate.inputValues[0] ? "#fde68a" : "#ffffff";
        ctx.fill(); ctx.stroke();
      },
      NOT: function (gate) {
        const ctx = this.ctx;
        const { width: w, height: h } = gate;
        const bubbleR = 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w - bubbleR * 2, h / 2);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.arc(w - bubbleR, h / 2, bubbleR, 0, Math.PI * 2);
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
    const bubbleR = 4;
    const flatW = w * 0.5 - (bubble ? bubbleR : 0);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(flatW, 0);
    ctx.arc(flatW, h / 2, h / 2, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (bubble) {
      ctx.beginPath();
      ctx.arc(w - bubbleR, h / 2, bubbleR, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    this.labelGate(gate, bubble ? "NAND" : "AND");
  }

  drawOrShape(gate, bubble, xor) {
    const ctx = this.ctx;
    const { width: w, height: h } = gate;
    const bubbleR = 4;
    const tipX = w - (bubble ? bubbleR * 2 : 0);
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
    if (bubble) {
      ctx.beginPath();
      ctx.arc(w - bubbleR, h / 2, bubbleR, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    let label = "OR";
    if (bubble && xor) label = "XNOR"; else if (bubble) label = "NOR"; else if (xor) label = "XOR";
    this.labelGate(gate, label);
  }

  labelGate(gate, text) {
    const ctx = this.ctx;
    ctx.fillStyle = "#334155";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, gate.width / 2 + 4, gate.height / 2);
  }
}
