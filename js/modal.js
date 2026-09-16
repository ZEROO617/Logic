// 브라우저 기본 prompt() 대신 화면 중앙에 앱 디자인과 맞는 입력 모달을 띄운다.
export function showPrompt({ title, placeholder = "", defaultValue = "" } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const box = document.createElement("div");
    box.className = "modal-box";

    const titleEl = document.createElement("div");
    titleEl.className = "modal-title";
    titleEl.textContent = title;

    const input = document.createElement("input");
    input.className = "modal-input";
    input.type = "text";
    input.placeholder = placeholder;
    input.value = defaultValue;

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "취소";

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "primary";
    okBtn.textContent = "확인";

    actions.append(cancelBtn, okBtn);
    box.append(titleEl, input, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    input.focus();
    input.select();

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    okBtn.addEventListener("click", () => close(input.value.trim() || null));
    cancelBtn.addEventListener("click", () => close(null));
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(null); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") close(input.value.trim() || null);
      if (e.key === "Escape") close(null);
    });
  });
}
