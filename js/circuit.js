import { Gate } from "./gates.js";
import { Wire } from "./wire.js";

const MAX_RELAX_ITERATIONS = 64;

// 게이트/와이어 그래프를 보관하고 값을 전파하는 회로 모델.
// 위상 정렬 대신 반복 완화(iterative relaxation) 방식을 써서
// 래치처럼 되먹임(feedback)이 있는 회로도 안정 상태로 수렴시킨다.
export class Circuit {
  constructor(icRegistry) {
    this.gates = new Map();
    this.wires = new Map();
    this.icRegistry = icRegistry;
  }

  addGate(gate) {
    this.gates.set(gate.id, gate);
    return gate;
  }

  removeGate(gateId) {
    this.gates.delete(gateId);
    for (const wire of [...this.wires.values()]) {
      if (wire.fromGateId === gateId || wire.toGateId === gateId) {
        this.wires.delete(wire.id);
      }
    }
  }

  addWire(wire) {
    for (const existing of this.wires.values()) {
      if (existing.toGateId === wire.toGateId && existing.toPin === wire.toPin) {
        this.wires.delete(existing.id); // 입력 핀 하나엔 와이어 하나만 허용
      }
    }
    this.wires.set(wire.id, wire);
    return wire;
  }

  removeWire(wireId) {
    this.wires.delete(wireId);
  }

  wiresInto(gateId, pinIndex) {
    for (const w of this.wires.values()) {
      if (w.toGateId === gateId && w.toPin === pinIndex) return w;
    }
    return null;
  }

  clear() {
    this.gates.clear();
    this.wires.clear();
  }

  simulate() {
    let stable = false;
    for (let i = 0; i < MAX_RELAX_ITERATIONS && !stable; i++) {
      stable = true;
      for (const gate of this.gates.values()) {
        for (let p = 0; p < gate.numInputs; p++) {
          const wire = this.wiresInto(gate.id, p);
          const value = wire ? this.pinOutputValue(wire.fromGateId, wire.fromPin) : 0;
          if (gate.inputValues[p] !== value) {
            gate.inputValues[p] = value;
            stable = false;
          }
        }
      }
      for (const gate of this.gates.values()) {
        const before = gate.outputValues.slice();
        gate.evaluate(this.icRegistry);
        if (!arraysEqual(before, gate.outputValues)) stable = false;
      }
    }
  }

  pinOutputValue(gateId, pinIndex) {
    const gate = this.gates.get(gateId);
    return gate ? (gate.outputValues[pinIndex] ?? 0) : 0;
  }

  toJSON() {
    return {
      gates: [...this.gates.values()].map(g => g.toJSON()),
      wires: [...this.wires.values()].map(w => w.toJSON()),
    };
  }

  loadJSON(data) {
    this.clear();
    for (const g of data.gates) this.addGate(Gate.fromJSON(g));
    for (const w of data.wires) this.addWire(Wire.fromJSON(w));
  }
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
