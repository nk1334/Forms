import {
  Component,
  ElementRef,
  ViewChildren,
  QueryList,
  AfterViewInit,
  AfterViewChecked,
  OnInit,
  ChangeDetectorRef,
  HostListener
} from '@angular/core';
import {
  CdkDragDrop,
  CdkDragMove,
  CdkDragEnd,
  CdkDragStart,
  moveItemInArray,
  transferArrayItem
} from '@angular/cdk/drag-drop';
import { Router, ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormService } from 'src/app/services/form.service';
import { BRANCHES, Branch } from 'src/app/permissions.model';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from 'src/app/services/auth.service';
import { Input } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';


export type ColumnType = 'text' | 'number' | 'date' | 'select';

function serializeForFirestorePages(pages: any[]): any[] {
  const clone: any[] = JSON.parse(JSON.stringify(pages));
  for (const p of clone) {
    for (const f of p.fields || []) {
      const gm = f.gridMatrix;
      if (gm?.cells && Array.isArray(gm.cells) && Array.isArray(gm.cells[0])) {
        const flat: Array<{ r:number; c:number; cell:any }> = [];
        gm.cells.forEach((row: any[], r: number) =>
          row.forEach((cell: any, c: number) => flat.push({ r, c, cell }))
        );
        gm.cellsFlat = flat;
        delete gm.cells; // ❌ remove nested arrays
      }
    }
  }
  return clone;
}

// 🔹 Helper to rebuild Firestore data → back to 2D cells
function deserializeFromFirestorePages(pages: any[]): any[] {
  for (const p of pages) {
    for (const f of p.fields || []) {
      const gm = f.gridMatrix;
      if (gm?.cellsFlat && Number.isInteger(gm.rows) && Number.isInteger(gm.cols)) {
        const cells = Array.from({ length: gm.rows }, () =>
          Array.from({ length: gm.cols }, () => ({ items: [] }))
        );
        for (const { r, c, cell } of gm.cellsFlat) {
          if (cells[r] && cells[r][c]) cells[r][c] = cell;
        }
        gm.cells = cells;
        delete gm.cellsFlat;
      }
    }
  }
  return pages;
}

export interface DataGridColumn {
  id: string;              // key used in row objects
  label: string;           // column header
  type: ColumnType;
  required?: boolean;
  options?: string[];      // for 'select'
  width?: number;          // optional UI hint
}

export interface DataGridConfig {
  columns: DataGridColumn[];
  addRowText?: string;
  minRows?: number;
  maxRows?: number;
}

export interface FormField {
  id: string;
  label: string;
  type: string;
  placeholder?: string;
  width?: number;
  height?: number;
  _telW?: number;   // input width (px)
  _telH?: number;   // input height (px)
  _telML?: number; 
  options?: { label: string; value?: string; checked?: boolean }[];
  value?: any;
  isDescription?: boolean;
  // OLD meaning (keep only if you still use docked labels somewhere)
  labelDock?: 'top' | 'left' | 'right' | 'bottom';   // 👈 renamed
  role?: 'description' | 'normal';
  // Data grid (unchanged)
  gridConfig?: DataGridConfig;
  rows?: Array<Record<string, any>>;
  _sigW?: number;   // signature inner width (px)
  _sigH?: number;   // signature inner height (px)
  _sigML?: number;
  // outer card position
  position?: { x: number; y: number };
  row?: number;
  col?: number;
  _emailLeft?: number;
  _emailRight?: number;
  _emailH?: number;
  _emailW?: number;
  _emailML?:number;
  _emailShiftX?: number;
    _dateW?: number;
  _dateH?: number;
  _dateML?: number;
    _titleW?: number;
  _titleH?: number;

    _branchW?: number;
  _branchH?: number;
  _branchML?: number;
    _checkW?: number;
  _checkH?: number;
  _checkML?: number;
  nextNo?: number;
  required: boolean;
  layout?: 'row' | 'column';
  problemItems?: { no: number; text: string; _size?: { w: number; h: number } }[];
  // inline layout flags (optional)
  inline?: boolean;
  inputFirst?: boolean;
  labelWidth?: number;
  inputWidth?: number;
  inputSize?: { w: number; h: number };
    gridMatrix?: GridMatrix;     // ⬅️ 2D matrix of cells with items
  gridMode?: 'matrix' | 'rows'; 
  // NEW: inner free-drag positions (used by draggable label/input)
  labelPos?: { x: number; y: number };
  inputPos?: { x: number; y: number };
  tagPos?: { x: number; y: number };
    _textW?: number;  _textH?: number;  _textML?: number;
  _radioW?: number; _radioH?: number; _radioML?: number;
  _fileW?: number;  _fileH?: number;  _fileML?: number;
  arrange?: 'dock' | 'free';
  useTextarea?: boolean;                 // toggle between <input> and <textarea>
  textareaPos?: { x: number; y: number };
  textareaSize?: { w: number; h: number };
  _lockParentDrag?: boolean;
  ui?: {
    inputW?: number;   // px width for the email input
    deleteW?: number;  // px width for the delete button
  };
}


interface FormPage {
  fields: FormField[];
}

interface SavedForm {
  formId: string;
  allowedBranches?: Branch[];
  formName?: string;
  formPages: FormPage[];
  firebaseId?: string;
  _uiSelection?: Branch[];
}
 interface GridItem {
  id: string;
  type: string;
  label: string;
  options?: { label: string; value?: string }[];
  value?: any;

  // NEW:
  pos?: { x: number; y: number };     // position inside the cell (px, relative)
  size?: { w: number; h: number };
}

 interface GridCell {
  items: GridItem[];
}


 interface GridMatrix {
  rows: number;
  cols: number;
  cells: GridCell[][]; // cells[r][c]
    cellsFlat?: Array<{ r: number; c: number; cell: GridCell }>;
  showBorders?: boolean;
    cellW?: number;   // px width per column
  cellH?: number;   // px min-height per cell
  gap?: number;     // px gap between cells
}
type FillLayoutMode = 'exact' | 'flow';
type Dock = 'left' | 'right' | 'top' | 'bottom';
@Component({
  selector: 'app-create-template',
  templateUrl: './create-template.component.html',
  styleUrls: ['./create-template.component.scss']
})

export class CreateTemplateComponent implements OnInit, AfterViewInit, AfterViewChecked {
  displayedColumns: string[] = ['name', 'visibleIn', 'current', 'actions'];
  trackBySavedForm = (_: number, f: any) => f?.id ?? f?.formId ?? f;
    @Input() readonly = false; 
  branches = BRANCHES;              // ['ALL','MKAY','YAT','NSW']
  selectedBranches: Branch[] = ['ALL'];
  @ViewChildren('canvasElement') canvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;
  isRemovingField: boolean = false;
  isDrawingSignature = false;
isFillMode = false;
  ctxMap: Record<string, CanvasRenderingContext2D> = {};
  drawingMap: Record<string, boolean> = {};
  isDragging: boolean[] = [];
isOverAnyGridCell = false;
  lastCanvasCount = 0;
  shouldClearSignatureCanvas = false;
fillLayoutMode: FillLayoutMode = 'exact';
  dashboardVisible = false;
  formBuilderVisible = true;
  fieldConfigVisible = false;
  formListVisible = false;
  popupTop = 0;
  popupLeft = 0;


isBuilderMode = false;

  paletteFields: FormField[] = [
    { id: 'project-title', label: 'Project Name', type: 'project-title', required: false },
    { id: 'id', label: 'ID Field', type: 'id', required: false },

    { id: 'date', label: 'Date Field', type: 'date', required: false },
    { id: 'text', label: 'Text Field', type: 'text', required: false },
    { id: 'number', label: 'Number Field', type: 'number', required: false },
    {
      id: 'email',
      label: 'Email Field',
      type: 'email',
      required: false,
      width: 340,    // outer draggable box width
      height: 64,    // outer draggable box height
      inline: true,          // start inline
      inputFirst: false,     // label on the left by default
      labelWidth: 120,       // px
      inputWidth: 180        // px
    },
    { id: 'branch', label: 'Branch Field', type: 'branch', required: false },
    { id: 'tel', label: 'Phone Field', type: 'tel', required: false },
    { id: 'description', label: 'Description Field', type: 'textarea', required: false, isDescription: true },
    {
      id: 'radio',
      label: 'Radio Field',
      type: 'radio',
      options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
      layout: 'row',
      required: false
    },
    { id: 'file', label: 'Photo', type: 'file', required: false },
    { id: 'empty', label: 'Empty Box', type: 'empty', required: false },
    { id: 'signature', label: 'Signature', type: 'signature', required: false },
    { id: 'submit', label: 'Submit Button', type: 'submit', required: false },
    { id: 'data-grid', label: 'Data Grid', type: 'data-grid', required: false },
    {
      id: 'checkbox', label: 'Checkbox', type: 'checkbox', required: false,
      options: [
        { label: 'Option 1', value: 'opt1', checked: false },
        { label: 'Option 2', value: 'opt2', checked: false }
      ],
      width: 200, height: 44
    },
  ];
commonTypes = new Set(['text','email','number','tel','date','radio','branch','textarea','signature']);
isCommonType(type?: string) { return !!type && this.commonTypes.has(type); }
  newField: FormField = this.getEmptyField();
  pendingFieldToAdd: FormField | null = null;

  formPages: FormPage[] = [{ fields: [] }];
  currentPage = 0;
  savedForms: SavedForm[] = [];
  currentFormId: string | null = null;
  currentBranch: Branch | null = null;
  canManageAllBranches = false;

  freeDragPositions: { [fieldId: string]: { x: number; y: number } } = {};

  private idCounter = 0;

  pointerPosition = { x: 0, y: 0 };
  lastPointer?: { x: number; y: number };
  allowedWidths = [150, 300, 400];
  selectedForm: SavedForm | null = null;
  isEditingMaster = false;
  isClearing = false;
   public dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
   public trackByIndex = (index: number, _item?: any): number => index;
  constructor(

    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private formService: FormService,
    private fb: FormBuilder,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
      this.isBuilderMode = true; 
    // 1) Clean locals first (no UI changes here, just storage hygiene)
    this.cleanupLocalDuplicates();
    // a) get the user branch (prefer service getter if you add one)
    const b = (localStorage.getItem('branch') as Branch | null) ?? null;
    this.currentBranch = (b && ['MACKAY', 'YAT', 'NSW', 'ALL'].includes(b)) ? b as Branch : 'ALL';

    // b) who can manage all branches? (toggle this however you like)
    // Example: only 'crew-leader' can manage all branches
    const role = this.authService.getUserRole();              // 'crew-leader' | 'crew-member' | 'ops'...
    this.canManageAllBranches = role === 'crew-leader';       // tweak to your needs

    // c) force the table to the user's branch (unless manager)
    this.listBranchFilter = this.canManageAllBranches ? (this.currentBranch ?? 'ALL')
      : (this.currentBranch ?? 'ALL');

    // 2) Then handle route + preload list
    this.route.queryParams.subscribe(async params => {
      try {
        const templateId = params['templateId'] as string | undefined;

        // Preload Firebase list so open-by-id works reliably
        this.savedForms = await this.formService.getFormTemplates(); // must include firebaseId=d.id
        this.savedForms = (this.savedForms || []).map(f => ({
          ...f,
          formPages: this.cloneAndRehydrate(f.formPages),
          allowedBranches: this.normalizeBranches(f.allowedBranches),
          _uiSelection: (f.allowedBranches?.length ? [...f.allowedBranches] : (['ALL'] as Branch[]))
        }));

        // If navigated with ?templateId=..., open it if found by formId OR firebaseId
        if (templateId) {
          const found = this.savedForms.find(
            f => f.formId === templateId || (f as any).firebaseId === templateId
          );
          if (found) {
            this.openForm(found);
          } else {
            console.warn('Template not found in Firebase list:', templateId);
          }
        }
      } catch (e) {
        console.error('Init load failed', e);
        this.snackBar.open('Failed to load templates.', 'Close', { duration: 3000 });
      }
    });
  }
  inputId(field: FormField, suffix = ''): string {
    return suffix ? `${field.id}-${suffix}` : field.id;
  }
calendarLocked = true;

onDateFocus(ev: FocusEvent) {
  if (this.calendarLocked) {
    (ev.target as HTMLInputElement).blur();
  }
}
startTelResize(downEvt: MouseEvent | TouchEvent, field: any, dir: 'left'|'right'|'sw'|'se') {
  // prevent text selection / drag interference
  downEvt.stopPropagation();
  downEvt.preventDefault();

  // resolve a pointer
  const startPoint = ('touches' in downEvt && downEvt.touches.length)
    ? downEvt.touches[0]
    : (downEvt as MouseEvent);

  // find the shells to compute real sizes
  const gripEl = downEvt.target as HTMLElement;
  const shellEl = gripEl.closest('.tel-input-shell') as HTMLElement | null;
  const rowEl   = gripEl.closest('.form-row') as HTMLElement | null;

  // fallbacks
  const shellRect = shellEl?.getBoundingClientRect() ?? { width: (field._telW ?? field.inputWidth ?? 220), height: (field._telH ?? 36) } as DOMRect;
  const rowRect   = rowEl?.getBoundingClientRect();

  // starting numbers
  const startX = startPoint.clientX;
  const startY = startPoint.clientY;

  const startW = Number(field._telW ?? Math.round(shellRect.width));
  const startH = Number(field._telH ?? Math.round(shellRect.height));
  const startML = Number(field._telML ?? 0);

  const minW = 80;
  const minH = 28;

  // Optional: cap inner width to outer row width (minus a little padding)
  const outerMaxW = rowRect ? Math.max(minW, Math.floor(rowRect.width - 24)) : Infinity;

  let raf = 0;

  const onMove = (moveEvt: MouseEvent | TouchEvent) => {
    const pt = ('touches' in moveEvt && moveEvt.touches.length)
      ? moveEvt.touches[0]
      : (moveEvt as MouseEvent);

    const dx = pt.clientX - startX;
    const dy = pt.clientY - startY;

    let w = startW;
    let h = startH;
    let ml = startML;

    switch (dir) {
      case 'right':
        w = startW + dx;
        break;
      case 'left':
        w = startW - dx;
        if (field.labelDock === 'left' || field.labelDock === 'right') {
          ml = startML + dx; // shift under/away from label
        }
        break;
      case 'se':
        w = startW + dx;
        h = startH + dy;
        break;
      case 'sw':
        w = startW - dx;
        h = startH + dy;
        if (field.labelDock === 'left' || field.labelDock === 'right') {
          ml = startML + dx;
        }
        break;
    }

    // clamp
    w = Math.max(minW, Math.min(w, outerMaxW));
    h = Math.max(minH, h);
    ml = Math.max(0, ml);

    // schedule DOM/state update
    if (!raf) {
      raf = requestAnimationFrame(() => {
        field._telW = Math.round(w);
        field._telH = Math.round(h);
        field._telML = Math.round(ml);
        raf = 0;
      });
    }
  };

  const end = () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('mousemove', onMove as any, true);
    window.removeEventListener('mouseup', end, true);
    window.removeEventListener('touchmove', onMove as any, { capture: true } as any);
    window.removeEventListener('touchend', end as any, true);
  };

  // listeners
  window.addEventListener('mousemove', onMove as any, true);
  window.addEventListener('mouseup', end, true);
  window.addEventListener('touchmove', onMove as any, { passive: false, capture: true } as any);
  window.addEventListener('touchend', end as any, true);
}
onDateMouseDown(ev: MouseEvent) {
  if (this.calendarLocked) {
    // prevent the native picker from opening
    ev.preventDefault();
  } else {
    // during normal use, don’t start dragging the card
    ev.stopPropagation();
  }
}
getFieldStyle(field: any) {
  const x = Math.max(0, Math.round(field?.position?.x ?? 0));
  const y = Math.max(0, Math.round(field?.position?.y ?? 0));
  const w = Math.max(20, Math.round(field?.width ?? 300));
  const h = Math.max(20, Math.round(field?.height ?? 44));

  return {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
    minHeight: `${h}px`,
    boxSizing: 'border-box',
    transform: 'none',
    display: 'flex',
    gap: `${field?.ui?.gapPx ?? 10}px`,
  };
}

gridItemStyle(it: any, field: FormField): { [k: string]: any } {
  if (this.isFillMode) {
    // Stack nicely while filling
    return {
      position: 'relative',
      left: 'auto',
      top: 'auto',
      width: '100%',
      height: 'auto'
    };
  }

  // Free placement in builder (if you use pos/size)
  const x = it?.pos?.x ?? 6;
  const y = it?.pos?.y ?? 6;
  const w = it?.size?.w ?? 220;
  const h = it?.size?.h ?? 60;
  return {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`
  };
}

  saveTagPos(e: CdkDragEnd, f: FormField) {
    const p = e.source.getFreeDragPosition();
    f.tagPos = { x: p.x, y: p.y };
    this.lockParentDrag(f, false);
  }

  // If your template calls this for the input's drag end
  saveInputPos(e: CdkDragEnd, f: FormField) {
    const p = e.source.getFreeDragPosition();
    f.inputPos = { x: p.x, y: p.y };
    this.lockParentDrag(f, false);
  }
private cloneAndRehydrate(pages: any[] | undefined): any[] {
  const copy = JSON.parse(JSON.stringify(pages || []));
  return deserializeFromFirestorePages(copy);
}
  private _activeInputResize?: {
    field: any;
    startX: number;
    startW: number;
  };
  private captureCurrentLayoutForSave(pages: Array<{ fields: any[] }>) {
  for (const p of (pages || [])) {
    for (const f of (p.fields || [])) {
      f.position ||= { x: 0, y: 0 };
      f.position.x = Math.max(0, Math.round(f.position.x ?? 0));
      f.position.y = Math.max(0, Math.round(f.position.y ?? 0));
      f.width  = Math.max(20, Math.round((f.width  ?? 300) as number));
      f.height = Math.max(20, Math.round((f.height ?? 44)  as number));
    }
  }
  }
  private syncGridPixelsFromWrapper(pages: Array<{ fields: any[] }>) {
  for (const p of (pages || [])) {
    for (const f of (p.fields || [])) {
      const t = String(f?.type || '').toLowerCase();
      if (!/^(data-?grid|grid|matrix|datagrid)$/.test(t)) continue;

      const gm = (f.gridMatrix ||= {});
      gm.gap   = Math.max(0, gm.gap ?? 12);
      gm.cols  = Math.max(1, gm.cols ?? (gm?.cells?.[0]?.length || 1));
      gm.rows  = Math.max(1, gm.rows ?? (gm?.cells?.length || 1));
      gm.cellW = this.gridCellWFromWrapper(f);
      gm.cellH = this.gridCellHFromWrapper(f);
    }
  }
}
  
  startInputResize(ev: MouseEvent, field: any) {
    ev.stopPropagation(); ev.preventDefault();
    this._activeInputResize = {
      field,
      startX: ev.clientX,
      startW: Number(field.inputWidth || 220)
    };

    const move = (e: MouseEvent) => {
      if (!this._activeInputResize) return;
      const dx = e.clientX - this._activeInputResize.startX;
      // clamp width
      const min = 120, max = 600;   // tweak as you like
      const next = Math.max(min, Math.min(max, this._activeInputResize.startW + dx));
      this._activeInputResize.field.inputWidth = next;
    };

    const up = () => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      this._activeInputResize = undefined;
    };

    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
  }
  private _activeDeleteResize?: {
    field: any;
    startX: number;
    startW: number;
  };

  startDeleteResize(ev: MouseEvent, field: any) {
    ev.stopPropagation(); ev.preventDefault();
    this._activeDeleteResize = {
      field,
      startX: ev.clientX,
      startW: Number(field.deleteWidth || 32)
    };

    const move = (e: MouseEvent) => {
      if (!this._activeDeleteResize) return;
      const dx = e.clientX - this._activeDeleteResize.startX;
      const min = 24, max = 120;
      const next = Math.max(min, Math.min(max, this._activeDeleteResize.startW + dx));
      this._activeDeleteResize.field.deleteWidth = next;
    };

    const up = () => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      this._activeDeleteResize = undefined;
    };

    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
  }
  private anchorPageToTopLeft(
  page: { fields?: Array<{ position?: { x?: number; y?: number } }> },
  pad: number = 12
): void {
  const fs = page?.fields || [];
  if (!fs.length) return;

  const minX = Math.min(...fs.map(f => Math.max(0, Math.round(f.position?.x ?? 0))));
  const minY = Math.min(...fs.map(f => Math.max(0, Math.round(f.position?.y ?? 0))));

  const shiftX = Math.max(0, minX - pad);
  const shiftY = Math.max(0, minY - pad);

  if (shiftX || shiftY) {
    fs.forEach(f => {
      f.position ||= { x: 0, y: 0 };
      f.position.x = Math.max(0, Math.round((f.position.x ?? 0) - shiftX));
      f.position.y = Math.max(0, Math.round((f.position.y ?? 0) - shiftY));
    });
  }
}
  // If your template has a draggable textarea
  saveTextareaPos(e: CdkDragEnd, f: FormField) {
    const p = e.source.getFreeDragPosition();
    f.textareaPos = { x: p.x, y: p.y };
    this.lockParentDrag(f, false);
  }
  async publishTemplate() {
  const payload = JSON.parse(JSON.stringify(this.formPages || []));
  this.captureCurrentLayoutForSave(payload);
  this.syncGridPixelsFromWrapper(payload);       // <-- for data-grid parity
 payload.forEach((p: { fields?: any[] }) => this.anchorPageToTopLeft(p, 12));  // optional
  // send to Firestore…
}
  rememberProblemItemSize(ev: MouseEvent, f: FormField, idx: number) {
    const el = ev.currentTarget as HTMLElement | null;
    if (!el) return;
    // persist size per item, not per whole field
    const w = Math.round(el.offsetWidth);
    const h = Math.round(el.offsetHeight);
    if (!f.problemItems || !f.problemItems[idx]) return;
    (f.problemItems[idx] as any)._size = { w, h };
  }
private isPointInsideField(x: number, y: number, f: FormField): boolean {
  if (!f?.position) return false;
  const left = f.position.x;
  const top  = f.position.y;
  const w = Math.max(20, (f.width ?? 150));
  const h = Math.max(20, (f.height ?? 60));
  return x >= left && x <= (left + w) && y >= top && y <= (top + h);
}

/** Find the topmost checkbox field under the (x,y) drop point */
private findCheckboxGroupAt(x: number, y: number): FormField | null {
  const page = this.formPages[this.currentPage];
  // search from top-most (end) to bottom-most so the visually top card wins
  for (let i = page.fields.length - 1; i >= 0; i--) {
    const f = page.fields[i];
    if (f?.type === 'checkbox' && this.isPointInsideField(x, y, f)) {
      return f;
    }
  }
  return null;
}
addFieldFromPalette(src: FormField) {
  const f: FormField = {
    ...JSON.parse(JSON.stringify(src)),
    id: this.generateId(),
    _inGrid: false,          // ✅ explicit
    position: { x: 20, y: 20 }
  };
  this.formPages[this.currentPage].fields.push(f);
}
  // If your template lets the textarea be resized by user
  rememberTextareaSize(ev: MouseEvent, f: FormField) {
    const el = ev.currentTarget as HTMLElement | null;
    if (!el) return;

    // Save inner size (for restoring after rerenders)
    f.textareaSize = { w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) };

    // Auto-grow the outer card height so it never clips the textarea
    const PADDING_AND_HEADER = 56;        // tweak if your header/padding differs
    const neededH = Math.round(el.offsetHeight + PADDING_AND_HEADER);
    if (!f.height || f.height < neededH) f.height = neededH;

    // Optional: widen outer if inner is now wider
    const SIDE_PADDING = 24;              // left+right paddings/borders
    const neededW = Math.round(el.offsetWidth + SIDE_PADDING);
    if (!f.width || f.width < neededW) f.width = neededW;
  }
  private openTemplateToFill(t: SavedForm) {
  this.isFillMode = true;
  this.isBuilderMode = false;  
    this.fillLayoutMode = 'exact'; 
  // IMPORTANT: take an exact copy of the template pages
  this.formPages = this.cloneAndRehydrate(t.formPages);
  this.formPages.forEach(p =>
    p.fields
      .filter(f => f.type === 'data-grid')
      .forEach(f => this.clampGridItems(f))
  );
  // Do NOT run mutators in fill mode
  // this.fixDuplicateIds();          // ❌ leave ids intact so positions/links stay 1:1
  // this.assignGridPositions();      // ❌ never
  // this.ensureGridPositions();      // ❌ never
  // this.ensureFieldPositions();     // ❌ don't overwrite positions with {x:0,y:0}

  this.selectedForm = t;
  this.currentFormId = t.formId;
  this.currentPage = 0;
  this.dashboardVisible = false;
  this.formListVisible = false;
  this.formBuilderVisible = true;

  // optional: email defaults are harmless; keep if you want
  this.ensureEmailDefaultsOnAllFields();

  this.cdr.detectChanges();
  setTimeout(() => {
    this.initCanvases();
    
    this.initializeFreeDragPositions(); // only reads existing positions
  });
}
  rememberInputSize(ev: MouseEvent, field: FormField) {
    const el = ev.currentTarget as HTMLElement; // the .inner-widget
    if (!el) return;
    field.inputSize = { w: el.offsetWidth, h: el.offsetHeight };
  }
  getBranchesModel(f: SavedForm): Branch[] {
    const sel = f?.allowedBranches ?? [];
    return sel.length ? [...sel] : ['ALL'];
  }
  async onTemplateBranchesChange(f: SavedForm, selection: Branch[] = []) {
    let uiSel = Array.isArray(selection) ? [...selection] : [];

    // Normalize selection: ALL is exclusive; empty -> ALL
    if (uiSel.includes('ALL') && uiSel.length > 1) uiSel = uiSel.filter(b => b !== 'ALL');
    if (uiSel.length === 0) uiSel = ['ALL'];

    // Update row state (drives "Current" chips instantly)
    f._uiSelection = [...uiSel];
    f.allowedBranches = [...uiSel];

    // If this form is open in editor, sync there too
    if (this.selectedForm && this.selectedForm.formId === f.formId) {
      this.selectedBranches = [...uiSel];
      this.selectedForm.allowedBranches = [...uiSel];
    }

    // Persist locally
    const local = this.readLocalTemplates();
    const idx = this.findRecordIndex(local, { formId: f.formId, firebaseId: f.firebaseId || null });
    if (idx >= 0) {
      local[idx] = { ...local[idx], allowedBranches: [...uiSel] };
      localStorage.setItem('savedFormPages', JSON.stringify(local));
    }

    // Persist remotely
    try {
      if (f.firebaseId) {
        await this.formService.updateFormTemplate(f.firebaseId, { allowedBranches: uiSel });
        await this.formService.updateTemplateInBranches(
          f.firebaseId,
          { formName: f.formName, formPages: f.formPages as any[], allowedBranches: uiSel },
          this.expandBranches(uiSel)
        );
      }
    } finally {
      // 🔁 Refresh array reference so MatTable re-evaluates the getter
      this.savedForms = [...this.savedForms];

      // 🚀 Auto-switch the list view so the row "moves" to that branch immediately
      this.listBranchFilter = uiSel.includes('ALL') ? 'ALL' : uiSel[0];

      // (Optional) confirmation toast
      const label = uiSel.includes('ALL') ? 'ALL' : uiSel.join(', ');
      this.snackBar.open(`Forms will load for: ${label}`, 'Close', { duration: 2000 });
    }
  }
  // Expands selection to concrete branches for the branch mirrors
  private expandBranches(sel: Branch[]): Branch[] {
    const all: Branch[] = ['MACKAY', 'YAT', 'NSW'];
    return sel.includes('ALL') ? all : sel;
  }
  isDesc(f: FormField): boolean {
    // migrate old data once (role-based) without relying on label text
    if (f && f.isDescription == null && f.role === 'description') f.isDescription = true;
    return !!f?.isDescription;
  }
  private arraysEqual(a: Branch[] = [], b: Branch[] = []) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  toggleInline(field: FormField) {
    field.inline = !field.inline;
    // If switching to inline and widths are missing, seed them
    if (field.inline) {
      const total = field.width ?? 340;
      if (!field.labelWidth && !field.inputWidth) {
        field.labelWidth = Math.max(60, Math.min(140, Math.round(total * 0.35)));
        field.inputWidth = Math.max(100, total - field.labelWidth - 40); // minus gaps/handles
      }
    }
  }
  private normalizeBranch(b: any): Branch | null {
    if (!b) return null;
    const key = String(b).toUpperCase().trim();
    const map: Record<string, Branch> = {
      ALL: 'ALL',
      MACKAY: 'MACKAY', MKAY: 'MACKAY', MAC: 'MACKAY',
      YAT: 'YAT', YATALA: 'YAT',
      NSW: 'NSW'
    };
    return map[key] ?? null;
  }

  private normalizeBranches(list: any): Branch[] {
    const arr = Array.isArray(list) ? list : [];
    const out = arr.map(x => this.normalizeBranch(x)).filter(Boolean) as Branch[];
    return out.length ? out : ['ALL'];
  }

  swapOrder(field: FormField) {
    field.inputFirst = !field.inputFirst;
  }
  async deleteForm(form: SavedForm): Promise<void> {
    const confirmDelete = confirm(`Delete template "${form.formName}"?`);
    if (!confirmDelete) return;

    try {
      // Remove from Firebase (if stored remotely)
      if (form.firebaseId) {
        await this.formService.deleteFormTemplate(form.firebaseId);
      }

      // Remove locally
      this.savedForms = this.savedForms.filter(f => f !== form);
      this.writeLocalTemplates(this.savedForms);

      this.snackBar.open('Template deleted', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Delete failed', err);
      this.snackBar.open('Failed to delete template', 'Close', { duration: 3000 });
    }
  }
private _startInlineFieldResize(
  ev: MouseEvent,
  field: FormField,
  keys: { w: '_textW' | '_radioW' | '_fileW'; h: '_textH' | '_radioH' | '_fileH'; ml: '_textML' | '_radioML' | '_fileML' },
  shellSelector: string,
  mode: 'left' | 'right' | 'se' | 'sw'
) {
  ev.preventDefault();
  ev.stopPropagation();

  const shell = (ev.currentTarget as HTMLElement).closest(shellSelector) as HTMLElement | null;
  if (!shell) return;

  const r = shell.getBoundingClientRect();
  const startW  = (field as any)[keys.w]  ?? Math.round(r.width)  ?? 240;
  const startH  = (field as any)[keys.h]  ?? Math.round(r.height) ?? 36;
  const startML = (field as any)[keys.ml] ?? 0;

  const startX = ev.pageX, startY = ev.pageY;
  const clamp = (v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

  const MIN_W=120, MAX_W=1200, MIN_H=28, MIN_ML=-240, MAX_ML=400;
  const RIGHT_INSET = 40; // keep room for inside controls/grips

  const prevC = document.body.style.cursor;
  const prevSel = (document.body.style as any).userSelect;
  document.body.style.cursor = (mode==='se'||mode==='sw') ? 'nwse-resize' : 'ew-resize';
  (document.body.style as any).userSelect = 'none';

  const onMove = (e: MouseEvent) => {
    const dx = e.pageX - startX;
    const dy = e.pageY - startY;

    let W=startW, H=startH, ML=startML;
    if (mode==='right'){ W = clamp(startW + dx, MIN_W, MAX_W); }
    else if (mode==='left'){ W = clamp(startW - dx, MIN_W, MAX_W); ML = clamp(startML + dx, MIN_ML, MAX_ML); }
    else if (mode==='se'){ W = clamp(startW + dx, MIN_W, MAX_W); H = Math.max(MIN_H, startH + dy); }
    else if (mode==='sw'){ W = clamp(startW - dx, MIN_W, MAX_W); H = Math.max(MIN_H, startH + dy); ML = clamp(startML + dx, MIN_ML, MAX_ML); }

    if (W < RIGHT_INSET + MIN_W) W = RIGHT_INSET + MIN_W;

    (field as any)[keys.w]  = Math.round(W);
    (field as any)[keys.h]  = Math.round(H);
    (field as any)[keys.ml] = Math.round(ML);
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    document.body.style.cursor = prevC;
    (document.body.style as any).userSelect = prevSel;
  };

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
}

/** Template shims */
startTextResize(ev: MouseEvent, field: FormField, mode: 'left'|'right'|'se'|'sw') {
  this._startInlineFieldResize(ev, field, { w: '_textW',  h: '_textH',  ml: '_textML'  }, '.text-input-shell',  mode);
}
startRadioResize(ev: MouseEvent, field: FormField, mode: 'left'|'right'|'se'|'sw') {
  this._startInlineFieldResize(ev, field, { w: '_radioW', h: '_radioH', ml: '_radioML' }, '.radio-input-shell', mode);
}
startFileResize(ev: MouseEvent, field: FormField, mode: 'left'|'right'|'se'|'sw') {
  this._startInlineFieldResize(ev, field, { w: '_fileW',  h: '_fileH',  ml: '_fileML'  }, '.file-input-shell',  mode);
}
  // Inline splitter drag
  startInlineResize(ev: MouseEvent, field: FormField): void {
    ev.stopPropagation(); // don't start dragging the outer block
    ev.preventDefault();

    const startX = ev.clientX;
    const total = field.width ?? 340;
    const gapAndSplitter = 8 /*gap*/ + 6 /*splitter*/ + 8 /*gap*/;

    const startLabel = field.labelWidth ?? 120;
    const startInput = field.inputWidth ?? Math.max(100, total - startLabel - gapAndSplitter);

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      let newLabel = startLabel + dx;

      // clamp
      newLabel = Math.max(40, Math.min(total - gapAndSplitter - 80, newLabel));
      const newInput = Math.max(80, total - gapAndSplitter - newLabel);

      field.labelWidth = Math.round(newLabel);
      field.inputWidth = Math.round(newInput);
      this.cdr.markForCheck();
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
    };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
  }

  hasAnyChecked(field: { options?: { checked?: boolean }[] }): boolean {
    return Array.isArray(field.options) && field.options.some(o => !!o?.checked);
  }
startEmailResize(ev: MouseEvent, field: any, mode: 'left' | 'right' | 'se' | 'sw') {
  ev.preventDefault();
  ev.stopPropagation();

  // grips are inside the shell
  const shell = (ev.currentTarget as HTMLElement).closest('.email-input-shell') as HTMLElement | null;
  if (!shell) return;

  // --- helpers ---
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  // If any ancestor is scaled (transform: scale), compensate mouse deltas.
  const getScale = (el: HTMLElement | null): number => {
    while (el) {
      const t = getComputedStyle(el).transform;
      if (t && t !== 'none') {
        // matrix(a, b, c, d, tx, ty) → use a as X scale
        const m = t.match(/matrix\(([^)]+)\)/);
        if (m) {
          const parts = m[1].split(',').map(n => parseFloat(n.trim()));
          if (parts.length >= 1 && isFinite(parts[0]) && parts[0] !== 0) return parts[0];
        }
      }
      el = el.parentElement;
    }
    return 1;
  };

  const scaleX = getScale(shell);

  // starting geometry
  const startRect = shell.getBoundingClientRect();
  const startW = field._emailW ?? Math.round(startRect.width)  ?? 220;
  const startH = field._emailH ?? Math.round(startRect.height) ?? 32;
  const startML = field._emailML ?? 0; // margin-left on the wrapper column

  // use page coordinates to be robust to scroll during drag
  const startX = ev.pageX;
  const startY = ev.pageY;

  // constraints
  const MIN_W = 80;
  const MAX_W = 1200;
  const MIN_H = 28;
  const MIN_ML = -240;
  const MAX_ML =  400;

  // keep some inner space for delete + corner grip
  const RIGHT_INSET = 40; // must match CSS padding-right on .resizable-email

  const prevCursor = document.body.style.cursor;
  const prevSel = (document.body.style as any).userSelect;
  document.body.style.cursor = (mode === 'se' || mode === 'sw') ? 'nwse-resize' : 'ew-resize';
  (document.body.style as any).userSelect = 'none';

  let raf = 0;

  const onMove = (e: MouseEvent) => {
    // throttle to animation frame for smoother Angular bindings
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;

      const dxRaw = e.pageX - startX;
      const dyRaw = e.pageY - startY;
      // compensate for any transform scale on ancestors
      const dx = dxRaw / (scaleX || 1);
      const dy = dyRaw; // Y rarely scaled in your layout; adjust if needed

      let W = startW;
      let H = startH;
      let ML = startML;

      if (mode === 'right') {
        W = clamp(startW + dx, MIN_W, MAX_W);
      } else if (mode === 'left') {
        W  = clamp(startW - dx, MIN_W, MAX_W);
        ML = clamp(startML + dx, MIN_ML, MAX_ML);
      } else if (mode === 'se') {
        W = clamp(startW + dx, MIN_W, MAX_W);
        H = Math.max(MIN_H, startH + dy);
      } else if (mode === 'sw') {
        W  = clamp(startW - dx, MIN_W, MAX_W);
        H  = Math.max(MIN_H, startH + dy);
        ML = clamp(startML + dx, MIN_ML, MAX_ML);
      }

      // ensure we keep room for the inside controls on the right
      if (W < RIGHT_INSET + MIN_W) W = RIGHT_INSET + MIN_W;

      field._emailW  = Math.round(W);
      field._emailH  = Math.round(H);
      field._emailML = Math.round(ML);
    });
  };

  const onUp = () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    document.body.style.cursor = prevCursor;
    (document.body.style as any).userSelect = prevSel;
  };

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
}
startDateResize(ev: MouseEvent, field: any, mode: 'left'|'right'|'se'|'sw') {
  ev.preventDefault();
  ev.stopPropagation();

  const shell = (ev.currentTarget as HTMLElement).closest('.date-input-shell') as HTMLElement | null;
  if (!shell) return;

  const r = shell.getBoundingClientRect();
  const startW  = field._dateW  ?? Math.round(r.width)  ?? 240;
  const startH  = field._dateH  ?? Math.round(r.height) ?? 36;
  const startML = field._dateML ?? 0;

  const startX = ev.pageX, startY = ev.pageY;
  const clamp = (v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
  const MIN_W=120, MAX_W=1200, MIN_H=28, MIN_ML=-240, MAX_ML=400;
  const RIGHT_INSET = 40; // must match padding-right in CSS

  const prevC = document.body.style.cursor;
  const prevSel = (document.body.style as any).userSelect;
  document.body.style.cursor = (mode==='se'||mode==='sw')?'nwse-resize':'ew-resize';
  (document.body.style as any).userSelect = 'none';

  const onMove = (e: MouseEvent) => {
    const dx = e.pageX - startX;
    const dy = e.pageY - startY;

    let W=startW, H=startH, ML=startML;
    if (mode==='right'){ W = clamp(startW + dx, MIN_W, MAX_W); }
    else if (mode==='left'){ W = clamp(startW - dx, MIN_W, MAX_W); ML = clamp(startML + dx, MIN_ML, MAX_ML); }
    else if (mode==='se'){ W = clamp(startW + dx, MIN_W, MAX_W); H = Math.max(MIN_H, startH + dy); }
    else if (mode==='sw'){ W = clamp(startW - dx, MIN_W, MAX_W); H = Math.max(MIN_H, startH + dy); ML = clamp(startML + dx, MIN_ML, MAX_ML); }

    if (W < RIGHT_INSET + MIN_W) W = RIGHT_INSET + MIN_W;

    field._dateW  = Math.round(W);
    field._dateH  = Math.round(H);
    field._dateML = Math.round(ML);
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    document.body.style.cursor = prevC;
    (document.body.style as any).userSelect = prevSel;
  };

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
}
  private cleanupLocalDuplicates(): void {
    const local: SavedForm[] = JSON.parse(localStorage.getItem('savedFormPages') || '[]');
    const seen = new Map<string, SavedForm>();
    for (const r of local) {
      const key = r.firebaseId || r.formId;   // prefer firebaseId when present
      if (!seen.has(key)) seen.set(key, r);
    }
    const cleaned = Array.from(seen.values());
    localStorage.setItem('savedFormPages', JSON.stringify(cleaned));
    this.savedForms = cleaned;
  }
  // Prefer firebaseId when present; otherwise use formId.
  private identityKey(s: SavedForm): string {
    return (s.firebaseId && s.firebaseId.trim()) ? `fb:${s.firebaseId}` : `id:${s.formId}`;
  }
  // Find index in an array by matching identity with current record (by firebaseId, else formId)
  private findRecordIndex(list: SavedForm[], rec: { formId?: string | null; firebaseId?: string | null }): number {
    const fb = (rec.firebaseId && rec.firebaseId.trim()) ? `fb:${rec.firebaseId}` : null;
    const id = (rec.formId && rec.formId.trim()) ? `id:${rec.formId}` : null;
    return list.findIndex(x => {
      const key = this.identityKey(x);
      return (fb && key === fb) || (!fb && id && key === id);
    });
  }
  private normalizeGridForSave(pages: FormPage[]) {
  pages.forEach(p =>
    p.fields.forEach((f: any) => {
      const t = String(f.type || '').toLowerCase().replace(/\s|_/g,'-');
      if (t === 'data-grid' || t === 'datagrid' || t === 'grid' || t === 'matrix') {
        f.type = 'data-grid';
        const gm = (f.gridMatrix ||= { rows: 1, cols: 1, cells: [[{ items: [] }]] });
        gm.cellH ??= 140; gm.gap ??= 12; gm.showBorders ??= true;
        gm.rows = Math.max(1, gm.rows || gm.cells?.length || 1);
        gm.cols = Math.max(1, gm.cols || gm.cells?.[0]?.length || 1);
        gm.cells = Array.from({ length: gm.rows }, (_, r) =>
          Array.from({ length: gm.cols }, (_, c) => {
            const cell = gm.cells?.[r]?.[c] || { items: [] };
            cell.items = (cell.items || []).map((it: any) => ({
              ...it,
              value: it.value ?? (it.type === 'checkbox' ? [] : null),
              options: Array.isArray(it.options)
                ? it.options.map((o: any) => ({
                    label: o.label ?? String(o.value ?? ''),
                    value: o.value ?? o.label ?? ''
                  }))
                : undefined
            }));
            return cell;
          })
        );
      }
    })
  );
}
private makeDataGridField(): FormField {
  const rows = 2, cols = 2;
  const cells = Array.from({length: rows}, () =>
    Array.from({length: cols}, () => ({ items: [] }))
  );
  return {
    id: this.generateId(),
    label: 'Data Grid',
    type: 'data-grid',
    required: false,
    position: { x: 0, y: 0 },
    width: 480,
    height: 240,
    gridMode: 'matrix',
    gridMatrix: { rows, cols, cells, showBorders: true, cellW: 160, cellH: 90, gap: 8 },
    gridConfig: { columns: [], addRowText: 'Add row', minRows: 0 },
    rows: []
  };
}

canEnterCell = (_drag: any, drop: any) =>
  drop.element?.nativeElement?.classList?.contains('dg-cell-drop');
// All droplist ids that this grid connects to (plus 'palette')
connectedGridLists(field: FormField): string[] {
  const gm = field.gridMatrix!;
  const ids: string[] = [];
  for (let r = 0; r < gm.rows; r++) {
    for (let c = 0; c < gm.cols; c++) ids.push(this.cellListId(field, r, c));
  }
  ids.push('fieldPalette'); // allow copying from palette
  return ids;
}
cellListId(field: FormField, r: number, c: number) {
  return `dg-${field.id}-${r}-${c}`;
}
ensureMatrixWidth(field: FormField, cols = 2) {
  // init if missing
  if (!field.gridMatrix) {
    field.gridMatrix = {
      rows: 1,
      cols: Math.max(1, cols),
      showBorders: true,
      gap: 12,
      cellH: 140,
      cells: [[{ items: [] }]]
    };
  }

  const gm = field.gridMatrix;
  gm.cols = Math.max(1, cols);
  gm.rows = Math.max(1, gm.rows || gm.cells?.length || 1);

  const prevCells = gm.cells || [];

  // rebuild cells grid to exact rows×cols, preserving old cells when present
  gm.cells = Array.from({ length: gm.rows }, (_, r) =>
    Array.from({ length: gm.cols }, (_, c) => {
      const cell = prevCells?.[r]?.[c] ?? { items: [] as any[] };

      // make sure every item has a value target for ngModel
      cell.items = (cell.items || []).map((it: any) => ({
        ...it,
        value: it?.value ?? (it?.type === 'checkbox' ? [] : null)
      }));

      return cell;
    })
  );

  // one-time sensible defaults
  gm.cellH ??= 140;
  gm.gap ??= 12;
  gm.showBorders ??= true;

  field.gridMode = 'matrix';
}
dropIntoGridCell(
  e: CdkDragDrop<GridItem[]>,
  field: FormField,
  r: number,
  c: number,
  cellEl?: HTMLElement
) {
  if (field.type !== 'data-grid' || field.gridMode !== 'matrix' || !field.gridMatrix) return;

  const target = field.gridMatrix.cells[r][c].items;

  // 0) Same-container reorder
  if (e.previousContainer === e.container) {
    moveItemInArray(target, e.previousIndex, e.currentIndex);
    this.clampGridItems(field); 
    return;
  }

  // 1) Move between cells within this grid
  if (e.previousContainer.id.startsWith(`dg-${field.id}-`)) {
    transferArrayItem(e.previousContainer.data, target, e.previousIndex, e.currentIndex);
    // ensure position stays inside new cell
    const moved = target[e.currentIndex];
    if (moved && !moved.pos) moved.pos = { x: 6, y: 6 }; 
    this.clampGridItems(field);        // NEW (safety)
    return;
  }

  // Helper: clone and initialise a grid item
  const makeGridItem = (def: any): GridItem => ({
    id: `${def.id}-${(crypto as any).randomUUID?.() || Date.now()}`,
    type: def.type,
    label: def.label,
    options: def.options ? def.options.map((o: any) => ({ ...o })) : undefined,
    ...(def.type === 'checkbox' ? { value: [] as string[] } : { value: null as any }),
    pos: { x: 6, y: 6 },                                       // NEW default
    size: { w: 220, h: 60 },                                   // NEW default
  });

  // --- NEW: compute drop position relative to the cell ---
const setDropPosition = (g: GridItem) => {
  if (!cellEl || !this.pointerPosition) return;
  const rect = cellEl.getBoundingClientRect();
  const x = Math.max(6, Math.round(this.pointerPosition.x - rect.left));
  const y = Math.max(6, Math.round(this.pointerPosition.y - rect.top));
  g.pos = { x, y };
  const maxW = Math.max(40, rect.width - 12);
  if (!g.size) g.size = { w: 220, h: 60 };
  g.size.w = Math.min(g.size.w, maxW);
};
  // -------------------------------------------------------

  // 2) From PALETTE -> GRID
  if (e.previousContainer.id === 'fieldPalette') {
    const def = e.item.data;
    const copy = makeGridItem(def);
    setDropPosition(copy);                                      // NEW
    target.splice(e.currentIndex, 0, copy);
    this.clampGridItems(field); 
    return;
  }

  // 3) From CANVAS -> GRID
  if (e.previousContainer.id === 'formCanvas') {
    const srcField = e.item.data as FormField;
    const copy = makeGridItem(srcField);
    setDropPosition(copy);                                      // NEW
    target.splice(e.currentIndex, 0, copy);

    const page = this.formPages[this.currentPage];
    const idx = page.fields.findIndex(f => f.id === srcField.id);
    if (idx > -1) page.fields.splice(idx, 1);
    this.clampGridItems(field); 
    return;
  }

  // 4) Fallback
  const def = e.item.data;
  const copy = makeGridItem(def);
  setDropPosition(copy);                                        // NEW
  target.splice(e.currentIndex, 0, copy);
  this.clampGridItems(field); 
}
makeTileFromPalette(def: any) {
  const copy = { ...def };
  // remove absolute/free-drag stuff so CSS sizing takes over
  delete copy.position;
  delete copy.width;
  delete copy.height;
  return copy;
}
// Grid ops
addGridRowM(field: FormField, at?: number) {
  if (!field.gridMatrix) return;
  const g = field.gridMatrix;
  const row: GridCell[] = Array.from({ length: g.cols }, () => ({ items: [] }));
  g.cells.splice(typeof at === 'number' ? at : g.rows, 0, row);
  g.rows++;
    g.rows++;
  this.clampGridItems(field);
}

addGridColM(field: FormField) {
  const gm = field.gridMatrix!;
  gm.cols += 1;
  gm.cells.forEach(row => row.push({ items: [] }));

  this.clampGridItems(field);
}
removeGridRowM(field: FormField, rowIndex: number) {
  const gm = field.gridMatrix;
  if (!gm) return;
  gm.cells.splice(rowIndex, 1);
  gm.rows = gm.cells.length;
    this.clampGridItems(field); 
  
}

removeGridColM(field: FormField, colIndex: number) {
  const gm = field.gridMatrix;
  if (!gm) return;
  gm.cells.forEach(row => row.splice(colIndex, 1));
  gm.cols = Math.max(1, gm.cols - 1);
    this.clampGridItems(field); 
}


toggleGridBordersM(field: any) {
  const gm = field.gridMatrix;
  gm.showBorders = !gm.showBorders;
}

  // Deduplicate by identity key (firebaseId wins when present)
  private dedupeByIdentity(list: SavedForm[]): SavedForm[] {
    const m = new Map<string, SavedForm>();
    for (const r of list) m.set(this.identityKey(r), r);
    return Array.from(m.values());
  }
  onBranchesChange(selected: Branch[]) {
    this.selectedBranches = selected.includes('ALL') ? ['ALL'] : selected;
  }
  get branchesToSave(): Branch[] {
    return this.selectedBranches.includes('ALL')
      ? ['MACKAY', 'YAT', 'NSW']   // must match BRANCHES (without ALL)
      : this.selectedBranches.filter(b => b !== 'ALL');
  }
  // Safe parse for localStorage
  private readLocalTemplates(): SavedForm[] {
    try {
      const raw = localStorage.getItem('savedFormPages');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
startBranchResize(ev: MouseEvent, field: any, mode: 'left'|'right'|'se'|'sw') {
  ev.preventDefault();
  ev.stopPropagation();

  // find the shell for branch
  const shell = (ev.currentTarget as HTMLElement).closest('.branch-input-shell') as HTMLElement | null;
  if (!shell) return;

  const r = shell.getBoundingClientRect();
  const startW  = field._branchW  ?? Math.round(r.width)  ?? 240;
  const startH  = field._branchH  ?? Math.round(r.height) ?? 36;
  const startML = field._branchML ?? 0;

  const startX = ev.pageX, startY = ev.pageY;
  const clamp = (v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
  const MIN_W=120, MAX_W=1200, MIN_H=28, MIN_ML=-240, MAX_ML=400;
  const RIGHT_INSET = 40; // match padding-right inside the select, like others

  const prevC = document.body.style.cursor;
  const prevSel = (document.body.style as any).userSelect;
  document.body.style.cursor = (mode==='se'||mode==='sw') ? 'nwse-resize' : 'ew-resize';
  (document.body.style as any).userSelect = 'none';

  const onMove = (e: MouseEvent) => {
    const dx = e.pageX - startX;
    const dy = e.pageY - startY;

    let W=startW, H=startH, ML=startML;
    if (mode==='right'){ W = clamp(startW + dx, MIN_W, MAX_W); }
    else if (mode==='left'){ W = clamp(startW - dx, MIN_W, MAX_W); ML = clamp(startML + dx, MIN_ML, MAX_ML); }
    else if (mode==='se'){ W = clamp(startW + dx, MIN_W, MAX_W); H = Math.max(MIN_H, startH + dy); }
    else if (mode==='sw'){ W = clamp(startW - dx, MIN_W, MAX_W); H = Math.max(MIN_H, startH + dy); ML = clamp(startML + dx, MIN_ML, MAX_ML); }

    if (W < RIGHT_INSET + MIN_W) W = RIGHT_INSET + MIN_W;

    field._branchW  = Math.round(W);
    field._branchH  = Math.round(H);
    field._branchML = Math.round(ML);
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    document.body.style.cursor = prevC;
    (document.body.style as any).userSelect = prevSel;
  };

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
}
  // Safe write to localStorage and keep in-memory copy in sync
  private writeLocalTemplates(list: SavedForm[]): void {
    const clean = this.dedupeByIdentity(list);
    localStorage.setItem('savedFormPages', JSON.stringify(clean));
    this.savedForms = clean;
  }
  private async ensureTemplateInFirebase(
    name: string,
    pages: FormPage[],
    existingFirebaseId?: string | null
  ): Promise<string> {
    try {
      if (existingFirebaseId && existingFirebaseId.trim()) {
        await this.formService.updateFormTemplate(existingFirebaseId, {
          formName: name,
          formPages: this.formPages as any[],
          allowedBranches: this.selectedBranches
        });
        const allowed = this.selectedBranches.includes('ALL') ? [] : this.selectedBranches;
        return existingFirebaseId;
      } else {
        const ref = await this.formService.saveFormTemplate(name, pages as any[]);
        return ref.id;
      }
    } catch (e) {
      console.error('Firebase save failed', e);
      this.snackBar.open('Saved locally. Firebase save failed.', 'Close', { duration: 3000 });
      // Return existing id if we had one; otherwise return '' and let caller keep local-only
      return existingFirebaseId?.trim() ? existingFirebaseId : '';
    }
  }
  async clearAllSavedForms(): Promise<void> {
    if (!this.savedForms?.length) {
      this.snackBar.open('No saved forms to clear.', 'Close', { duration: 2000 });
      return;
    }

    // First confirmation
    const confirmAll = confirm('Delete ALL saved forms? This cannot be undone.');
    if (!confirmAll) return;

    // Ask whether to also delete from Firebase (if any have firebaseId)
    const hasRemote = this.savedForms.some(f => !!f.firebaseId);
    let alsoRemote = false;

    if (hasRemote) {
      alsoRemote = confirm('Also delete templates from Firebase? (OK = yes, Cancel = local only)');
    }

    this.isClearing = true;

    try {
      // 1) If requested, delete all Firebase templates we know about
      if (alsoRemote) {
        const ids = this.savedForms
          .map(f => f.firebaseId)
          .filter((id): id is string => !!id && id.trim().length > 0);

        if (ids.length) {
          // Run in parallel but don’t blow up on one failure
          const results = await Promise.allSettled(
            ids.map(id => this.formService.deleteFormTemplate(id))
          );

          // Log any failures (optional toast)
          const failed = results.filter(r => r.status === 'rejected').length;
          if (failed) {
            console.warn(`Failed to delete ${failed} Firebase templates.`);
            this.snackBar.open(`Some Firebase deletes failed (${failed}).`, 'Close', { duration: 3000 });
          }
        }
      }

      // 2) Clear local storage list & UI
      localStorage.removeItem('savedFormPages');
      this.savedForms = [];

      // Optionally reset selection/edit state
      this.selectedForm = null;
      this.currentFormId = null;

      this.snackBar.open(
        alsoRemote ? 'All templates deleted (local + Firebase).' : 'All local templates deleted.',
        'Close',
        { duration: 2500 }
      );
    } catch (e) {
      console.error('Clear all failed', e);
      this.snackBar.open('Failed to clear some items. Check console for details.', 'Close', { duration: 3000 });
    } finally {
      this.isClearing = false;
    }
  }

  addProblemItem(field: FormField): void {
    if (!field.problemItems) field.problemItems = [];
    if (!field.nextNo) field.nextNo = 1;

    field.problemItems.push({
      no: field.nextNo,
      text: "",
      _size: field.textareaSize
        ? { w: field.textareaSize.w, h: field.textareaSize.h }
        : undefined,                 // or e.g. { w: 280, h: 80 }
    });

    field.nextNo++;
    this.cdr.detectChanges();
  }
  lockParentDrag(field: any, lock: boolean) {
    field._lockParentDrag = lock;
  }

  onEmailDragEnd(event: CdkDragEnd, field: any) {
    const pos = event.source.getFreeDragPosition();
    field.inputPos = { x: pos.x, y: pos.y };   // persist position
    this.lockParentDrag(field, false);         // re-enable parent drag
  }
  // Update problem text (used by your (ngModelChange))
  updateProblemText(field: FormField, idx: number, value: string): void {
    if (!field.problemItems) return;
    field.problemItems[idx].text = value;
  }

  // Delete problem and re-number
  removeProblemItem(field: FormField, idx: number): void {
    if (!field.problemItems) return;
    field.problemItems.splice(idx, 1);
    field.problemItems.forEach((item, i) => item.no = i + 1);
    field.nextNo = field.problemItems.length + 1;
    this.cdr.detectChanges();
  }

  syncContainerSize(textarea: HTMLTextAreaElement, event: MouseEvent) {
    const container = textarea.parentElement as HTMLElement;
    if (container) {
      // Update container width and height to match textarea's current size
      container.style.width = textarea.offsetWidth + 'px';
      container.style.height = textarea.offsetHeight + 'px';
    }
  }
  openNewTemplate(): void {
    this.formBuilderVisible = true;   // show builder
    this.formListVisible = false;     // hide list
    this.dashboardVisible = false;    // hide dashboard if shown
    this.selectedForm = null; 
      this.isBuilderMode = true;          // reset selection
    this.currentFormId = null;
    this.formPages = [{ fields: [] }]; // fresh empty page
    this.cdr.detectChanges();

    setTimeout(() => {
      this.initCanvases();
      this.initializeFreeDragPositions();
    }, 0);
  }
  startTitleResize(evt: MouseEvent, field: any, dir: 'n'|'s'|'e'|'w'|'nw'|'ne'|'sw'|'se') {
  evt.preventDefault(); evt.stopPropagation();
  field._lockParentDrag = true; // if you use this elsewhere, it will stop parent drag

  const shell = (evt.target as HTMLElement).closest('.title-input-shell') as HTMLElement;
  const startX = evt.clientX, startY = evt.clientY;
  const startW = shell.offsetWidth, startH = shell.offsetHeight;
  const minW = 140, minH = 36;

  const onMove = (e: MouseEvent) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let w = startW, h = startH;
    if (dir.includes('e')) w = Math.max(minW, startW + dx);
    if (dir.includes('w')) w = Math.max(minW, startW - dx);
    if (dir.includes('s')) h = Math.max(minH, startH + dy);
    if (dir.includes('n')) h = Math.max(minH, startH - dy);

    field._titleW = w;
    field._titleH = h;
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    field._lockParentDrag = false;
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
 openForm(form: SavedForm) {
  this.isFillMode = false;
  this.selectedForm = form;
  this.currentFormId = form.formId;
 this.isBuilderMode = true; 
   this.fillLayoutMode = 'exact';  
     this.selectedForm = form;
  this.currentFormId = form.formId;
  this.formPages = this.cloneAndRehydrate(form.formPages); // ← important
  this.formPages = this.cloneAndRehydrate(form.formPages);
  this.formPages.forEach(p =>
    p.fields
      .filter(f => f.type === 'data-grid')
      .forEach(f => this.clampGridItems(f))
  );

  this.currentPage = 0;
  this.dashboardVisible = false;
  this.formBuilderVisible = true;
  this.formListVisible = false;

  this.cdr.detectChanges();
  setTimeout(() => {
    this.initCanvases();
    this.initializeFreeDragPositions();
  }, 0);
}
  openFieldConfig() {
    const canvas = document.getElementById('formCanvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const popupWidth = 400;  // approx popup width in px
    const popupHeight = 280; // approx popup height in px

    // Start positioning popup near bottom-right corner of canvas
    let proposedTop = rect.height - popupHeight - 20; // 20px margin
    let proposedLeft = rect.width - popupWidth - 20;

    // Get all current field DOM elements inside canvas
    const fieldElements = canvas.querySelectorAll('.form-row');

    // Check if popup overlaps any field
    const isOverlapping = () => {
      for (let i = 0; i < fieldElements.length; i++) {
        const fieldEl = fieldElements[i] as HTMLElement;
        const fRect = fieldEl.getBoundingClientRect();

        // Convert field coordinates relative to canvas
        const fTop = fRect.top - rect.top;
        const fLeft = fRect.left - rect.left;
        const fBottom = fTop + fRect.height;
        const fRight = fLeft + fRect.width;

        // Popup boundaries
        const pTop = proposedTop;
        const pLeft = proposedLeft;
        const pBottom = pTop + popupHeight;
        const pRight = pLeft + popupWidth;

        // Check for rectangle overlap
        const overlap =
          !(pRight < fLeft || pLeft > fRight || pBottom < fTop || pTop > fBottom);

        if (overlap) return true;
      }
      return false;
    };

    // If overlap, move popup up by increments until no overlap or top < 10
    while (isOverlapping() && proposedTop > 10) {
      proposedTop -= 30;
    }

    // Set the final popup positions
    this.popupTop = proposedTop < 10 ? 10 : proposedTop;
    this.popupLeft = proposedLeft < 10 ? 10 : proposedLeft;

    this.fieldConfigVisible = true;
  }
  private getEmptyField(): FormField {
    return {
      id: '',
      label: '',
      type: 'text',
      placeholder: '',
      width: 150,
      value: '',
      position: { x: 0, y: 0 },
      required: false
    };
  }
  sampleCheckbox = {
    type: 'checkbox',
    options: [
      { label: 'Option 1', checked: false },
      { label: 'Option 2', checked: false },
      { label: 'Option 3', checked: false },
    ]
  };

  generateId(): string {
    this.idCounter++;
    return 'field-' + Date.now() + '-' + this.idCounter + '-' + Math.random().toString(36).substr(2, 5);
  }

  ngAfterViewInit(): void {
    this.initCanvases();
  }

  private canvasInitScheduled = false;

  ngAfterViewChecked(): void {
    if (this.canvasRefs.length !== this.lastCanvasCount && !this.canvasInitScheduled) {
      this.canvasInitScheduled = true;
      setTimeout(() => {
        this.initCanvases();
        this.canvasInitScheduled = false;
        this.lastCanvasCount = this.canvasRefs.length;
      }, 100);
    }

    if (this.shouldClearSignatureCanvas) {
      setTimeout(() => {
        this.clearCanvasAfterDrop();
        this.shouldClearSignatureCanvas = false;
      }, 0);
    }
  }



  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    this.pointerPosition = { x: event.clientX, y: event.clientY };
    this.lastPointer = { x: event.clientX, y: event.clientY };
  }
  isRequiredField(field: FormField): boolean {
    const label = (field.label || '').trim().toLowerCase();
    const legacyRequired = label === 'crew name' || label === 'date' || label === 'signature';
    return !!field.required || legacyRequired;
  }
  labelEditing: string | null = null;

  startLabelEdit(field: FormField, ev?: Event) {
    ev?.stopPropagation();
    this.labelEditing = field.id;
    setTimeout(() => {
      const el = document.querySelector(
        `.editable-label[data-id="${field.id}"]`
      ) as HTMLElement | null;   // ⬅️ note selector order
      el?.focus();
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
  }
  updateOptionLabel(field: FormField, index: number, ev: FocusEvent) {
    const el = ev.target as HTMLElement;
    const txt = (el.innerText || '').trim();
    if (!field.options) field.options = [];
    const curr = field.options[index] || { label: '' };
    field.options[index] = { ...curr, label: txt || `Option ${index + 1}` };
  }
  setLabelPos(f: FormField, pos: 'top' | 'left' | 'right' | 'bottom') {
    if (!f) return;
    f.labelDock = pos;

    this.cdr.markForCheck();
  }

  finishLabelEdit(field: FormField, ev: FocusEvent | KeyboardEvent) {
    const el = ev.target as HTMLElement;
    const text = (el.innerText || '').trim();
    field.label = text || this.prettyLabelForType(field.type); // ← was 'Checkbox'
    this.labelEditing = null;
  }

  onLabelKeydown(field: FormField, ev: KeyboardEvent) {
    if (ev.key === 'Enter' || ev.key === 'Escape') {
      ev.preventDefault();
      (ev.target as HTMLElement).blur(); // triggers finishLabelEdit via (blur)
    }
  }

  // Is the required field filled?
  isFieldFilled(field: FormField): boolean {
    if (!this.isRequiredField(field)) return true;


    switch (field.type) {
      case 'textarea':
        return this.isDesc(field)
          ? (field.problemItems?.length ?? 0) > 0
          : (typeof field.value === 'string' ? field.value.trim().length > 0 : !!field.value);

      case 'text':
      case 'email':
      case 'tel':
      case 'number':
      case 'textarea':
      case 'project-title':
        return typeof field.value === 'string' ? field.value.trim().length > 0 : !!field.value;

      case 'date':
        return !!field.value && String(field.value).trim().length > 0;

      case 'signature':
        return !!field.value && typeof field.value === 'string' && field.value.startsWith('data:image');

      case 'checkbox': // ⬅️ add this
        if (Array.isArray(field.options) && field.options.length) {
          return field.options.some(o => !!o?.checked);
        }
        return !!field.value; // fallback if ever used as single checkbox

case 'radio':
  return field.value !== undefined && field.value !== null && String(field.value) !== '';

case 'file':
  return !!field.value; // you set base64 in onFileSelected
      case 'data-grid': {
        const rows = field.rows || [];
        if (!rows.length) return false;
        const cols = field.gridConfig?.columns || [];
        // consider a row valid if ANY required column is non-empty
        return rows.some(r =>
          cols.some(c =>
            c.required
              ? r[c.id] !== null && r[c.id] !== undefined && String(r[c.id]).trim() !== ''
              : false
          )
        );
      }
      default:
        return true;
    }
  }
  // Any required fields missing across pages?
  hasRequiredMissing(): boolean {
    for (const page of this.formPages) {
      for (const f of page.fields) {
        if (this.isRequiredField(f) && !this.isFieldFilled(f)) return true;
      }
    }
    return false;
  }
  addCheckboxOption(field: FormField) {
    field.options = field.options || [];
    const n = field.options.length + 1;
    field.options.push({ label: `Option ${n}`, value: `opt${n}`, checked: false });
  }


  removeCheckboxOption(field: FormField, idx: number) {
    field.options?.splice(idx, 1);
  }

  onOptionLabelBlur(e: Event, oi: number, opt: { label: string; value?: string; checked?: boolean }): void {
    const el = e.target as HTMLElement | null;
    const text = (el?.innerText || '').trim();
    opt.label = text || `Option ${oi + 1}`;
    this.cdr.markForCheck();
  }
  onOptionKeydown(ev: KeyboardEvent) {
    if (ev.key === 'Enter' || ev.key === 'Escape') {
      ev.preventDefault();
      (ev.target as HTMLElement).blur();
    }
  }

  // Build a list of missing required field labels
  missingRequiredList(): string[] {
    const out: string[] = [];
    for (const page of this.formPages) {
      for (const f of page.fields) {
        if (this.isRequiredField(f) && !this.isFieldFilled(f)) {
          out.push(f.label || f.type);
        }
      }
    }
    return out;
  }
  initializeFreeDragPositions() {
    this.freeDragPositions = this.freeDragPositions || {};
    this.formPages[this.currentPage].fields.forEach(field => {
      if (!field.position) {
        field.position = { x: 0, y: 0 };
      }
      this.freeDragPositions[field.id] = field.position;
    });
  }


  onFileSelected(event: Event, field: FormField): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      if (!file.type.startsWith('image/')) {
        this.snackBar.open('Only image files are supported', 'Close', { duration: 3000 });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e: any) => {
        field.value = e.target.result; // base64 image string
      };
      reader.readAsDataURL(file);
    }
  }
  startCheckboxResize(ev: MouseEvent, field: any, mode: 'left'|'right'|'se'|'sw') {
  ev.preventDefault();
  ev.stopPropagation();

  const shell = (ev.currentTarget as HTMLElement).closest('.checkbox-input-shell') as HTMLElement | null;
  if (!shell) return;

  const r = shell.getBoundingClientRect();
  const startW  = field._checkW  ?? Math.round(r.width)  ?? 260;
  const startH  = field._checkH  ?? Math.round(r.height) ?? 40;
  const startML = field._checkML ?? 0;

  const startX = ev.pageX, startY = ev.pageY;
  const clamp = (v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
  const MIN_W=140, MAX_W=1200, MIN_H=28, MIN_ML=-240, MAX_ML=400;

  const prevC = document.body.style.cursor;
  const prevSel = (document.body.style as any).userSelect;
  document.body.style.cursor = (mode==='se'||mode==='sw') ? 'nwse-resize' : 'ew-resize';
  (document.body.style as any).userSelect = 'none';

  const onMove = (e: MouseEvent) => {
    const dx = e.pageX - startX;
    const dy = e.pageY - startY;

    let W=startW, H=startH, ML=startML;
    if (mode==='right'){ W = clamp(startW + dx, MIN_W, MAX_W); }
    else if (mode==='left'){ W = clamp(startW - dx, MIN_W, MAX_W); ML = clamp(startML + dx, MIN_ML, MAX_ML); }
    else if (mode==='se'){ W = clamp(startW + dx, MIN_W, MAX_W); H = Math.max(MIN_H, startH + dy); }
    else if (mode==='sw'){ W = clamp(startW - dx, MIN_W, MAX_W); H = Math.max(MIN_H, startH + dy); ML = clamp(startML + dx, MIN_ML, MAX_ML); }

    field._checkW  = Math.round(W);
    field._checkH  = Math.round(H);
    field._checkML = Math.round(ML);
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    document.body.style.cursor = prevC;
    (document.body.style as any).userSelect = prevSel;
  };

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
}
deleteCheckboxOption(field: FormField, idx: number): void {
  if (!field.options || idx < 0 || idx >= field.options.length) return;

  // remove the option
  field.options.splice(idx, 1);

  // keep at least one option
  if (field.options.length === 0) {
    field.options.push({ label: 'Option 1', value: 'opt1', checked: false });
  }

  // normalize labels/values after deletion
  field.options = field.options.map((o, i) => ({
    label: (o.label && o.label.trim()) || `Option ${i + 1}`,
    value: o.value ?? `opt${i + 1}`,
    checked: !!o.checked
  }));

  this.cdr.markForCheck();
}
  onDrop(event: CdkDragDrop<FormField[]>) {
  if (!event.isPointerOverContainer) return;

  const draggedField = event.item.data;

  // Get drop position (relative to the canvas/container)
  const containerEl = event.container.element.nativeElement;
  const containerRect = containerEl.getBoundingClientRect();
  const nativeEvent = event.event as MouseEvent;
  const clientX = nativeEvent?.clientX ?? 0;
  const clientY = nativeEvent?.clientY ?? 0;

  const paddingLeft = 10;
  const paddingTop = 10;
  const rawX = clientX - containerRect.left + containerEl.scrollLeft;
  const rawY = clientY - containerRect.top + containerEl.scrollTop;

  // ✅ If user drags a "Checkbox" palette item onto an existing checkbox field,
  // just append an option instead of adding a new field.
  if (draggedField?.type === 'checkbox') {
    const target = this.findCheckboxGroupAt(rawX, rawY);
    if (target) {
      this.addCheckboxOption(target);
      this.snackBar.open('Added checkbox option', 'Close', { duration: 1200 });
      return; // stop here — don’t create a new field
    }
  }

  // Otherwise keep your existing behavior (snap + add/move)
  const isExistingField = this.formPages[this.currentPage].fields.some(
    f => f.id === draggedField.id
  );

  const gridSize = 20;
  let snappedX = Math.round((rawX - paddingLeft) / gridSize) * gridSize;
  let snappedY = Math.round((rawY - paddingTop) / gridSize) * gridSize;

  const existingPositions = this.formPages[this.currentPage].fields
    .filter(f => f.id !== draggedField.id)
    .map(f => f.position);

  while (existingPositions.some(pos => pos?.x === snappedX && pos?.y === snappedY)) {
    snappedX += gridSize;
    snappedY += gridSize;
  }

  if (isExistingField) {
    const field = this.formPages[this.currentPage].fields.find(f => f.id === draggedField.id);
    if (field) field.position = { x: snappedX, y: snappedY };
  } else {
    // Prepare new field (as you had)
    this.newField = {
      ...draggedField,
      id: this.generateId(),
      label: draggedField.label || 'New Field',
      value: '',
      position: { x: snappedX, y: snappedY },
      width: 150
    };
    this.pendingFieldToAdd = this.newField;
    this.fieldConfigVisible = true;
  }

  this.initializeFreeDragPositions();
  this.fixDuplicateIds();
  this.cdr.detectChanges();
}

  onFieldDragStarted(e: CdkDragStart, f: FormField) {
  e.source.setFreeDragPosition(f.position || { x: 0, y: 0 });
}

onFieldDragMoved(_e: CdkDragMove, _f: FormField) { /* no-op */ }

onFieldDragEnded(event: CdkDragEnd, field: FormField) {
  if (this.isOverAnyGridCell) return; // grid cell drop owns it

  const pos = event.source.getFreeDragPosition();

  const grid = 20; // snap (optional)
  let x = Math.max(0, Math.round(pos.x / grid) * grid);
  let y = Math.max(0, Math.round(pos.y / grid) * grid);

  const canvas = document.getElementById('formCanvas');
  if (canvas) {
    const el = event.source.element.nativeElement as HTMLElement;
    const maxX = Math.max(0, canvas.clientWidth  - el.offsetWidth);
    const maxY = Math.max(0, canvas.clientHeight - el.offsetHeight);
    x = Math.min(x, maxX);
    y = Math.min(y, maxY);
  }

  field.position = { x, y };
  event.source.setFreeDragPosition(field.position);
  this.freeDragPositions[field.id] = field.position;
  this.cdr.markForCheck();
}

  onDragMoved(event: CdkDragMove<any>) {
    this.pointerPosition = { x: event.pointerPosition.x, y: event.pointerPosition.y };
      this.lastPointer   = { x: event.pointerPosition.x, y: event.pointerPosition.y };
  }
  prettyLabelForType(t: string): string {
    // fallbacks if no label given
    switch ((t || '').toLowerCase()) {
      case 'project-title': return 'Project Name';
      case 'id': return 'ID';
      case 'tel': return 'Phone';
      case 'signature': return 'Signature';
      case 'data-grid': return 'Data Grid';
      default: return (t || 'Field').replace(/-/g, ' ')
        .replace(/\b\w/g, m => m.toUpperCase());
    }
  }
  getCellAutoHeight(cell: GridCell, gm: GridMatrix): number {
  const base = gm?.cellH ?? 140;
  let max = base;
  for (const it of (cell?.items ?? [])) {
    const y = it.pos?.y ?? 6;
    const h = it.size?.h ?? 60;
    const bottom = y + h + 6; // padding
    if (bottom > max) max = bottom;
  }
  return max;
}

  ensureTagDefaults() {
    this.formPages.forEach(p =>
      p.fields.forEach(f => {
        if (!f.tagPos) f.tagPos = { x: 10, y: 8 };
        if (!f.label || !f.label.trim()) f.label = this.prettyLabelForType(f.type);
      })
    );
  }
 startSignatureResize(ev: MouseEvent, field: any, mode: 'left'|'right'|'se'|'sw') {
  ev.preventDefault();
  ev.stopPropagation();

  // match the HTML class below
  const shell = (ev.currentTarget as HTMLElement).closest('.sig-input-shell') as HTMLElement | null;
  if (!shell) return;

  // lock parent drag while resizing (cdkDrag)
  field._lockParentDrag = true;

  const canvas = shell.querySelector('canvas') as HTMLCanvasElement | null;

  const r = shell.getBoundingClientRect();
  const startW  = field._sigW  ?? Math.round(r.width)  ?? 300;
  const startH  = field._sigH  ?? Math.round(r.height) ?? 150;
  const startML = field._sigML ?? 0;

  const startX = ev.pageX, startY = ev.pageY;

  const clamp = (v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
  const MIN_W=180, MAX_W=1600, MIN_H=80, MIN_ML=-240, MAX_ML=600;

  // capture current drawing to restore after resize
  let prevImage: HTMLImageElement | null = null;
  let prevReady = false;
  if (canvas) {
    try {
      const url = canvas.toDataURL('image/png');
      if (url) {
        prevImage = new Image();
        prevImage.onload = () => { prevReady = true; };
        prevImage.src = url;
      }
    } catch {}
  }

  const prevC = document.body.style.cursor;
  const prevSel = (document.body.style as any).userSelect;
  document.body.style.cursor = (mode==='se'||mode==='sw') ? 'nwse-resize' : 'ew-resize';
  (document.body.style as any).userSelect = 'none';

  const applySize = (w:number, h:number, ml:number) => {
    field._sigW  = Math.round(w);
    field._sigH  = Math.round(h);
    field._sigML = Math.round(ml);

    shell.style.width  = `${field._sigW}px`;
    shell.style.height = `${field._sigH}px`;

    if (canvas) {
      const dpr = (window.devicePixelRatio || 1);

      // CSS size
      canvas.style.width  = `${field._sigW}px`;
      canvas.style.height = `${field._sigH}px`;

      // bitmap size
      canvas.width  = Math.max(1, Math.round(field._sigW * dpr));
      canvas.height = Math.max(1, Math.round(field._sigH * dpr));

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1,0,0,1,0,0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, field._sigW, field._sigH);

        if (prevImage && prevReady) {
          try { ctx.drawImage(prevImage, 0, 0, field._sigW, field._sigH); } catch {}
        }
      }
    }
  };

  const onMove = (e: MouseEvent) => {
    const dx = e.pageX - startX;
    const dy = e.pageY - startY;

    let W = startW, H = startH, ML = startML;

    if (mode === 'right') {
      W = clamp(startW + dx, MIN_W, MAX_W);
    } else if (mode === 'left') {
      W  = clamp(startW - dx, MIN_W, MAX_W);
      ML = clamp(startML + dx, MIN_ML, MAX_ML);
    } else if (mode === 'se') {
      W = clamp(startW + dx, MIN_W, MAX_W);
      H = Math.max(MIN_H, startH + dy);
    } else if (mode === 'sw') {
      W  = clamp(startW - dx, MIN_W, MAX_W);
      H  = Math.max(MIN_H, startH + dy);
      ML = clamp(startML + dx, MIN_ML, MAX_ML);
    }

    applySize(W, H, ML);
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    document.body.style.cursor = prevC;
    (document.body.style as any).userSelect = prevSel;

    field._lockParentDrag = false; // unlock
  };

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
}
  createField(): void {
    if (!this.pendingFieldToAdd) return;
    const f = { ...this.pendingFieldToAdd };
    f.label = (f.label || '').trim() || this.prettyLabelForType(f.type);
    f.tagPos = f.tagPos || { x: 10, y: 8 };

    if (!f.labelDock) f.labelDock = 'left';
    if (!f.inputWidth) f.inputWidth = 220;
    if (!f.labelPos) f.labelPos = { x: 12, y: 12 }; // free-drag start point
    if (!f.inputPos) f.inputPos = { x: 160, y: 12 };
    if (f.type === 'radio') {
      f.layout = f.layout || 'row';
    }
    // No need to restrict width to literals here, just ensure it's a number
    if (typeof f.width === 'string') {
      f.width = parseInt(f.width, 10);
    }
    if (f.type === 'date') {
  if (typeof f._dateW  !== 'number') f._dateW  = f.inputWidth;
  if (typeof f._dateH  !== 'number') f._dateH  = 36;
  if (typeof f._dateML !== 'number') f._dateML = 0;
}
if (f.type === 'signature') {
  if (typeof f._sigW  !== 'number') f._sigW  = f.inputWidth ?? 300;
  if (typeof f._sigH  !== 'number') f._sigH  = 150;
  if (typeof f._sigML !== 'number') f._sigML = 0;       // inline left margin when labelDock is left/right
  f.labelDock = f.labelDock || 'left';
}
    if (f.type === 'email') {
      f.arrange = f.arrange || 'dock';           // start inline
      f.labelDock = f.labelDock || 'left';         // label on the left
      f.inputWidth = f.inputWidth || 220;
      if (typeof f._emailLeft !== 'number') f._emailLeft = 0;
      if (typeof f._emailRight !== 'number') f._emailRight = 8;
      // free-drag defaults (used when arrange === 'free')
      f.tagPos = f.tagPos || { x: 10, y: 8 };
      f.inputPos = f.inputPos || { x: 12, y: 36 };
      f.inputSize = f.inputSize || { w: 220, h: 40 };
    }
    if (f.type === 'text') {
  if (typeof f._textW  !== 'number') f._textW  = f.inputWidth ?? 240;
  if (typeof f._textH  !== 'number') f._textH  = 36;
  if (typeof f._textML !== 'number') f._textML = 0;
}


// Radio
if (f.type === 'radio') {
  if (!Array.isArray(f.options) || !f.options.length) {
    f.options = [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }];
  }
  if (typeof f._radioW  !== 'number') f._radioW  = f.inputWidth ?? 260;
  if (typeof f._radioH  !== 'number') f._radioH  = 40;
  if (typeof f._radioML !== 'number') f._radioML = 0;
}

// File / Photo
if (f.type === 'file') {
  if (typeof f._fileW  !== 'number') f._fileW  = f.inputWidth ?? 220;
  if (typeof f._fileH  !== 'number') f._fileH  = 36;
  if (typeof f._fileML !== 'number') f._fileML = 0;
}
  if (f.type === 'checkbox') {
  if (!Array.isArray(f.options) || f.options.length === 0) {
    f.options = [
      { label: 'Option 1', value: 'opt1', checked: false },
      { label: 'Option 2', value: 'opt2', checked: false }
    ];
  }
  if (typeof f._checkW  !== 'number') f._checkW  = f.inputWidth ?? 260;
  if (typeof f._checkH  !== 'number') f._checkH  = 40;   // row height; grows as needed
  if (typeof f._checkML !== 'number') f._checkML = 0;
  f.labelDock = f.labelDock || 'left';
}
    
    f.isDescription = !!f.isDescription;
    if (f.isDescription) f.role = 'description';

    // Description defaults
    if (f.type === 'textarea') {
      if (f.isDescription) {
        if (!Array.isArray(f.problemItems)) f.problemItems = [];
        if (!Number.isFinite(f.nextNo as any)) f.nextNo = (f.problemItems.length || 0) + 1;
      }
      if (f.useTextarea === undefined) f.useTextarea = true;
      f.textareaPos = f.textareaPos || { x: 12, y: 36 };
      f.textareaSize = f.textareaSize || { w: 300, h: 120 };
    }
    if (f.type === 'textarea') {
  if (f.isDescription) {
    if (!Array.isArray(f.problemItems)) f.problemItems = [];
    if (!Number.isFinite(f.nextNo as any)) f.nextNo = (f.problemItems.length || 0) + 1;
  }
  if (f.useTextarea === undefined) f.useTextarea = true;
  f.textareaPos = f.textareaPos || { x: 12, y: 36 };
  f.textareaSize = f.textareaSize || { w: 300, h: 120 };
}

// Data grid: replace stub in-place (no duplicates)
if (f.type === 'data-grid') {
  const fields = this.formPages[this.currentPage].fields;
  const idx = fields.findIndex(ff => ff.id === f.id);

  const grid = this.makeDataGridField();
  grid.position = f.position;                   // keep drop position
  grid.label    = f.label || 'Data Grid';

  this.clampGridItems?.(grid);

  if (idx > -1) fields.splice(idx, 1, grid);
  else fields.push(grid);

  this.fixDuplicateIds?.();
  this.pendingFieldToAdd = null;
  this.cancelFieldConfig?.();

  this.cdr?.detectChanges?.();
  setTimeout(() => {
    this.initCanvases?.();
    this.initializeFreeDragPositions?.();
  }, 0);

  return; // stop here for data-grid
}
if (f.type === 'tel') {
  f._telW  = f._telW  ?? f.inputWidth ?? 220;
  f._telH  = f._telH  ?? 36;
  f._telML = f._telML ?? 0;
}

    f.id = this.generateId();

    if (f.type === 'project-title') f.value = f.value || '';
    if (f.type === 'branch') {
      f.options = [
        { value: '0', label: 'NSW' },
        { value: '1', label: 'Branch 0 - YATALA' },
        { value: '2', label: 'Branch 3 - MACKAY' }

      ];
        if (typeof f._branchW  !== 'number') f._branchW  = f.inputWidth;
  if (typeof f._branchH  !== 'number') f._branchH  = 36;
  if (typeof f._branchML !== 'number') f._branchML = 0;
    }

    this.formPages[this.currentPage].fields.push(f);
    this.fixDuplicateIds();
    this.pendingFieldToAdd = null;
    this.cancelFieldConfig();
    setTimeout(() => {
      this.initCanvases();
      this.initializeFreeDragPositions();
    }, 50);
  }
  private ensureEmailDefaultsOnAllFields(): void {
    this.formPages?.forEach(p =>
      p.fields?.forEach(f => {
        if (f.type === 'email') {
          if (typeof f._emailLeft !== 'number') f._emailLeft = 0;
          if (typeof f._emailRight !== 'number') f._emailRight = 8;
        }
      })
    );
  }
  cancelFieldConfig(): void {
    this.fieldConfigVisible = false;
    this.pendingFieldToAdd = null;
    this.newField = this.getEmptyField();
  }
  setArrange(f: FormField, mode: 'dock' | 'free') {
    f.arrange = mode;
    // optional: when switching to dock, snap widths nicely
    if (mode === 'dock') {
      f.labelWidth = f.labelWidth ?? 120;
      f.inputWidth = f.inputWidth ?? 220;
    }
    this.cdr.markForCheck();
  }
  removeField(pageIndex: number, field: FormField): void {
    this.isRemovingField = true;
    this.formPages[pageIndex].fields = this.formPages[pageIndex].fields.filter(f => f !== field);
    delete this.ctxMap[field.id];
    delete this.drawingMap[field.id];
    delete this.freeDragPositions[field.id];

    setTimeout(() => {
      this.initCanvases();
      this.isRemovingField = false;
      this.initializeFreeDragPositions();
    }, 50);
  }


setDock(field: any, dock: Dock) {
  field.labelDock = dock;
  this.cdr.markForCheck();
}

/** CONTAINER GRID:
 *  left  -> INPUT left,  LABEL right
 *  right -> INPUT right, LABEL left
 *  top   -> INPUT top,   LABEL bottom
 *  bottom-> INPUT bottom, LABEL top
 */
rowLayout(field: any) {
  const dock: Dock = field?.labelDock ?? 'left';
  const gap = '8px';
  const labelW =
    typeof field?.labelWidth === 'number' ? `${field.labelWidth}px` : 'max-content';

  switch (dock) {
    case 'left':   // input | label
      return {
        display: 'grid',
        gridTemplateColumns: `1fr ${labelW}`,
        alignItems: 'center',
        columnGap: gap,
        width: '100%',
      };
    case 'right':  // label | input
      return {
        display: 'grid',
        gridTemplateColumns: `${labelW} 1fr`,
        alignItems: 'center',
        columnGap: gap,
        width: '100%',
      };
    case 'top':    // input on top, label below
      return {
        display: 'grid',
        gridTemplateColumns: '1fr',
        gridTemplateRows: 'auto auto',
        rowGap: gap,
        width: '100%',
      };
    case 'bottom': // label on top, input below
      return {
        display: 'grid',
        gridTemplateColumns: '1fr',
        gridTemplateRows: 'auto auto',
        rowGap: gap,
        width: '100%',
      };
  }
}

/** LABEL cell position (opposite of input) */
labelStyle(field: any) {
  const dock: Dock = field?.labelDock ?? 'left';
  const base: any = { margin: 0, alignSelf: 'center', justifySelf: 'start' };

  switch (dock) {
    case 'left':   return { ...base, gridColumn: 2, gridRow: 1 }; // right side
    case 'right':  return { ...base, gridColumn: 1, gridRow: 1 }; // left side
    case 'top':    return { ...base, gridColumn: 1, gridRow: 2 }; // below
    case 'bottom': return { ...base, gridColumn: 1, gridRow: 1 }; // above
  }
}

/** INPUT/CONTROL cell position (matches the dock) */
ctrlStyle(field: any) {
  const dock: Dock = field?.labelDock ?? 'left';
  const base: any = { width: '100%' };

  switch (dock) {
    case 'left':   return { ...base, gridColumn: 1, gridRow: 1 }; // left
    case 'right':  return { ...base, gridColumn: 2, gridRow: 1 }; // right
    case 'top':    return { ...base, gridColumn: 1, gridRow: 1 }; // top
    case 'bottom': return { ...base, gridColumn: 1, gridRow: 2 }; // bottom
  }
}

  onEmptyLabelInput(event: Event, field: any): void {
    const target = event.target as HTMLElement;
    field.label = target.innerText.trim();
  }
  private ensureGridPositions(): void {
    this.formPages.forEach(page => {
      page.fields.forEach((field, index) => {
        if (field.row == null) {
          field.row = index + 1;
        }
        if (field.col == null) {
          field.col = (index % 2) + 1;
        }
      });
    });
  }

  private assignGridPositions() {
    const fields = this.formPages[this.currentPage].fields;
    fields.forEach((field, index) => {
      field.row = Math.floor(index / 2) + 1;
      field.col = (index % 2) + 1;
    });
  }
private clampGridItems(field: FormField) {
  const gm = field.gridMatrix;
  if (!gm || !gm.cells || !gm.rows || !gm.cols) return;

  const pad = 6;

  // ✅ Resolve a definite number for cellW and cache it back to gm.cellW
  const resolvedCellW = (() => {
    const c = gm.cellW;
    if (typeof c === 'number' && isFinite(c) && c > 0) return c;

    const gap = gm.gap ?? 12;
    const outerW = field.width ?? 480;
    const cols = Math.max(1, gm.cols || (gm.cells?.[0]?.length ?? 1));
    const totalGap = gap * (cols - 1);
    const usable = Math.max(80, outerW - totalGap); // no extra padding if CSS doesn't add it
    const v = Math.max(80, Math.floor(usable / cols));
    gm.cellW = v;    // cache for later calls
    return v;
  })();

  const cellH = gm.cellH ?? 140;

  gm.cells.forEach(row =>
    row.forEach(cell => {
      (cell.items || []).forEach(it => {
        const w0 = it.size?.w ?? 220;
        const h0 = it.size?.h ?? 60;

        const w = Math.min(w0, Math.max(40, resolvedCellW - pad * 2));
        const h = h0;

        const x0 = it.pos?.x ?? pad;
        const y0 = it.pos?.y ?? pad;

        const maxX = Math.max(pad, resolvedCellW - w - pad);
        const maxY = Math.max(pad, cellH - h - pad);

        const x = Math.max(pad, Math.min(x0, maxX));
        const y = Math.max(pad, Math.min(y0, maxY));

        it.pos = { x, y };
        it.size = { w, h };
      });
    })
  );
}
  private ensureFieldPositions(): void {
    this.formPages.forEach(page => {
      page.fields.forEach(field => {
        if (!field.position) {
          field.position = { x: 0, y: 0 };
        }
      });
    });
  }
  resizingField: any = null;
  startX = 0;
  startY = 0;
  startWidth = 0;
  startHeight = 0;
  resizeEdge: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null = null;
  startLeft = 0;
  startTop = 0;
  private readonly MIN_W = 10;
  private readonly MIN_H = 10;

  startResize(
    event: MouseEvent,
    field: any,
    isNearRight: boolean,
    isNearBottom: boolean,
    edge?: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'   // NEW optional arg
  ) {
    event.stopPropagation();
    event.preventDefault();

    this.resizingField = field;
    this.resizeEdge = edge ?? (isNearRight || isNearBottom ? 'se' : 'se'); // default to SE if old call
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.startWidth = field.width || 150;
    this.startHeight = field.height || 60;
    this.startLeft = field.position?.x ?? 0;
    this.startTop = field.position?.y ?? 0;

    document.addEventListener('mousemove', this.onResizeMove, true);
    document.addEventListener('mouseup', this.stopResize, true);
  }
  onFieldDroppedIntoGrid(event: CdkDragDrop<any>, gridField: any) {
    const dropped = event.item?.data;
    if (!gridField || !dropped) return;

    gridField.gridConfig ??= { columns: [] };
    const cols = gridField.gridConfig.columns;

    // Build a unique column id from the field
    const base = ((dropped.id || dropped.label || 'col') + '')
      .trim().toLowerCase().replace(/\s+/g, '_');
    let id = base, i = 1;
    while (cols.some((c: any) => c.id === id)) id = `${base}_${i++}`;

    // Store a LIGHT copy of the field as fieldDef (no position/drag stuff)
    const fieldDef = {
      type: dropped.type,
      label: dropped.label,
      placeholder: dropped.placeholder,
      options: dropped.options ? dropped.options.map((o: any) => ({ ...o })) : undefined
    };

    cols.push({
      id,
      label: dropped.label || 'Column',
      fieldDef,          // 👈 the original field definition for rendering
      type: fieldDef.type === 'radio' ? 'select' : fieldDef.type  // radio behaves as a select in cells
    });

    // Ensure each row has the new key
    gridField.rows = (gridField.rows || []).map((r: any) => ({ [id]: r[id] ?? (fieldDef.type === 'checkbox' ? [] : ''), ...r }));
  }

  /** Convert a palette field to a grid column config */
  makeGridColumnFromField(field: any, existingCols: any[] = []) {
    const base = ((field.id || field.label || 'col') + '').trim().toLowerCase().replace(/\s+/g, '_');
    let id = base, i = 1;
    while (existingCols.some(c => c.id === id)) id = `${base}_${i++}`;

    const map: Record<string, string> = {
      text: 'text', number: 'number', date: 'date',
      select: 'select', radio: 'select', checkbox: 'select',
      email: 'text', tel: 'text', textarea: 'text', id: 'text', 'project-title': 'text'
    };

    const type = map[field.type] || 'text';
    const options = (type === 'select')
      ? (field.options || []).map((o: any) => o.value ?? o.label).filter(Boolean)
      : undefined;

    return { id, label: field.label || 'Column', type, options };
  }

  /** Rename a column from inline contenteditable */
  renameGridColumn(gridField: any, colIndex: number, newLabel: string) {
    const col = gridField?.gridConfig?.columns?.[colIndex];
    if (col) col.label = (newLabel || col.label || '').trim();
  }
  addGridRow(gridField: any) {
    const cols = gridField?.gridConfig?.columns || [];
    const empty = cols.reduce((acc: any, c: any) => {
      acc[c.id] = c.fieldDef?.type === 'checkbox' ? [] : '';
      return acc;
    }, {});
    gridField.rows = [...(gridField.rows || []), empty];
  }


  removeGridRow(gridField: any, rowIndex: number) {
    (gridField.rows || []).splice(rowIndex, 1);
    gridField.rows = [...(gridField.rows || [])];
  }

  updateGridCell(field: FormField, rowIndex: number, colId: string, value: any): void {
    if (field.type !== 'data-grid' || !field.rows?.[rowIndex]) return;
    field.rows[rowIndex][colId] = value;
  }

  addGridColumn(field: FormField): void {
    if (field.type !== 'data-grid') return;
    const id = 'col' + Math.random().toString(36).slice(2, 6);
    const col: DataGridColumn = { id, label: 'Column', type: 'text' };
    field.gridConfig = field.gridConfig || { columns: [] };
    field.gridConfig.columns = [...field.gridConfig.columns, col];
    // backfill value for existing rows
    field.rows?.forEach(r => (r[id] = null));
  }

  removeGridColumn(gridField: any, colIndex: number) {
    const cols = gridField?.gridConfig?.columns || [];
    const col = cols[colIndex];
    if (!col) return;
    cols.splice(colIndex, 1);
    gridField.rows = (gridField.rows || []).map((r: any) => {
      const { [col.id]: _omit, ...rest } = r || {};
      return rest;
    });
  }
  onResizeMove = (event: MouseEvent) => {
    if (!this.resizingField) return;

    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;

    const edge = this.resizeEdge ?? 'se';

    let newW = this.startWidth;
    let newH = this.startHeight;
    let newLeft = this.startLeft;
    let newTop = this.startTop;

    const fromN = edge.includes('n');
    const fromS = edge.includes('s');
    const fromW = edge.includes('w');
    const fromE = edge.includes('e');

    // Horizontal
    if (fromE) newW = this.startWidth + dx;
    if (fromW) { newW = this.startWidth - dx; newLeft = this.startLeft + dx; }

    // Vertical
    if (fromS) newH = this.startHeight + dy;
    if (fromN) { newH = this.startHeight - dy; newTop = this.startTop + dy; }

    // Clamp to small positive sizes so handles remain usable
    newW = Math.max(this.MIN_W, Math.round(newW));
    newH = Math.max(this.MIN_H, Math.round(newH));

    this.resizingField.width = newW;
    this.resizingField.height = newH;
    this.resizingField.position = { x: Math.round(newLeft), y: Math.round(newTop) };
  };

  stopResize = (event: MouseEvent) => {
    document.removeEventListener('mousemove', this.onResizeMove, true);
    document.removeEventListener('mouseup', this.stopResize, true);
    this.resizingField = null;
    this.resizeEdge = null;
  };

  loadFormById(formId: string): void {
    const form = this.savedForms.find(f => f.formId === formId);
    if (!form) { return; }

    this.selectedForm = form;
    this.isEditingMaster = true;

    this.formPages = JSON.parse(JSON.stringify(form.formPages));
    this.formPages.forEach(p =>
  p.fields
    .filter(f => f.type === 'data-grid')
    .forEach(f => this.clampGridItems(f))
);

    this.fixDuplicateIds();
    this.checkDuplicateIds();

    this.currentPage = 0;
    this.currentFormId = form.formId;
    this.dashboardVisible = false;
    this.formBuilderVisible = true;
    this.formListVisible = false;


    this.cdr.detectChanges();

    setTimeout(() => {
      this.initCanvases();
      this.initializeFreeDragPositions();
    }, 0);
  }
  listBranchFilter: Branch = 'ALL';

  // computed list the table will use
  get filteredSavedForms(): SavedForm[] {
    // what we should filter by (but don't assign!)
    const target: Branch =
      !this.canManageAllBranches && this.currentBranch && this.currentBranch !== 'ALL'
        ? this.currentBranch
        : this.listBranchFilter;

    if (target === 'ALL') return this.savedForms ?? [];

    return (this.savedForms ?? []).filter(f => {
      const vis = f.allowedBranches?.length ? f.allowedBranches : (['ALL'] as Branch[]);
      return vis.includes('ALL') || vis.includes(target);
    });
  }
openToFill(form: SavedForm) {
  this.router.navigate(['/forms/fill'], { state: { template: form } });
}
  backToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
  async loadSavedFormsList(kind: 'local' | 'firebase' | 'both' = 'both'): Promise<void> {
    try {
      // 1) Local templates (savedFormPages)
      const localRaw = localStorage.getItem('savedFormPages');
      const local: SavedForm[] = localRaw ? JSON.parse(localRaw) : [];

      const localNorm: SavedForm[] = local.map(it => ({
        formId: it.formId || this.generateId(),
        formName: it.formName || 'Untitled',
      
        formPages: this.cloneAndRehydrate(it.formPages),
        firebaseId: it.firebaseId ?? undefined,
        allowedBranches: it.allowedBranches || ['ALL']
      }));

      // If only local requested
      if (kind === 'local') {
        this.savedForms = localNorm.map(f => ({
          ...f,
          allowedBranches: this.normalizeBranches(f.allowedBranches),
          _uiSelection: this.normalizeBranches(f.allowedBranches),
        }));
        this.formListVisible = true;
        this.formBuilderVisible = false;
        this.listBranchFilter = 'ALL';     // <— show everything by default
        return;
      }
      // 2) Firebase templates
      const remote = (kind === 'firebase' || kind === 'both')
        ? await this.formService.getFormTemplates()
        : [];

      const remoteNorm: SavedForm[] = (remote || []).map((it: any) => ({
        formId: it.formId,                  // ✅ use the service's formId
        formName: it.formName || 'Untitled',
  formPages: this.cloneAndRehydrate(it.formPages),
        firebaseId: it.firebaseId,
        allowedBranches: it.allowedBranches || ['ALL'],           // ✅ use the service's firebaseId
      }));

      if (kind === 'firebase') {
        this.savedForms = remoteNorm.map(f => ({
          ...f,
          allowedBranches: this.normalizeBranches(f.allowedBranches),
          _uiSelection: this.normalizeBranches(f.allowedBranches),
        }));
        this.formListVisible = true;
        this.formBuilderVisible = false;
        this.listBranchFilter = 'ALL';
        return;
      }

      // 3) Merge (both): prefer Firebase copy when the same firebaseId exists locally
      const byFb = new Map<string, SavedForm>();
      remoteNorm.forEach(r => { if (r.firebaseId) byFb.set(r.firebaseId, r); });

      const merged: SavedForm[] = [];
      const seenLocal = new Set<string>();

      // take local, but replace with remote if same firebaseId exists
      for (const l of localNorm) {
        if (l.firebaseId && byFb.has(l.firebaseId)) {
          merged.push(byFb.get(l.firebaseId)!);
          seenLocal.add(l.firebaseId);
        } else {
          merged.push(l);
        }
      }

      // add any remote that didn’t have a local counterpart
      for (const r of remoteNorm) {
        if (r.firebaseId && seenLocal.has(r.firebaseId)) continue;
        if (merged.some(m => m.formId === r.formId)) continue;
        merged.push(r);
      }

      // --- build an index of remote by normalized name ---
      const remoteByName = new Map<string, SavedForm>();
      for (const r of remoteNorm) {
        const key = (r.formName || '').trim().toLowerCase();
        if (key) remoteByName.set(key, r);
      }


      // --- swap local-only items to their remote twin when names match ---
      const reconciled: SavedForm[] = merged.map(item => {
        const hasFb = !!item.firebaseId && item.firebaseId.trim().length > 0;
        if (hasFb) return item;
        const key = (item.formName || '').trim().toLowerCase();
        const remoteMatch = key ? remoteByName.get(key) : undefined;
        return remoteMatch ?? item;
      });

      // --- finally collapse duplicates by identity & by name (prefer remote) ---
      let cleaned = this.dedupeByIdentity(reconciled);

      cleaned = this.dedupeByNamePreferRemote(cleaned);
      const unique = cleaned.map(f => ({
        ...f,
        allowedBranches: this.normalizeBranches(f.allowedBranches),
        _uiSelection: this.normalizeBranches(f.allowedBranches),
      }));
      this.savedForms = cleaned;
      this.formListVisible = true;
      this.formBuilderVisible = false;
      this.listBranchFilter = 'ALL';   // show everything initially
      return;

    } catch (e) {
      console.error('Failed to load templates', e);
      this.snackBar.open('Failed to load templates.', 'Close', { duration: 3000 });
    }


  }
  private dedupeByNamePreferRemote(list: SavedForm[]): SavedForm[] {
    const byName = new Map<string, SavedForm>();

    for (const r of list) {
      const key = (r.formName || '').trim().toLowerCase();
      if (!key) {
        // unnamed forms: keep as-is (give them a random key so they don't collapse together)
        byName.set(Math.random().toString(), r);
        continue;
      }

      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, r);
        continue;
      }

      // prefer the one that has firebaseId
      if (!existing.firebaseId && r.firebaseId) {
        byName.set(key, r);
      }
    }

    return Array.from(byName.values());
  }
  private nextUntitledName(): string {
    const n = new Date();
    const pad = (x: number) => x.toString().padStart(2, '0');
    return `Untitled ${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())} ${pad(n.getHours())}${pad(n.getMinutes())}`;
  }
public gridCellWFromWrapper(f: any): number {
  const gm   = f?.gridMatrix || {};
  const cols = Math.max(1, gm.cols ?? (f?.gridMatrix?.cells?.[0]?.length || 1));
  const gap  = Math.max(0, gm.gap ?? 12);
  const wrapW = Math.max(40, Math.round(f?.width ?? 300));
  return Math.max(40, Math.floor((wrapW - gap * (cols - 1)) / cols));
}

// was: private gridCellHFromWrapper(...)
public gridCellHFromWrapper(f: any): number {
  const gm   = f?.gridMatrix || {};
  const rows = Math.max(1, gm.rows ?? (f?.gridMatrix?.cells?.length || 1));
  const gap  = Math.max(0, gm.gap ?? 12);
  const wrapH = Math.max(40, Math.round(f?.height ?? 240));
  return Math.max(40, Math.floor((wrapH - gap * (rows - 1)) / rows));
}

// ensure this is public too
public gridColsCss(f: any): string {
  const cols  = Math.max(1, f?.gridMatrix?.cols ?? (f?.gridMatrix?.cells?.[0]?.length || 1));
  const cellW = this.gridCellWFromWrapper(f);
  return `repeat(${cols}, ${cellW}px)`;
}
  
async saveForm(): Promise<void> {
  if (!this.formPages?.[0]?.fields?.length) {
    this.snackBar.open('Cannot save an empty form', 'Close', { duration: 2500 });
    return;
  }

  // 1) Capture signatures (skip safely if canvas is not present)
  try {
    this.formPages.forEach(p =>
      p.fields.forEach(f => {
        if (f.type === 'signature') {
          const ref = this.canvasRefs?.find(r => r.nativeElement.getAttribute('data-id') === f.id);
          if (ref?.nativeElement) {
            f.value = ref.nativeElement.toDataURL();
          }
        }
      })
    );
  } catch { /* ignore capture errors to avoid blocking save */ }
  this.captureCurrentLayoutForSave(this.formPages);
  // 2) Load current local list
  const local = this.readLocalTemplates();

  // 3) Figure out name + firebaseId without prompting if editing
  const localIdxById = this.currentFormId
    ? local.findIndex(x => x.formId === this.currentFormId)
    : -1;

  let name = (this.selectedForm?.formName || local[localIdxById]?.formName || '').trim();
  let existingFirebaseId = (this.selectedForm?.firebaseId || local[localIdxById]?.firebaseId || null) || null;

  if (!this.currentFormId && !this.selectedForm) {
    const raw = prompt('Enter template name:', 'form') || '';
    name = raw.trim();
    if (!name) {
      this.snackBar.open('Please enter a valid name.', 'Close', { duration: 2500 });
      return;
    }
  }
  if (!name) name = 'Untitled';

  const selection = (this.selectedForm?.allowedBranches?.length
    ? [...this.selectedForm.allowedBranches!]
    : [...this.selectedBranches]);

  let allowedForThis: Branch[];    // master doc
  let branchesToMirror: Branch[];  // concrete branch copies

  if (!this.canManageAllBranches) {
    const b = (this.currentBranch ?? 'ALL');
    const concrete = (b === 'ALL') ? ['MACKAY', 'YAT', 'NSW'] as Branch[] : [b as Branch];
    allowedForThis = concrete;
    branchesToMirror = concrete;
  } else {
    allowedForThis = selection.length ? selection : (['ALL'] as Branch[]);
    branchesToMirror = selection.includes('ALL')
      ? ['MACKAY', 'YAT', 'NSW']
      : selection.filter(x => x !== 'ALL');
  }
this.formPages.forEach(p =>
  p.fields
    .filter(f => f.type === 'data-grid')
    .forEach(f => this.clampGridItems(f))
);
  // 🚩 NEW: build a deep copy and normalize grids BEFORE saving
  const pagesToSave = serializeForFirestorePages(this.formPages);

  // 4) Save to Firebase (update when firebaseId exists; else create)
  let firebaseId = '';
  try {
    if (existingFirebaseId && existingFirebaseId.trim()) {
      // UPDATE master
      await this.formService.updateFormTemplate(existingFirebaseId, {
        formName: name,
        formPages: pagesToSave,                // <<< use normalized pages
        allowedBranches: allowedForThis,
      });

      // ✅ ALSO UPDATE branch copies
      await this.formService.updateTemplateInBranches(
        existingFirebaseId,
        { formName: name, formPages: pagesToSave, allowedBranches: allowedForThis }, // <<< use normalized pages
        branchesToMirror
      );

      firebaseId = existingFirebaseId;
    } else {
      // CREATE master + DUPLICATE into branches
      firebaseId = await this.formService.saveFormTemplateToBranches(
        name,
        pagesToSave,                             // <<< use normalized pages
        branchesToMirror,
        allowedForThis
      );
    }
  } catch (e) {
    console.error('Firebase save failed', e);
    this.snackBar.open('Saved locally. Firebase save failed.', 'Close', { duration: 3000 });
  }

  allowedForThis = this.normalizeBranches(allowedForThis);
  branchesToMirror = this.normalizeBranches(branchesToMirror).filter(b => b !== 'ALL');

  // 5) Build final record (store normalized pages locally too)
  const idToUse = this.currentFormId || this.selectedForm?.formId || this.generateId();
  const record: SavedForm = {
    formId: idToUse,
    formName: name,
    formPages: pagesToSave,                     // <<< use normalized pages
    firebaseId: firebaseId && firebaseId.trim() ? firebaseId : undefined,
    allowedBranches: allowedForThis,
  };

  // 6) Merge into local list by identity (prefers firebaseId)
  const idx = this.findRecordIndex(local, { formId: idToUse, firebaseId: record.firebaseId || null });
  if (idx >= 0) {
    local[idx] = record;
  } else {
    local.push(record);
  }

  // 7) Persist and sync in-memory list (dedupe by identity)
  this.writeLocalTemplates(local);

  // 8) Update component state consistently
  this.currentFormId = idToUse;
  this.selectedForm = record;
  this.selectedBranches = [...allowedForThis];
  this.snackBar.open('Template saved.', 'Close', { duration: 2000 });
}
  displayBranches(f: SavedForm): string[] {
    const ab = this.normalizeBranches(f?.allowedBranches);
    return ab.includes('ALL') ? ['ALL'] : ab;
  }
  saveFilledForm(): void {
    if (this.hasRequiredMissing()) {
      const missing = this.missingRequiredList().join(', ');
      this.snackBar.open(`Please fill required fields: ${missing}`, 'Close', { duration: 3000 });
      return;
    }
    const filledForms = JSON.parse(localStorage.getItem('filledForms') || '[]');

    const projectNameField = this.formPages[0].fields.find(f => f.id === 'project-title' || f.label === 'Project Name');
    const filledFormName = projectNameField?.value?.trim();

    if (!filledFormName || filledFormName.trim() === '') {
      alert('Please enter a valid name.');
      return;
    }

    filledForms.push({
      filledFormId: this.generateId(),
      templateFormId: this.currentFormId,
      formName: filledFormName,
      formPages: this.formPages,
      savedAt: new Date().toISOString()
    });

    localStorage.setItem('filledForms', JSON.stringify(filledForms));
    alert('Filled form saved successfully!');
  }


  exportToPDF(): void {
    const filename = prompt('Enter filename for PDF', 'form');
    if (!filename) return;

    this.ensureFieldPositions();  // Keeps your positions valid in UI (safe to leave)

    const canvas = document.querySelector('.form-canvas');
    if (!canvas) {
      alert('No canvas found!');
      return;
    }


    // Clone canvas to avoid modifying original
    const clone = canvas.cloneNode(true) as HTMLElement;
    clone.style.position = 'relative';
    clone.style.width = '794px';   // A4 width in px at 96dpi
    clone.style.height = '1123px'; // A4 height in px at 96dpi
    clone.style.overflow = 'visible';
    const formCanvas = clone.querySelector('.form-canvas') as HTMLElement;
    if (formCanvas) {
      formCanvas.style.display = 'flex';
      formCanvas.style.flexWrap = 'nowrap';  // prevent wrap to keep 6 fields in one row
      formCanvas.style.justifyContent = 'flex-start';
      formCanvas.style.gap = '8px';
      formCanvas.style.width = '100%';
    }

    // Reset positioning for print-friendly output
    clone.querySelectorAll('.field').forEach((field: Element) => {
      const el = field as HTMLElement;
      const originalField = document.querySelector(`.field[data-id="${el.getAttribute('data-id')}"]`) as HTMLElement;

      if (el) {
        el.style.position = 'relative';
        el.style.left = '0';
        el.style.top = '0';
        el.style.marginBottom = '10px';
        el.style.width = el.offsetWidth + 'px';         // shrink width to fit 6 fields per row (794 / 6 ≈ 132px, 120px leaves margin)
        el.style.boxSizing = 'border-box';
        el.style.display = 'inline-block';  // inline block to sit side by side
        el.style.marginRight = '8px';
      }     // some gap between fields
    });

    // If you have a row container, also set flex styles to prevent wrapping (optional)
    const row = clone.querySelector('.fields-row');
    if (row) {
      const rowEl = row as HTMLElement;
      rowEl.style.display = 'flex';
      rowEl.style.flexWrap = 'nowrap';
      rowEl.style.justifyContent = 'flex-start'; // align left, or 'space-between' if you want gaps to spread out
    }

    // Create a hidden container to hold cloned content
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '-10000px';
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    // Generate PDF
    import('html2pdf.js').then((html2pdf) => {
      html2pdf.default()
        .from(clone)
        .set({
          filename: `${filename}.pdf`,
          margin: 10,
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .save()
        .then(() => {
          document.body.removeChild(wrapper); // Clean up
        });
    });
  }

  private initCanvases(): void {
    this.ctxMap = {};
    this.drawingMap = {};

    this.canvasRefs.forEach(ref => {
      const canvas = ref.nativeElement;
      const fieldId = canvas.getAttribute('data-id')!;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;

      // Setup canvas size with devicePixelRatio for sharpness
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      canvas.style.width = width + 'px';     // <-- important!
      canvas.style.height = height + 'px';   // <-- important!
      ctx.scale(devicePixelRatio, devicePixelRatio);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      this.ctxMap[fieldId] = ctx;
      this.drawingMap[fieldId] = false;

      // Attach pointer event handlers
      canvas.onpointerdown = e => this.startDrawing(e, fieldId);
      canvas.onpointermove = e => this.draw(e, fieldId);
      canvas.onpointerup = e => this.stopDrawing(e, fieldId);
      canvas.onpointerleave = e => this.stopDrawing(e, fieldId);
    });
  }

  startDrawing(e: PointerEvent, fieldId: string): void {
    console.log('startDrawing', fieldId);
    const ctx = this.ctxMap[fieldId];
    const canvas = this.getCanvasById(fieldId);
    if (!ctx || !canvas) return;
    const pos = this.getPointerPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    this.drawingMap[fieldId] = true;
  }

  draw(e: PointerEvent, fieldId: string): void {
    if (!this.drawingMap[fieldId]) return;
    const ctx = this.ctxMap[fieldId];
    const canvas = this.getCanvasById(fieldId);
    if (!ctx || !canvas) return;
    const pos = this.getPointerPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }
stopDrawing(e: PointerEvent, fieldId: string): void {
  if (!this.drawingMap[fieldId]) return;

  const ctx = this.ctxMap[fieldId];
  this.drawingMap[fieldId] = false;
  ctx?.closePath();

  // ✅ save the drawn signature into the field's value
  const canvas = this.getCanvasById(fieldId);
  if (!canvas) return;

  const dataUrl = canvas.toDataURL('image/png');
  const field = this.formPages[this.currentPage].fields.find(f => f.id === fieldId);
  if (field) field.value = dataUrl;

  // (optional) mark for change detection if needed
  this.cdr.markForCheck();
}

  getCanvasById(fieldId: string): HTMLCanvasElement | undefined {
    return this.canvasRefs.find(ref => ref.nativeElement.getAttribute('data-id') === fieldId)?.nativeElement;
  }

  clearCanvas(fieldId: string): void {
    const canvas = this.getCanvasById(fieldId);
    if (!canvas) return;
    const ctx = this.ctxMap[fieldId];
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.drawingMap[fieldId] = false;
    }
  }


  clearSignatureCanvas(fieldId: string): void {
    const canvas = this.getCanvasById(fieldId);
    if (!canvas) return;
    const ctx = this.ctxMap[fieldId];
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.drawingMap[fieldId] = false;

      const field = this.formPages[this.currentPage].fields.find(f => f.id === fieldId);
      if (field) {
        field.value = null;
      }
    }
  }
  addNewPage(): void {
    this.formPages.push({ fields: [] });
    this.currentPage = this.formPages.length - 1;
    this.cdr.detectChanges();
  }

  nextPage(): void {
    if (this.currentPage < this.formPages.length - 1) {
      this.currentPage++;
    }
  }

  prevPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
    }
  }
  closeConfig(): void {
    this.fieldConfigVisible = false;
  }



  clearCanvasAfterDrop(): void {
    this.canvasRefs.forEach(ref => {
      const canvas = ref.nativeElement;
      const fieldId = canvas.getAttribute('data-id')!;
      const ctx = this.ctxMap[fieldId];
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawingMap[fieldId] = false;
      }
    });
  }


  getPointerPos(e: PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  onCanvasMouseDown(event: MouseEvent, field: FormField): void {
    const id = field.id;
    const ctx = this.ctxMap[id];
    if (!ctx) return;

    this.drawingMap[id] = true;
    ctx.beginPath();

    const canvas = event.target as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    ctx.moveTo(x, y);
  }

  onCanvasMouseMove(event: MouseEvent, field: FormField): void {
    if (!this.drawingMap[field.id]) return;
    const ctx = this.ctxMap[field.id];
    if (!ctx) return;

    const canvas = event.target as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  }

  onCanvasMouseUp(event: MouseEvent, field: FormField): void {
    const ctx = this.ctxMap[field.id];
    if (!ctx) return;

    this.drawingMap[field.id] = false;

    const canvas = event.target as HTMLCanvasElement;
    field.value = canvas.toDataURL();

    this.cdr.detectChanges();
  }



  onFieldMouseDown(event: MouseEvent, field: FormField): void {
    // If click near bottom-right corner, start resizing
    const target = event.target as HTMLElement;
    const rect = target.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const resizeThreshold = 10;
    const isNearRight = offsetX >= rect.width - resizeThreshold;
    const isNearBottom = offsetY >= rect.height - resizeThreshold;

    if (isNearRight || isNearBottom) {
      // Provide all parameters, though defaults will work
      this.startResize(event, field, isNearRight, isNearBottom);
    }
  }

  fixDuplicateIds(): void {
    const allFields = this.formPages.flatMap(page => page.fields);
    const idCount: Record<string, number> = {};

    allFields.forEach(field => {
      if (!field.id) {
        field.id = this.generateId();
      }
      idCount[field.id] = (idCount[field.id] || 0) + 1;
    });

    allFields.forEach(field => {
      if (idCount[field.id] > 1) {
        field.id = this.generateId();
      }
    });
  }

  checkDuplicateIds(): void {
    const allFields = this.formPages.flatMap(page => page.fields);
    const ids = allFields.map(f => f.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicates.length > 0) {
      alert('Duplicate field IDs found! Please fix.');
    }
  }

  // New helper method for *ngFor trackBy to improve rendering
  trackByFieldId(index: number, field: FormField): string {
    return field.id;
  }

  // Needed if you want to handle mousemove on fields (optional)
  onFieldMouseMove(event: MouseEvent, field: FormField) {
    // Can be empty or do something if needed
  }

  // For handling contenteditable input changes, if any field uses it (optional)
  onContentEditableInput(event: Event, field: FormField) {
    const target = event.target as HTMLElement;
    field.value = target.innerText;
  }

  // Sample onSubmit handler for submit button (adjust to your needs)
  onSubmit() {
    if (this.hasRequiredMissing()) {
      const missing = this.missingRequiredList().join(', ');
      this.snackBar.open(`Please fill required fields: ${missing}`, 'Close', { duration: 3000 });
      return;
    }
    alert('Form submitted! You can extend this logic.');
  }
  onDragStart(event: DragEvent, index: number): void {
    this.isDragging[index] = true;
  }

  onDragEnd(event: DragEvent, index: number): void {
    this.isDragging[index] = false;
  }
}
