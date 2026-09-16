import { Circuit } from "./circuit.js";
import { Gate } from "./gates.js";
import { Wire } from "./wire.js";

let nextIcId = 1;

// 선택된 게이트 묶음을 재사용 가능한 IC(서브서킷)로 저장한다.
// 내부에 INPUT/OUTPUT 게이트를 그대로 포함한 독립된 Circuit을 두고,
// 실행 시 외부 입력값을 내부 INPUT에 흘려보낸 뒤 내부 OUTPUT 값을 읽어온다.
export class ICDefinition {
  constructor(name, gatesData, wiresData, id) {
    this.id = id ?? nextIcId++;
    if (this.id >= nextIcId) nextIcId = this.id + 1;
    this.name = name;
    this.gatesData = gatesData; // JSON 형태 스냅샷
    this.wiresData = wiresData;
    this.inner = new Circuit(null);
    this.inner.loadJSON({ gates: gatesData, wires: wiresData });

    this.inputGateIds = [...this.inner.gates.values()]
      .filter(g => g.type === "INPUT").sort((a, b) => a.y - b.y).map(g => g.id);
    this.outputGateIds = [...this.inner.gates.values()]
      .filter(g => g.type === "OUTPUT").sort((a, b) => a.y - b.y).map(g => g.id);
  }

  get numInputs() { return this.inputGateIds.length; }
  get numOutputs() { return this.outputGateIds.length; }

  asGateDef() {
    const pins = Math.max(this.numInputs, this.numOutputs, 1);
    return {
      label: this.name,
      numInputs: this.numInputs,
      numOutputs: this.numOutputs,
      width: 90,
      height: Math.max(50, pins * 24),
    };
  }

  run(inputValues) {
    this.inputGateIds.forEach((gateId, i) => {
      this.inner.gates.get(gateId).on = !!inputValues[i];
    });
    this.inner.simulate();
    return this.outputGateIds.map(gateId => this.inner.gates.get(gateId).inputValues[0] ?? 0);
  }

  toJSON() {
    return { id: this.id, name: this.name, gates: this.gatesData, wires: this.wiresData };
  }

  static fromJSON(data) {
    return new ICDefinition(data.name, data.gates, data.wires, data.id);
  }
}

export class ICRegistry {
  constructor() { this.defs = new Map(); }
  add(def) { this.defs.set(def.id, def); return def; }
  get(id) { return this.defs.get(id); }
  remove(id) { this.defs.delete(id); }
  clear() { this.defs.clear(); }
  values() { return this.defs.values(); }

  toJSON() { return [...this.defs.values()].map(d => d.toJSON()); }
  loadJSON(data) {
    this.clear();
    for (const d of data) this.add(ICDefinition.fromJSON(d));
    const maxId = Math.max(0, ...data.map(d => d.id));
    if (maxId >= nextIcId) nextIcId = maxId + 1;
  }
}

export function createICFromSelection(name, gates, wires) {
  const gateIds = new Set(gates.map(g => g.id));
  const innerWires = wires.filter(w => gateIds.has(w.fromGateId) && gateIds.has(w.toGateId));
  const minX = Math.min(...gates.map(g => g.x));
  const minY = Math.min(...gates.map(g => g.y));
  const gatesData = gates.map(g => {
    const json = g.toJSON();
    json.x = g.x - minX + 20;
    json.y = g.y - minY + 20;
    return json;
  });
  return new ICDefinition(name, gatesData, innerWires.map(w => w.toJSON()));
}
