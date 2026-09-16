let nextWireId = 1;
export function resetWireIdCounter(n = 1) { nextWireId = n; }

export class Wire {
  constructor(fromGateId, fromPin, toGateId, toPin, id) {
    this.id = id ?? nextWireId++;
    if (this.id >= nextWireId) nextWireId = this.id + 1;
    this.fromGateId = fromGateId;
    this.fromPin = fromPin;
    this.toGateId = toGateId;
    this.toPin = toPin;
  }

  toJSON() {
    return { id: this.id, fromGateId: this.fromGateId, fromPin: this.fromPin, toGateId: this.toGateId, toPin: this.toPin };
  }

  static fromJSON(data) {
    return new Wire(data.fromGateId, data.fromPin, data.toGateId, data.toPin, data.id);
  }
}
