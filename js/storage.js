const AUTOSAVE_KEY = "logic.autosave.v1";

export function serializeProject(circuit, icRegistry) {
  return JSON.stringify({ version: 1, circuit: circuit.toJSON(), ics: icRegistry.toJSON() }, null, 2);
}

export function loadProject(json, circuit, icRegistry) {
  const data = JSON.parse(json);
  icRegistry.loadJSON(data.ics ?? []);
  circuit.loadJSON(data.circuit);
}

export function autosave(circuit, icRegistry) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeProject(circuit, icRegistry));
  } catch { /* 저장 공간 부족 등은 무시 */ }
}

export function loadAutosave(circuit, icRegistry) {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) return false;
  try {
    loadProject(raw, circuit, icRegistry);
    return true;
  } catch {
    return false;
  }
}

export function downloadProject(circuit, icRegistry, filename = "circuit.json") {
  const blob = new Blob([serializeProject(circuit, icRegistry)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
