// VidNotes dialog focus cycling — the Tab / Shift+Tab loop of the APG Dialog
// (Modal) pattern: "Tab: Moves focus to the next focusable element inside the
// dialog. If focus is on the last tabbable element inside the dialog, moves
// focus to the first tabbable element inside the dialog." (Shift+Tab is its
// reverse; a modal dialog "does not provide means for moving keyboard focus
// outside the dialog window without closing the dialog".)
//
// Single responsibility: the overlay focus-trap STACK. The two body-level
// overlays — the doc modal (library.js) and the lightbox (evidence.js), which
// stacks ON TOP of the modal — push/release through this one module, so the
// single document-level keydown interceptor always serves the TOP of the
// stack: while a lightbox is open over the modal, Tab cycles inside the
// lightbox; closing the lightbox restores the modal's cycle. The interceptor
// is registered when the stack first becomes non-empty and REMOVED when the
// last trap is released, so no global keydown listener remains while no
// overlay is open.
//
// Minimal by design: only the boundaries are intercepted — forward from the
// last focusable descendant (or from focus outside the container) wraps to the
// first; backward from the first (or from outside) wraps to the last. Middle
// elements keep the browser's natural Tab sequence (the iteration-3 contract
// "Tab inside the dialog is not hijacked in the middle" keeps its meaning).
// No focusout fallback: the boundary check also covers a focus that has
// already landed outside the container.

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[contenteditable]:not([contenteditable='false'])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const stack = [];
let onTab = null;

function tabCycle(e) {
  if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
  const container = stack[stack.length - 1];
  if (!container || container.classList.contains("hidden")) return;
  const items = [...container.querySelectorAll(FOCUSABLE)];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = container.contains(active);
  if (e.shiftKey ? active === first || !inside : active === last || !inside) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}

export function trapFocus(container) {
  if (!stack.includes(container)) stack.push(container);
  if (!onTab) {
    onTab = tabCycle;
    document.addEventListener("keydown", onTab);
  }
}

export function releaseFocus(container) {
  const i = stack.indexOf(container);
  if (i !== -1) stack.splice(i, 1);
  if (!stack.length && onTab) {
    document.removeEventListener("keydown", onTab);
    onTab = null;
  }
}
