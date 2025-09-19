import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'gform-text-field',
  templateUrl: './text-field.component.html',
  styleUrls: ['./text-field.component.scss'],
})
export class TextFieldComponent {
  @Input() field: any;          // change to your FormField type later if you like
  @Input() fillMode = false;

  @Output() valueChange = new EventEmitter<string>();
  @Output() labelChange = new EventEmitter<string>();
  @Output() deleteField = new EventEmitter<any>();  
  onInput(v: string) {
    if (this.field) this.field.value = v;
    this.valueChange.emit(v);
  }
  onLabelFocus(_ev: FocusEvent) { /* no-op for now */ }

  onLabelKeydown(ev: KeyboardEvent) {
    // Optional nicety: prevent Enter from inserting newlines
    if (ev.key === 'Enter') {
      ev.preventDefault();
      (ev.target as HTMLElement)?.blur();
    }
  }
  onLabelBlur(e: FocusEvent) {
    const t = e.target as HTMLElement;
    const text = (t?.innerText || '').trim();
    if (this.field) this.field.label = text;
    this
    .labelChange.emit(text);
  }
private cursorFor(dir: 'n'|'s'|'e'|'w'|'nw'|'ne'|'sw'|'se') {
  switch (dir) {
    case 'n': case 's': return 'ns-resize';
    case 'e': case 'w': return 'ew-resize';
    case 'nw': case 'se': return 'nwse-resize';
    case 'ne': case 'sw': return 'nesw-resize';
    default: return 'default';
  }
}

startResize(
  ev: MouseEvent,
  dir: 'n'|'s'|'e'|'w'|'nw'|'ne'|'sw'|'se'
) {
  ev.stopPropagation(); ev.preventDefault();

  const f: any = (this as any).field;

  const startX = ev.clientX;
  const startY = ev.clientY;

  const startW  = Number(f?._textW  ?? f?.inputWidth ?? 240);
  const startH  = Number(f?._textH  ?? 36);
  const startML = Number(f?._textML ?? 0);   // left offset (keeps right edge fixed on W-resize)
  const startMT = Number(f?._textMT ?? 0);   // TOP offset  👈 used to move top edge

  const minW = 120, minH = 32;

  const onMove = (me: MouseEvent) => {
    const dx = me.clientX - startX;
    const dy = me.clientY - startY;

    // ---- WIDTH (E/W & corners) ----
    if (dir === 'e' || dir === 'ne' || dir === 'se') {
      f._textW = Math.max(minW, startW + dx);
    }
    if (dir === 'w' || dir === 'nw' || dir === 'sw') {
      // keep RIGHT edge anchored: shrink/grow from left & shift left margin
      const newW = Math.max(minW, startW - dx);
      f._textW  = newW;
      f._textML = startML + dx; // allow negative if you want, remove clamp
    }

    // ---- HEIGHT (S & bottom corners) -> grows downward ----
    if (dir === 's' || dir === 'se' || dir === 'sw') {
      f._textH = Math.max(minH, startH + dy);
    }

    // ---- HEIGHT + TOP (N & top corners) -> grows UPWARD and moves top ----
    if (dir === 'n' || dir === 'ne' || dir === 'nw') {
      // anchor bottom: (top + height) should stay constant
      // newTop = startMT + dy, newH = startH - dy  (drag up => dy<0 => top↑, height↑)
      f._textMT = startMT + dy;                // ❗ no clamp — allow going above current top
      f._textH  = Math.max(minH, startH - dy);
    }

    // Optional: side grips also allow vertical adjust (diagonal feel)
    if (dir === 'e' || dir === 'w') {
      if (dy >= 0) {
        f._textH = Math.max(minH, startH + dy);
      } else {
        f._textMT = startMT + dy;
        f._textH  = Math.max(minH, startH - dy);
      }
    }
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}}