const MAX_HISTORY = 100;

// 스냅샷 기반 undo/redo. 회로 규모가 작아(수십~수백 게이트) 매번 전체를
// 직렬화해도 성능 문제가 없고, 구현이 훨씬 단순해진다.
export class History {
  constructor(getState, setState) {
    this.getState = getState;
    this.setState = setState;
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
  }

  // begin()은 변경 "직전" 상태를 찍어 두고, end()가 그 스냅샷을 undo
  // 스택에 확정한다. 드래그처럼 여러 프레임에 걸친 변경도 제스처당
  // 하나의 undo 항목으로 묶기 위해 두 단계로 나눴다.
  begin() {
    this.pending = this.getState();
  }

  end() {
    if (this.pending === null) return;
    this.undoStack.push(this.pending);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack.length = 0;
    this.pending = null;
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(this.getState());
    this.setState(this.undoStack.pop());
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(this.getState());
    this.setState(this.redoStack.pop());
    return true;
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
}
