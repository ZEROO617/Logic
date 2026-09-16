// 게이트 종류 정의: 입력 개수, 출력 개수, 평가 함수, 그리기용 모양 정보
export const GATE_DEFS = {
  INPUT: {
    label: "입력",
    numInputs: 0,
    numOutputs: 1,
    width: 40, height: 30,
    evaluate: (inputs, state) => [state.on ? 1 : 0],
  },
  OUTPUT: {
    label: "출력",
    numInputs: 1,
    numOutputs: 0,
    width: 40, height: 30,
    evaluate: () => [],
  },
  NOT: {
    label: "NOT",
    numInputs: 1,
    numOutputs: 1,
    width: 60, height: 40,
    evaluate: (inputs) => [inputs[0] ? 0 : 1],
  },
  AND: {
    label: "AND",
    numInputs: 2,
    numOutputs: 1,
    width: 60, height: 50,
    evaluate: (inputs) => [inputs.every(v => v === 1) ? 1 : 0],
  },
  OR: {
    label: "OR",
    numInputs: 2,
    numOutputs: 1,
    width: 60, height: 50,
    evaluate: (inputs) => [inputs.some(v => v === 1) ? 1 : 0],
  },
  NAND: {
    label: "NAND",
    numInputs: 2,
    numOutputs: 1,
    width: 60, height: 50,
    evaluate: (inputs) => [inputs.every(v => v === 1) ? 0 : 1],
  },
  NOR: {
    label: "NOR",
    numInputs: 2,
    numOutputs: 1,
    width: 60, height: 50,
    evaluate: (inputs) => [inputs.some(v => v === 1) ? 0 : 1],
  },
  XOR: {
    label: "XOR",
    numInputs: 2,
    numOutputs: 1,
    width: 60, height: 50,
    evaluate: (inputs) => [inputs.filter(v => v === 1).length % 2 === 1 ? 1 : 0],
  },
  XNOR: {
    label: "XNOR",
    numInputs: 2,
    numOutputs: 1,
    width: 60, height: 50,
    evaluate: (inputs) => [inputs.filter(v => v === 1).length % 2 === 1 ? 0 : 1],
  },
};

export const MIN_VARIADIC_INPUTS = 2;
export const MAX_VARIADIC_INPUTS = 8;
export const VARIADIC_TYPES = new Set(["AND", "OR", "NAND", "NOR", "XOR", "XNOR"]);

let nextGateId = 1;
export function resetGateIdCounter(n = 1) { nextGateId = n; }

export class Gate {
  constructor(type, x, y, opts = {}) {
    this.id = opts.id ?? nextGateId++;
    if (this.id >= nextGateId) nextGateId = this.id + 1;
    this.type = type;
    this.x = x;
    this.y = y;
    this.icDefId = opts.icDefId ?? null;
    this.on = opts.on ?? false; // INPUT 게이트 전용 상태

    // IC는 실제 모양(입출력 개수, 크기)이 icRegistry에 등록된 ICDefinition에
    // 달려 있어 GATE_DEFS만으로는 알 수 없다. 생성 시점엔 항상 opts로
    // 명시적으로 전달받아 registry 없이도 안전하게 만들어지도록 한다.
    if (type === "IC") {
      this.numInputs = opts.numInputs ?? 0;
      this.numOutputs = opts.numOutputs ?? 1;
      this.width = opts.width ?? 90;
      this.height = opts.height ?? 50;
    } else {
      const def = GATE_DEFS[type];
      this.numInputs = opts.numInputs ?? def.numInputs;
      this.numOutputs = def.numOutputs;
      this.width = opts.width ?? def.width;
      this.height = opts.height ?? this.computeHeight(def);
    }
    this.inputValues = new Array(this.numInputs).fill(0);
    this.outputValues = new Array(this.numOutputs).fill(0);
  }

  numOutputsOf(def) {
    return def.numOutputs !== undefined ? def.numOutputs : this.numOutputs;
  }

  computeHeight(def) {
    if (!VARIADIC_TYPES.has(this.type)) return def.height;
    const extra = Math.max(0, this.numInputs - MIN_VARIADIC_INPUTS);
    return def.height + extra * 14;
  }

  getDef(icRegistry) {
    if (this.type === "IC") {
      const icDef = icRegistry && icRegistry.get(this.icDefId);
      return icDef ? icDef.asGateDef() : { label: "IC", numInputs: this.numInputs, numOutputs: this.numOutputs, width: this.width, height: this.height };
    }
    return GATE_DEFS[this.type];
  }

  canResize() {
    return VARIADIC_TYPES.has(this.type);
  }

  // 선택된 가변 입력 게이트 아래에 표시되는 입력 개수 +/- 버튼의 위치.
  resizeButtonRects() {
    const btnSize = 16, gap = 4;
    const totalW = btnSize * 2 + gap;
    const startX = this.x + this.width / 2 - totalW / 2;
    const y = this.y + this.height + 4;
    return {
      minus: { x: startX, y, w: btnSize, h: btnSize },
      plus: { x: startX + btnSize + gap, y, w: btnSize, h: btnSize },
    };
  }

  setNumInputs(n) {
    n = Math.max(MIN_VARIADIC_INPUTS, Math.min(MAX_VARIADIC_INPUTS, n));
    if (n === this.numInputs) return false;
    this.numInputs = n;
    this.inputValues = new Array(n).fill(0);
    this.height = this.computeHeight(this.getDef());
    return true;
  }

  inputPinPos(index, icRegistry) {
    const n = this.type === "IC" ? this.getDef(icRegistry).numInputs : this.numInputs;
    const gap = this.height / (n + 1);
    return { x: this.x, y: this.y + gap * (index + 1) };
  }

  outputPinPos(index, icRegistry) {
    const def = this.getDef(icRegistry);
    const n = this.numOutputsOf(def);
    const gap = this.height / (n + 1);
    return { x: this.x + this.width, y: this.y + gap * (index + 1) };
  }

  evaluate(icRegistry) {
    const def = this.getDef(icRegistry);
    if (this.type === "IC") {
      this.outputValues = icRegistry.get(this.icDefId).run(this.inputValues);
    } else {
      this.outputValues = def.evaluate(this.inputValues, this);
    }
  }

  containsPoint(px, py) {
    return px >= this.x && px <= this.x + this.width && py >= this.y && py <= this.y + this.height;
  }

  toJSON() {
    const json = {
      id: this.id, type: this.type, x: this.x, y: this.y,
      numInputs: this.numInputs, on: this.on, icDefId: this.icDefId,
    };
    if (this.type === "IC") Object.assign(json, { numOutputs: this.numOutputs, width: this.width, height: this.height });
    return json;
  }

  static fromJSON(data) {
    return new Gate(data.type, data.x, data.y, {
      id: data.id, numInputs: data.numInputs, on: data.on, icDefId: data.icDefId,
      numOutputs: data.numOutputs, width: data.width, height: data.height,
    });
  }
}
