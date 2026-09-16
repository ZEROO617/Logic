import { GATE_DEFS, Gate, resetGateIdCounter } from "./gates.js";
import { Wire, resetWireIdCounter } from "./wire.js";
import { Circuit } from "./circuit.js";
import { ICRegistry, createICFromSelection } from "./ic.js";
import { Renderer, renderGateIcon } from "./renderer.js";
import { Interaction } from "./interaction.js";
import { History } from "./history.js";
import { serializeProject, loadProject, autosave, loadAutosave, downloadProject, readFileAsText } from "./storage.js";

const icRegistry = new ICRegistry();
const circuit = new Circuit(icRegistry);
const world = { circuit, icRegistry, selection: new Set(), wireDraft: null, rubberBand: null };

const canvas = document.getElementById("board");
const renderer = new Renderer(canvas, world);

const history = new History(
  () => serializeProject(circuit, icRegistry),
  (state) => {
    world.selection.clear();
    loadProject(state, circuit, icRegistry);
  },
);

const interaction = new Interaction(canvas, world, history);

buildPalette();
wireToolbar();
resizeCanvas();

if (!loadAutosave(circuit, icRegistry)) seedExample();
refreshIcPalette();

window.addEventListener("resize", resizeCanvas);
requestAnimationFrame(tick);
setInterval(() => autosave(circuit, icRegistry), 5000);

function tick() {
  circuit.simulate();
  updateToolbarState();
  renderer.draw();
  requestAnimationFrame(tick);
}

function resizeCanvas() {
  renderer.resize();
}

function buildPalette() {
  const palette = document.getElementById("palette");
  const title = document.createElement("div");
  title.className = "palette-section-title";
  title.textContent = "게이트";
  palette.appendChild(title);

  for (const type of Object.keys(GATE_DEFS)) {
    palette.appendChild(makePaletteItem(GATE_DEFS[type].label, () => renderGateIcon(type), (e) => {
      e.dataTransfer.setData("text/gate-type", type);
      e.dataTransfer.effectAllowed = "copy";
    }));
  }

  const icTitle = document.createElement("div");
  icTitle.className = "palette-section-title";
  icTitle.textContent = "내 IC";
  icTitle.id = "ic-section-title";
  palette.appendChild(icTitle);

  const icList = document.createElement("div");
  icList.id = "ic-list";
  palette.appendChild(icList);
}

function refreshIcPalette() {
  const icList = document.getElementById("ic-list");
  icList.innerHTML = "";
  for (const def of icRegistry.values()) {
    icList.appendChild(makePaletteItem(def.name, () => renderGateIcon("IC"), (e) => {
      e.dataTransfer.setData("text/gate-type", "IC");
      e.dataTransfer.setData("text/ic-def-id", String(def.id));
      e.dataTransfer.effectAllowed = "copy";
    }));
  }
}

// 팔레트 항목 하나(아이콘 + 이름)를 만들고, 드래그 시작 시 같은 아이콘을
// 커서 밑에 붙는 드래그 이미지로도 사용한다.
function makePaletteItem(label, makeIcon, onDragStart) {
  const item = document.createElement("div");
  item.className = "palette-item";
  item.draggable = true;

  const icon = makeIcon();
  icon.className = "palette-icon";
  item.appendChild(icon);

  const text = document.createElement("span");
  text.textContent = label;
  item.appendChild(text);

  item.addEventListener("dragstart", (e) => {
    e.dataTransfer.setDragImage(makeIcon(), 15, 10);
    onDragStart(e);
  });
  return item;
}

// IC 드롭 시 icDefId를 함께 넘겨야 하므로 Interaction의 onDrop을 감싼다.
const originalOnDrop = interaction.onDrop.bind(interaction);
interaction.onDrop = function (e) {
  const type = e.dataTransfer.getData("text/gate-type");
  if (type === "IC") {
    e.preventDefault();
    const icDefId = Number(e.dataTransfer.getData("text/ic-def-id"));
    const r = canvas.getBoundingClientRect();
    history.begin();
    const gate = new Gate("IC", e.clientX - r.left - 45, e.clientY - r.top - 25, { icDefId, ...icGateSize(icDefId) });
    circuit.addGate(gate);
    world.selection.clear();
    world.selection.add(gate.id);
    history.end();
    return;
  }
  originalOnDrop(e);
};

function icGateSize(icDefId) {
  const def = icRegistry.get(icDefId).asGateDef();
  return { numInputs: def.numInputs, numOutputs: def.numOutputs, width: def.width, height: def.height };
}

function wireToolbar() {
  document.getElementById("btn-undo").addEventListener("click", () => { history.undo(); refreshIcPalette(); });
  document.getElementById("btn-redo").addEventListener("click", () => { history.redo(); refreshIcPalette(); });
  document.getElementById("btn-delete").addEventListener("click", () => interaction.deleteSelected());
  document.getElementById("btn-make-ic").addEventListener("click", makeIC);
  document.getElementById("btn-new").addEventListener("click", () => {
    if (!confirm("현재 회로를 지우고 새로 시작할까요?")) return;
    history.begin();
    circuit.clear();
    world.selection.clear();
    history.end();
  });
  document.getElementById("btn-save").addEventListener("click", () => downloadProject(circuit, icRegistry));
  document.getElementById("input-load").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await readFileAsText(file);
    history.begin();
    loadProject(text, circuit, icRegistry);
    history.end();
    refreshIcPalette();
    e.target.value = "";
  });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if ((e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      interaction.deleteSelected();
    } else if (e.ctrlKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? history.redo() : history.undo();
      refreshIcPalette();
    } else if (e.ctrlKey && e.key.toLowerCase() === "y") {
      e.preventDefault();
      history.redo();
      refreshIcPalette();
    }
  });
}

function updateToolbarState() {
  document.getElementById("btn-undo").disabled = !history.canUndo();
  document.getElementById("btn-redo").disabled = !history.canRedo();
  document.getElementById("btn-delete").disabled = world.selection.size === 0;
  document.getElementById("btn-make-ic").disabled = world.selection.size === 0;
}

function makeIC() {
  const gates = [...world.selection].map(id => circuit.gates.get(id)).filter(Boolean);
  if (gates.length === 0) return;
  const name = prompt("IC 이름을 입력하세요", "MyIC");
  if (!name) return;

  history.begin();
  const def = createICFromSelection(name, gates, [...circuit.wires.values()]);
  icRegistry.add(def);

  const cx = gates.reduce((s, g) => s + g.x, 0) / gates.length;
  const cy = gates.reduce((s, g) => s + g.y, 0) / gates.length;
  for (const g of gates) circuit.removeGate(g.id);

  const icGate = new Gate("IC", cx, cy, { icDefId: def.id, ...icGateSize(def.id) });
  circuit.addGate(icGate);
  world.selection.clear();
  world.selection.add(icGate.id);
  history.end();
  refreshIcPalette();
}

function seedExample() {
  resetGateIdCounter(1);
  resetWireIdCounter(1);
  const a = new Gate("INPUT", 60, 80, { on: true });
  const b = new Gate("INPUT", 60, 160);
  const and = new Gate("AND", 220, 100);
  const out = new Gate("OUTPUT", 380, 115);
  circuit.addGate(a); circuit.addGate(b); circuit.addGate(and); circuit.addGate(out);
  circuit.addWire(new Wire(a.id, 0, and.id, 0));
  circuit.addWire(new Wire(b.id, 0, and.id, 1));
  circuit.addWire(new Wire(and.id, 0, out.id, 0));
}
