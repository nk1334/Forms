import { Component, EventEmitter, Input, Output } from '@angular/core';

type Dir = 'n'|'s'|'e'|'w'|'nw'|'ne'|'sw'|'se';

@Component({
  selector: 'gform-data-grid',
  templateUrl: './data-grid.component.html',
  styleUrls: ['./data-grid.component.scss']
})
export class DataGridComponent {
  @Input() field: any;                         // expects: field.grid = { rows, cols, headers[], cells[][] }
  @Output() valueChange = new EventEmitter<any>();

  // ---- lifecycle helpers ----------------------------------------------------

  /** Ensure the grid object exists and is internally consistent */
  private ensureGrid() {
    if (!this.field) this.field = {};
    if (!this.field.grid) this.field.grid = { rows: 0, cols: 0, headers: [], cells: [] };

    // defaults for size (inner shell size specifically for this component)
    if (this.field._gridW == null) this.field._gridW = this.field.width ?? 520;
    if (this.field._gridH == null) this.field._gridH = this.field.height ?? 240;

    // coerce rows/cols
    const r = Math.max(0, Number(this.field.grid.rows ?? 0));
    const c = Math.max(0, Number(this.field.grid.cols ?? 0));
    this.field.grid.rows = r;
    this.field.grid.cols = c;

    // headers length = cols
    if (!Array.isArray(this.field.grid.headers)) this.field.grid.headers = [];
    while (this.field.grid.headers.length < c) this.field.grid.headers.push(`Col ${this.field.grid.headers.length + 1}`);
    if (this.field.grid.headers.length > c) this.field.grid.headers.length = c;

    // cells matrix r x c
    const cells = Array.from({ length: r }, (_, i) =>
      Array.from({ length: c }, (_, j) => this.field.grid?.cells?.[i]?.[j] ?? '')
    );
    this.field.grid.cells = cells;
  }

  /** Call this whenever you mutate grid so the parent can store it */
  private emit() {
    this.valueChange.emit(this.field.grid);
  }

  // ---- mutate structure -----------------------------------------------------

  addRow() {
    this.ensureGrid();
    this.field.grid.rows += 1;
    const c = this.field.grid.cols;
    this.field.grid.cells.push(new Array(c).fill(''));
    this.emit();
  }

  addCol() {
    this.ensureGrid();
    this.field.grid.cols += 1;
    this.field.grid.headers.push(`Col ${this.field.grid.cols}`);
    this.field.grid.cells.forEach((row: any[]) => row.push(''));
    this.emit();
  }

  deleteRow(i: number) {
    this.ensureGrid();
    if (i < 0 || i >= this.field.grid.rows) return;
    this.field.grid.cells.splice(i, 1);
    this.field.grid.rows = Math.max(0, this.field.grid.rows - 1);
    this.emit();
  }

  deleteCol(i: number) {
    this.ensureGrid();
    if (i < 0 || i >= this.field.grid.cols) return;
    this.field.grid.cells.forEach((row: any[]) => row.splice(i, 1));
    this.field.grid.headers.splice(i, 1);
    this.field.grid.cols = Math.max(0, this.field.grid.cols - 1);
    this.emit();
  }

  onHeaderChange(idx: number, v: string) {
    this.ensureGrid();
    if (idx < 0 || idx >= this.field.grid.cols) return;
    this.field.grid.headers[idx] = v ?? '';
    this.emit();
  }

  onCellChange(r: number, c: number, v: string) {
    this.ensureGrid();
    if (r < 0 || r >= this.field.grid.rows) return;
    if (c < 0 || c >= this.field.grid.cols) return;
    this.field.grid.cells[r][c] = v ?? '';
    this.emit();
  }

  // ---- resize (inner shell, like text-field grips) --------------------------

  startResize(ev: MouseEvent, dir: Dir) {
    this.ensureGrid();
    ev.stopPropagation();
    ev.preventDefault();

    const startX = ev.clientX;
    const startY = ev.clientY;

    const startW = Number(this.field._gridW ?? 520);
    const startH = Number(this.field._gridH ?? 240);
    const minW = 180;
    const minH = 120;

    const move = (me: MouseEvent) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;

      // horizontal
      if (dir === 'e' || dir === 'ne' || dir === 'se') {
        this.field._gridW = Math.max(minW, startW + dx);
      }
      if (dir === 'w' || dir === 'nw' || dir === 'sw') {
        this.field._gridW = Math.max(minW, startW - dx);
      }

      // vertical
      if (dir === 's' || dir === 'se' || dir === 'sw') {
        this.field._gridH = Math.max(minH, startH + dy);
      }
      if (dir === 'n' || dir === 'ne' || dir === 'nw') {
        this.field._gridH = Math.max(minH, startH - dy);
      }
    };

    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      // optional: sync outer field size
      this.field.width  = this.field._gridW;
      this.field.height = this.field._gridH;
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // ---- utils for *ngFor -----------------------------------------------------

  trackByIndex(_i: number) { return _i; }
}