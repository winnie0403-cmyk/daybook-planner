const DRAG_THRESHOLD = 5;

export function createDragController({ root, canDrop, onDrop }) {
  let drag = null;

  function cleanup({ restoreSource = true } = {}) {
    if (!drag) {
      return;
    }

    drag.ghost?.remove();
    drag.placeholder?.remove();

    if (restoreSource && drag.sourceRow?.isConnected) {
      drag.sourceRow.classList.remove("is-drag-source");
    }

    document.body.classList.remove("is-dragging");
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);
    drag = null;
  }

  function activateDrag(event) {
    const sourceRect = drag.sourceRow.getBoundingClientRect();
    const placeholder = document.createElement("li");
    placeholder.className = "drag-placeholder";
    placeholder.style.height = `${sourceRect.height}px`;
    drag.sourceRow.after(placeholder);
    drag.sourceRow.classList.add("is-drag-source");

    const ghost = drag.sourceRow.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.classList.remove("is-drag-source", "is-holding");
    ghost.style.width = `${sourceRect.width}px`;
    ghost.style.transform = `translate3d(${sourceRect.left}px, ${sourceRect.top}px, 0)`;
    document.body.append(ghost);

    drag.active = true;
    drag.placeholder = placeholder;
    drag.ghost = ghost;
    drag.offsetX = drag.startX - sourceRect.left;
    drag.offsetY = drag.startY - sourceRect.top;
    document.body.classList.add("is-dragging");
    moveGhost(event.clientX, event.clientY);
  }

  function moveGhost(clientX, clientY) {
    if (!drag?.ghost) {
      return;
    }

    const left = clientX - drag.offsetX;
    const top = clientY - drag.offsetY;
    drag.ghost.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  function getValidDropList(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    const list = element?.closest("[data-drop-zone]");

    if (!list || !canDrop({ taskId: drag.taskId, destination: list.dataset.dropZone })) {
      return null;
    }

    return list;
  }

  function placeIndicator(list, clientY) {
    const rows = [...list.querySelectorAll(".task-row:not(.is-drag-source)")];
    const nextRow = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });

    if (nextRow) {
      list.insertBefore(drag.placeholder, nextRow);
    } else {
      list.append(drag.placeholder);
    }
  }

  function autoScroll(clientY) {
    const edgeSize = 72;

    if (clientY < edgeSize) {
      window.scrollBy({ top: -12, behavior: "auto" });
    } else if (clientY > window.innerHeight - edgeSize) {
      window.scrollBy({ top: 12, behavior: "auto" });
    }
  }

  function handlePointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    if (!drag.active) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);

      if (distance < DRAG_THRESHOLD) {
        return;
      }

      activateDrag(event);
    }

    event.preventDefault();
    moveGhost(event.clientX, event.clientY);
    autoScroll(event.clientY);

    const list = getValidDropList(event.clientX, event.clientY);

    if (list) {
      placeIndicator(list, event.clientY);
    }
  }

  function finishDrop() {
    const list = drag.placeholder.parentElement;
    const destination = list?.dataset.dropZone;

    if (!destination) {
      return;
    }

    const rowsBefore = [...list.children].filter(
      (child) =>
        child !== drag.placeholder &&
        child.classList.contains("task-row") &&
        !child.classList.contains("is-drag-source"),
    );
    const placeholderPosition = [...list.children].indexOf(drag.placeholder);
    const targetIndex = rowsBefore.filter(
      (row) => [...list.children].indexOf(row) < placeholderPosition,
    ).length;

    onDrop({
      taskId: drag.taskId,
      destination,
      targetIndex,
    });
  }

  function handlePointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    if (drag.active) {
      finishDrop();
    }

    cleanup();
  }

  function handlePointerCancel(event) {
    if (drag && event.pointerId === drag.pointerId) {
      cleanup();
    }
  }

  function handlePointerDown(event) {
    if (event.button !== 0 || drag) {
      return;
    }

    const handle = event.target.closest("[data-drag-handle]");
    const sourceRow = handle?.closest("[data-task-id]");

    if (!handle || !sourceRow) {
      return;
    }

    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      taskId: sourceRow.dataset.taskId,
      sourceRow,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      ghost: null,
      placeholder: null,
      offsetX: 0,
      offsetY: 0,
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  }

  root.addEventListener("pointerdown", handlePointerDown);

  return {
    destroy() {
      cleanup();
      root.removeEventListener("pointerdown", handlePointerDown);
    },
  };
}
