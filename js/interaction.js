import { Gate } from "./gates.js";
import { Wire } from "./wire.js";

const PIN_HIT_R = 8;
const GRID = 10;

function snap(v) { return Math.round(v / GRID) * GRID; }

// 마우스 입력을 회로 상태 변화로 바꾼다. 화면 갱신은 main.js의
// requestAnimationFrame 루프가 매 프레임 알아서 처리하므로 여기서는
// world(circuit/selection/draft)만 직접 조작하면 된다.
// undo 경계는 history.begin()/end()로 명시적으로 감싼다.
export class Interaction {
  constructor(canvas, world, history) {
    this.canvas = canvas;
    this.world = world;
    this.history = history;
    this.mode = null; // 'drag-gates' | 'draw-wire' | 'rubber-band'
    this.bind();
  }

  bind() {
    const c = this.canvas;
    c.addEventListener("mousedown", (e) => this.onMouseDown(e));
    window.addEventListener("mousemove", (e) => this.onMouseMove(e));
    window.addEventListener("mouseup", (e) => this.onMouseUp(e));
    c.addEventListener("dblclick", (e) => this.onDoubleClick(e));
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("dragover", (e) => e.preventDefault());
    c.addEventListener("drop", (e) => this.onDrop(e));
  }

  localPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  findPinAt(pos) {
    const { circuit, icRegistry } = this.world;
    for (const gate of circuit.gates.values()) {
      for (let i = 0; i < gate.numInputs; i++) {
        const p = gate.inputPinPos(i, icRegistry);
        if (dist(p, pos) <= PIN_HIT_R) return { gate, kind: "in", index: i };
      }
      const numOut = gate.numOutputsOf(gate.getDef(icRegistry));
      for (let i = 0; i < numOut; i++) {
        const p = gate.outputPinPos(i, icRegistry);
        if (dist(p, pos) <= PIN_HIT_R) return { gate, kind: "out", index: i };
      }
    }
    return null;
  }

  findGateAt(pos) {
    const gates = [...this.world.circuit.gates.values()];
    for (let i = gates.length - 1; i >= 0; i--) {
      if (gates[i].containsPoint(pos.x, pos.y)) return gates[i];
    }
    return null;
  }

  findWireAt(pos) {
    const { circuit, icRegistry } = this.world;
    for (const wire of circuit.wires.values()) {
      const from = circuit.gates.get(wire.fromGateId);
      const to = circuit.gates.get(wire.toGateId);
      if (!from || !to) continue;
      const p1 = from.outputPinPos(wire.fromPin, icRegistry);
      const p2 = to.inputPinPos(wire.toPin, icRegistry);
      if (distToSegment(pos, p1, p2) <= 6) return wire;
    }
    return null;
  }

  onMouseDown(e) {
    const pos = this.localPos(e);
    const { selection } = this.world;

    const pin = this.findPinAt(pos);
    if (pin && pin.kind === "out") {
      this.mode = "draw-wire";
      this.wireDraft = { fromGate: pin.gate, fromPin: pin.index };
      this.world.wireDraft = { from: pin.gate.outputPinPos(pin.index, this.world.icRegistry), to: pos };
      this.history.begin();
      return;
    }
    if (pin && pin.kind === "in") {
      const existing = this.world.circuit.wiresInto(pin.gate.id, pin.index);
      if (existing) {
        this.history.begin();
        const fromGate = this.world.circuit.gates.get(existing.fromGateId);
        this.world.circuit.removeWire(existing.id);
        this.mode = "draw-wire";
        this.wireDraft = { fromGate, fromPin: existing.fromPin };
        this.world.wireDraft = { from: fromGate.outputPinPos(existing.fromPin, this.world.icRegistry), to: pos };
        this.pendingRedirect = true;
        return;
      }
    }

    const gate = this.findGateAt(pos);
    if (gate) {
      if (!selection.has(gate.id) && !e.shiftKey) selection.clear();
      selection.add(gate.id);
      this.mode = "drag-gates";
      this.dragStart = pos;
      this.dragOrigins = new Map([...selection].map(id => {
        const g = this.world.circuit.gates.get(id);
        return [id, { x: g.x, y: g.y }];
      }));
      this.moved = false;
      this.mouseDownGate = gate;
      this.mouseDownShift = e.shiftKey;
      this.history.begin();
      return;
    }

    const wire = this.findWireAt(pos);
    if (wire) {
      this.history.begin();
      this.world.circuit.removeWire(wire.id);
      this.history.end();
      return;
    }

    if (!e.shiftKey) selection.clear();
    this.mode = "rubber-band";
    this.world.rubberBand = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
  }

  onMouseMove(e) {
    if (!this.mode) return;
    const pos = this.localPos(e);

    if (this.mode === "draw-wire") {
      this.world.wireDraft.to = pos;
    } else if (this.mode === "drag-gates") {
      const dx = pos.x - this.dragStart.x, dy = pos.y - this.dragStart.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.moved = true;
      for (const [id, origin] of this.dragOrigins) {
        const g = this.world.circuit.gates.get(id);
        g.x = snap(origin.x + dx);
        g.y = snap(origin.y + dy);
      }
    } else if (this.mode === "rubber-band") {
      this.world.rubberBand.x2 = pos.x;
      this.world.rubberBand.y2 = pos.y;
      this.selectInRubberBand();
    }
  }

  onMouseUp(e) {
    if (this.mode === "draw-wire") {
      const pos = this.localPos(e);
      const pin = this.findPinAt(pos);
      let connected = false;
      if (pin && pin.kind === "in" && pin.gate.id !== this.wireDraft.fromGate.id) {
        this.world.circuit.addWire(new Wire(this.wireDraft.fromGate.id, this.wireDraft.fromPin, pin.gate.id, pin.index));
        connected = true;
      }
      if (connected || this.pendingRedirect) this.history.end();
      this.pendingRedirect = false;
      this.world.wireDraft = null;
    } else if (this.mode === "drag-gates") {
      if (this.moved) {
        this.history.end();
      } else if (this.mouseDownGate.type === "INPUT" && !this.mouseDownShift) {
        this.mouseDownGate.on = !this.mouseDownGate.on;
        this.history.end();
      }
    } else if (this.mode === "rubber-band") {
      this.world.rubberBand = null;
    }
    this.mode = null;
  }

  selectInRubberBand() {
    const b = this.world.rubberBand;
    const x = Math.min(b.x1, b.x2), y = Math.min(b.y1, b.y2);
    const w = Math.abs(b.x2 - b.x1), h = Math.abs(b.y2 - b.y1);
    for (const gate of this.world.circuit.gates.values()) {
      const overlaps = gate.x < x + w && gate.x + gate.width > x && gate.y < y + h && gate.y + gate.height > y;
      if (overlaps) this.world.selection.add(gate.id);
    }
  }

  onDoubleClick(e) {
    const pos = this.localPos(e);
    const gate = this.findGateAt(pos);
    if (gate && gate.canResize()) {
      this.history.begin();
      const delta = e.altKey ? -1 : 1;
      if (gate.setNumInputs(gate.numInputs + delta)) this.history.end();
    }
  }

  onDrop(e) {
    e.preventDefault();
    const type = e.dataTransfer.getData("text/gate-type");
    if (!type) return;
    const pos = this.localPos(e);
    this.history.begin();
    const gate = new Gate(type, snap(pos.x - 30), snap(pos.y - 20));
    this.world.circuit.addGate(gate);
    this.world.selection.clear();
    this.world.selection.add(gate.id);
    this.history.end();
  }

  deleteSelected() {
    const { circuit, selection } = this.world;
    if (selection.size === 0) return false;
    this.history.begin();
    for (const id of selection) circuit.removeGate(id);
    selection.clear();
    this.history.end();
    return true;
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function distToSegment(p, a, b) {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}
