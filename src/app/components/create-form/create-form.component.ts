import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChildren,
  ViewChild,
  QueryList,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  TemplateRef,
  OnDestroy,
} from '@angular/core';

import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as html2pdf from 'html2pdf.js';
import { getDocument, PDFDocumentProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.entry';
import { FormService } from 'src/app/services/form.service';
import { Subscription, firstValueFrom } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import type { SavedForm as ServiceSavedForm } from 'src/app/services/form.service';


pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// use a single, modest scale everywhere to keep things fast
const SNAPSHOT_SCALE = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
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
/* ---------------- Types ---------------- */
function beginCapture(el: HTMLElement): () => void {
  const edited: Array<{ node: HTMLElement; prev: string | null }> = [];
  el.querySelectorAll<HTMLElement>('*').forEach((node) => {
    const st = node.style;
    const had = node.getAttribute('style');
    const cs = getComputedStyle(node);
    if (['auto', 'scroll'].includes(cs.overflow) || ['auto', 'scroll'].includes(cs.overflowY)) {
      st.overflow = 'visible';
      st.overflowY = 'visible';
    }
    edited.push({ node, prev: had });
  });
  return () =>
    edited.forEach(({ node, prev }) => {
      if (prev === null) node.removeAttribute('style');
      else node.setAttribute('style', prev);
    });
}

interface FormField {
  id: string;
  label?: string;
  type?: string;
  value?: any;
  placeholder?: string;
    gridMode?: 'matrix' | 'table';
  gridMatrix?: GridMatrix;

  // absolute placement of the outer card
  position?: { x: number; y: number };
  width?: number | null;
  height?: number | null;

  // shared UI layout
  labelDock?: 'top' | 'left' | 'right' | 'bottom';
  inputWidth?: number | null;

  // inner sizes per-control (use the ones you actually bind in templates)
  _emailW?: number;  _emailH?: number;  _emailML?: number;
  _dateW?: number;   _dateH?: number;   _dateML?: number;
  _branchW?: number; _branchH?: number; _branchML?: number;
  _checkW?: number;  _checkH?: number;  _checkML?: number;

  options?: { value: string; label: string; checked?: boolean }[];
  ui?: {
    direction?: 'row' | 'column'; // horizontal like template or vertical stack
    labelWidthPx?: number;        // label width for 'row'
    gapPx?: number;               // gap between label and control
  };
  required?: boolean;
  problemItems?: { no: number; text: string }[];
  problemCounter?: number;
  isDescription?: boolean;
}
interface FormPage {
  fields: FormField[];
    offsetX?: number;  
  offsetY?: number; 
}

interface SavedForm extends ServiceSavedForm {
  formId: string;
  formName: string;
  formPages: FormPage[];              // ⬅️ this is the key
  source: 'template' | 'filled';
  pdfUrl?: string | null;
  sourceFormId?: string | null;
  name?: string;
  title?: string;
  firebaseId?: string;  
   allowedBranches?: Branch[];              // if you use it
}

interface FilledFormData {
  formId: string;
  name: string;
  data: Record<string, any>;
  formPagesSnapshot?: FormPage[];
  formPdfPreview?: string | null;
}
export interface GridItem {
  id: string;
type: 'text' | 'number' | 'date' | 'textarea' | 'select' | 'file'; 
  label: string;
  value?: any;
  options?: { label: string; value?: string }[];
    pos?: { x: number; y: number };     // position inside the cell (px, relative)
  size?: { w: number; h: number }; 
}
export interface GridCell { items: GridItem[]; }
export interface GridMatrix {
  rows: number;
  cols: number;
gap?: number;
  cellH?: number;
    cellW?: number;  
  showBorders?: boolean;
  // could be many shapes in saved JSON:
  cells?: GridCell[][] | GridCell[];          // 2D or flat
  matrix?: GridCell[][];                      // alt name
  data?: { rows: Array<{ cols?: GridCell[]; cells?: GridCell[] }>; }; // row/col objects
}

interface DataGridField {
  id: string;
  type: 'data-grid'|'datagrid'|'grid'|'matrix';
  label?: string;
  required?: boolean;
  height?: number;
  width?: number;
    gridMode?: string; 
  gridMatrix: GridMatrix;
}

interface FilledInstance {
  instanceId: string | null;
  templateId?: string;
  formName: string;
  formPagesSnapshot: FormPage[];
  data: Record<string, any>;
  preview?: string | null;
  updatedAt: number;
}
type Branch = 'MACKAY' | 'YAT' | 'NSW' | 'ALL';
/* ---------------- Component ---------------- */
type FillLayoutMode = 'exact' | 'flow';  
@Component({
  selector: 'app-create-form',
  templateUrl: './create-form.component.html',
  styleUrls: ['./create-form.component.scss'],
})

export class CreateFormComponent implements OnInit, AfterViewInit, OnDestroy {
    fillLayoutMode: FillLayoutMode = 'exact';  
    isBuilderMode = true;
private readonly GRID_STRICT_FULL_CELL = true; // fill entire cell
  private readonly GRID_CELL_PAD_PX = 8;         // inner padding
  private readonly GRID_REPLACE_EXISTING = true; // one item per cell
trackByIndex(index: number): number { return index; }
  private textareasSub?: Subscription;
  examplePdfUrl: string | null = null;
calendarLocked = true;
  forms: SavedForm[] = [];
  templates: SavedForm[] = [];
filledForms: SavedForm[] = [];
  showFormEditor = false;
  showNameInput = false;
  nameError = false;
  containerHeight: number = 600;
  formPdfImagePreview: string | null = null;
  isLoadedFromDashboard = true;
  viewMode: 'default' | 'filled' | 'tofill' = 'default';
   hasPdf(f: SavedForm): boolean        { return !!f.pdfUrl; }
  canEdit(_f: SavedForm): boolean      { return true; }
  canDelete(f: SavedForm): boolean     { return f.source === 'filled'; }
  isFirebaseForm(f: SavedForm): boolean{ return !String(f.formId).startsWith('filled-'); }

  // (optional) pre-filtered lists to keep templates clean
  get firebaseTemplates(): SavedForm[] { return this.templates.filter(x => this.isFirebaseForm(x)); }
  get firebaseFilled(): SavedForm[]    { return this.filledForms.filter(x => this.isFirebaseForm(x)); }

 isDG(field: any): field is DataGridField {
    const t = field?.type;
    return t === 'data-grid' || t === 'datagrid' || t === 'grid' || t === 'matrix';
  }
  //
  private readonly FILLABLE_TYPES = new Set([
  'text','email','number','tel','date',
  'textarea','description','radio','checkbox',
  'branch','file','signature','project-title',
  'data-grid','datagrid','grid','matrix'
]);
  
showFormsToFill() {
  if (!this.templates.length) this.loadFromFirebase('templates');
  this.viewMode = 'tofill';
}



  private splitLists() {
  this.templates   = this.forms.filter(f => f.source === 'template');
  this.filledForms = this.forms.filter(f => f.source === 'filled');
}

  @Input() selectedForm: SavedForm | null = null;
  @Input() filledDataName: string = '';

  @Output() closeFormEvent = new EventEmitter<void>();
  @Output() filledFormsUpdated = new EventEmitter<void>();

  @ViewChildren('canvas') canvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('autoGrowTextarea') textareas!: QueryList<ElementRef<HTMLTextAreaElement>>;
  @ViewChild('pdfCanvas', { static: false }) pdfCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('saveLoadChoiceTpl') saveLoadChoiceTpl!: TemplateRef<any>;

  pdfDoc: PDFDocumentProxy | null = null;

  // Signature drawing state
  ctxMap: Record<string, CanvasRenderingContext2D> = {};
  drawingMap: Record<string, boolean> = {};
  lastPos: Record<string, { x: number; y: number }> = {};

  private currentInstance: FilledInstance | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private formService: FormService,
     private route: ActivatedRoute,   // <-- add
  private router: Router  

  ) {}

  /* ---------------- Lifecycle ---------------- */

ngOnInit(): void {
  this.normalizeCurrentForm();
  this.isBuilderMode = false;

  // 1) Listen for /forms?download=...&back=...
  this.route.queryParamMap.subscribe(async (params) => {
    const downloadId = params.get('download');
    const back = params.get('back');
    if (!downloadId) return;

    try {
      await this.handleDashboardDownload(downloadId);
    } catch (err) {
      console.error('[CreateForm] handleDashboardDownload failed:', err);
      this.snackBar.open('Could not generate the PDF.', 'Close', { duration: 3000 });
    } finally {
      if (back) this.router.navigateByUrl(back);
    }
  });

  // 2) Branch-aware template load (DEFINE fetchTemplates before using it)
  const fetchTemplates = this.isAdmin()
    ? this.formService.getFormTemplates()                               // Admin sees all
    : this.formService.getVisibleTemplatesForBranch(this.currentBranch); // Crew sees only their branch (or ALL)

  fetchTemplates
    .then((list: any[]) => {
      this.forms = (list || []).map((x: any) => {
        // 🔸 deep copy and rebuild cells from cellsFlat
        const pages = deserializeFromFirestorePages(
          JSON.parse(JSON.stringify(x?.formPages || []))
        );

        const sf: SavedForm = {
          formId: this.makeId(x, 'template'),
          formName: x?.formName ?? x?.name ?? x?.title ?? 'Untitled (template)',
          formPages: pages,                 // ✅ deserialized
          source: 'template' as const,
          pdfUrl: x?.pdfUrl ?? null,
          allowedBranches: x?.allowedBranches?.length ? x.allowedBranches : ['ALL'],
        };

        // Optional: normalize but do NOT rebuild grids if cells already exist
        (sf.formPages || []).forEach(p =>
          (p.fields || []).forEach((f: any) => {
            this.normalizeFieldType(f);            // e.g. 'datagrid' → 'data-grid'
            this.ensureGridMatrixDefaultsSafe(f);  // safe defaults
          })
        );

        return sf;
      });

      this.splitLists();
      if (!this.isAdmin()) this.templates = this.templates.filter(this.canSeeTemplate);

      // 🔹 Lock the canvas width once forms are loaded
      const el = document.getElementById('form-to-export');
      if (el) {
        this.setPdfContentWidthVar(el);
      }
    })
    .catch(err => {
      console.error('load templates failed', err);
      this.loadForms();   // local fallback (legacy)
      this.splitLists();
      if (!this.isAdmin()) this.templates = this.templates.filter(this.canSeeTemplate);

      // 🔹 Even in fallback, lock width
      const el = document.getElementById('form-to-export');
      if (el) {
        this.setPdfContentWidthVar(el);
      }
    });
}
// ⬅️ Still inside the class
private ensureGridMatrixDefaultsSafe(f: any) {
  const t = String(f?.type || '').toLowerCase().replace(/[_\s]+/g, '-');
  if (t !== 'data-grid') return;

 const gm = (f.gridMatrix ??= {
    rows: 1,
    cols: 1,
    cellH: 140,
    cellW: 260,
    gap: 12,
    showBorders: true,
    cells: [[{ items: [] }]],
  } as GridMatrix);

  gm.showBorders ??= true;
  gm.gap        = typeof gm.gap   === 'number' ? gm.gap   : 12;
  gm.cellH      = typeof gm.cellH === 'number' ? gm.cellH : 140;
  gm.cellW      = typeof gm.cellW === 'number' ? gm.cellW : 260;

  let cells2D: any[][] | undefined;

  if (Array.isArray(gm.cells) && Array.isArray((gm.cells as any[])[0])) {
    cells2D = gm.cells as any[][];
  } else if (Array.isArray(gm.cells)) {
    const flat = gm.cells as any[];
    const R = Number.isFinite(gm.rows) && gm.rows! > 0 ? gm.rows! : Math.max(1, Math.ceil(Math.sqrt(flat.length || 1)));
    const C = Number.isFinite(gm.cols) && gm.cols! > 0 ? gm.cols! : Math.max(1, Math.ceil((flat.length || 1) / R));
    cells2D = Array.from({ length: R }, (_, r) =>
      Array.from({ length: C }, (_, c) => {
        const cell = flat[r * C + c] ?? { items: [] };
        cell.items = Array.isArray(cell.items) ? cell.items : [];
        return cell;
      })
    );
  } else if (Array.isArray((gm as any).matrix) && Array.isArray((gm as any).matrix[0])) {
    cells2D = (gm as any).matrix.map((row: any[]) =>
      row.map((cell: any) => ({ items: Array.isArray(cell?.items) ? cell.items : [] }))
    );
  } else if ((gm as any).data?.rows?.length) {
    cells2D = (gm as any).data.rows.map((row: any) =>
      (row.cols || row.cells || []).map((cell: any) => ({ items: Array.isArray(cell?.items) ? cell.items : [] }))
    );
  }

  const R = Number.isFinite(gm.rows) && gm.rows! > 0 ? gm.rows! : (cells2D?.length || 1);
  const C = Number.isFinite(gm.cols) && gm.cols! > 0 ? gm.cols! : (cells2D?.[0]?.length || 1);

  if (!cells2D) {
    cells2D = Array.from({ length: R }, () => Array.from({ length: C }, () => ({ items: [] })));
  }

  for (let r = 0; r < R; r++) {
    cells2D[r] ||= [];
    for (let c = 0; c < C; c++) {
      cells2D[r][c] ||= { items: [] };
      cells2D[r][c].items = Array.isArray(cells2D[r][c].items) ? cells2D[r][c].items : [];
    }
  }

  gm.rows = R;
  gm.cols = C;
  gm.cells = cells2D;
}

  trackByFormId = (_: number, f: SavedForm) => f.formId;
  ngAfterViewInit(): void {
    this.initCanvases();
    if (this.examplePdfUrl) {
      this.loadPdf(this.examplePdfUrl).catch(() =>
        console.warn('Sample PDF not found, skipping preview.')
      );
    }
    this.attachAutoGrowListeners();
    this.textareasSub = this.textareas.changes.subscribe(() => {
      this.attachAutoGrowListeners();
    });
  }
isGridField(f: any): boolean {
  const t = (f?.type || '').toLowerCase();
  return t === 'data-grid' || t === 'datagrid' || t === 'grid' || t === 'matrix';
}

  ngOnDestroy(): void {
    this.textareasSub?.unsubscribe();
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.stopResize);
    this.textareas?.forEach(ref => {
    const ta = ref.nativeElement;
    const clone = ta.cloneNode(true);
    ta.replaceWith(clone); // removes all listeners
  });
  }
  // type guard so the template can narrow "field"


// normalize any shape to GridCell[][]
private ensure2DGrid(gm: GridMatrix): GridCell[][] {
  const R = Math.max(1, gm?.rows ?? 1);
  const C = Math.max(1, gm?.cols ?? 1);

  gm.gap   = typeof gm.gap   === 'number' ? gm.gap   : 12;
  gm.cellH = typeof gm.cellH === 'number' ? gm.cellH : 120;
  gm.cellW = typeof gm.cellW === 'number' ? gm.cellW : 160;

  const ensure2D = (arr: GridCell[][]): GridCell[][] => {
    for (let r = 0; r < R; r++) {
      if (!arr[r]) arr[r] = [];
      for (let c = 0; c < C; c++) {
        if (!arr[r][c]) arr[r][c] = { items: [] };
        if (!arr[r][c].items) arr[r][c].items = [];
      }
    }
    return arr;
  };

  if (Array.isArray(gm.cells) && Array.isArray((gm.cells as any)[0])) {
    return ensure2D(gm.cells as GridCell[][]);
  }
  if (Array.isArray(gm.matrix) && Array.isArray((gm.matrix as any)[0])) {
    gm.cells = gm.matrix;
    return ensure2D(gm.matrix as GridCell[][]);
  }
  if (Array.isArray(gm.cells)) {
    const flat = gm.cells as GridCell[];
    const out: GridCell[][] = [];
    let k = 0;
    for (let r = 0; r < R; r++) {
      out[r] = [];
      for (let c = 0; c < C; c++) {
        const cell = flat[k++] ?? { items: [] };
        if (!cell.items) cell.items = [];
        out[r][c] = cell;
      }
    }
    gm.cells = out;
    return ensure2D(out);
  }
  if (gm.data?.rows?.length) {
    const out: GridCell[][] = [];
    for (let r = 0; r < R; r++) {
      const rowObj = gm.data.rows[r] || {};
      const colsArr: GridCell[] = rowObj.cols || rowObj.cells || [];
      out[r] = [];
      for (let c = 0; c < C; c++) {
        const cell = colsArr[c] ?? { items: [] };
        if (!cell.items) cell.items = [];
        out[r][c] = cell;
      }
    }
    gm.cells = out;
    return ensure2D(out);
  }

  const empty = Array.from({ length: R }, () =>
    Array.from({ length: C }, () => ({ items: [] } as GridCell))
  );
  gm.cells = empty;
  return empty;
}

// Signature image sources (base64 or URL) keyed by fieldId
private sigSrcMap: Record<string, string> = {};
// Keep observers to clean up later
private sigResizeObs: Record<string, ResizeObserver> = {};

private resizeAndRedrawSignature(
  fieldId: string,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number
) {
  const dpr = window.devicePixelRatio || 1;
  // Only touch backing store if CSS changed, to avoid blurs
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);

  const src = this.sigSrcMap[fieldId];
  if (!src) return;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    // Fill the canvas area; change to contain/cover logic if preferred
    ctx.drawImage(img, 0, 0, cssW, cssH);
  };
  img.src = src;
}
private readonly ALL_BRANCHES: Exclude<Branch, 'ALL'>[] = ['MACKAY', 'YAT', 'NSW'];
currentBranch: Branch = 
  (localStorage.getItem('branch')?.toUpperCase() as Branch) || 'NSW';
private isAdmin(): boolean {
  return (localStorage.getItem('role') || '').toLowerCase() === 'admin';
   
}
private toGridItemType(raw: any): GridItem['type'] {
  const t = String(raw ?? 'text').toLowerCase();
  switch (t) {
    case 'text':
    case 'number':
    case 'date':
    case 'textarea':
    case 'select':
    case 'file':
      return t;
    case 'email':
    case 'tel':
      return 'text';
    default:
      return 'text';
  }
}


fallbackCells(field: DataGridField): GridCell[][] {
  const gm = (field?.gridMatrix ?? {}) as GridMatrix;

  // sensible defaults
  gm.gap   = typeof gm.gap   === 'number' ? gm.gap   : 12;
  gm.cellH = typeof gm.cellH === 'number' ? gm.cellH : 120;
  gm.cellW = typeof gm.cellW === 'number' ? gm.cellW : 160;

  let twoD: GridCell[][] | null = null;

  // 1) already 2-D
  if (Array.isArray(gm.cells) && Array.isArray((gm.cells as any)[0])) {
    twoD = gm.cells as GridCell[][];
  } else if (Array.isArray(gm.matrix) && Array.isArray((gm.matrix as any)[0])) {
    twoD = gm.matrix as GridCell[][];
  }
  // 2) flat → chunk into rows
  else if (Array.isArray(gm.cells)) {
    const flat = gm.cells as GridCell[];
    const colsHint =
      (Number.isFinite(gm.cols as any) && (gm.cols as any) > 0 ? gm.cols! : undefined) ??
      (gm.data?.rows?.[0]?.cols?.length ?? gm.data?.rows?.[0]?.cells?.length) ??
      1;

    twoD = [];
    for (let i = 0; i < flat.length; i++) {
      const r = Math.floor(i / colsHint);
      if (!twoD[r]) twoD[r] = [];
      const cell = flat[i] ?? ({ items: [] } as GridCell);
      if (!cell.items) cell.items = [];
      twoD[r].push(cell);
    }
  }
  // 3) object form: data.rows[].(cols|cells)[]
  else if (gm.data?.rows?.length) {
    twoD = gm.data.rows.map(rowObj => {
      const arr = (rowObj?.cols ?? rowObj?.cells ?? []) as GridCell[];
      return arr.map(c => {
        const cell = c ?? ({ items: [] } as GridCell);
        if (!cell.items) cell.items = [];
        return cell;
      });
    });
  }

  // 4) nothing present → build empty grid from declared rows/cols or 1×1
  if (!twoD || !twoD.length) {
    const R = Math.max(1, gm.rows ?? 1);
    const C = Math.max(1, gm.cols ?? 1);
    twoD = Array.from({ length: R }, () =>
      Array.from({ length: C }, () => ({ items: [] } as GridCell))
    );
  }

  // fill holes, finalize dimensions
  const R = twoD.length;
  const C = Math.max(1, twoD[0]?.length ?? (gm.cols ?? 1));
  for (let r = 0; r < R; r++) {
    if (!twoD[r]) twoD[r] = [];
    for (let c = 0; c < C; c++) {
      if (!twoD[r][c]) twoD[r][c] = { items: [] };
      if (!twoD[r][c].items) twoD[r][c].items = [];
    }
  }

  // persist normalized shape so the rest of your code sees GridCell[][]
  gm.rows = Math.max(1, R);
  gm.cols = Math.max(1, C);
  gm.cells = twoD;

  return twoD;
}


// expand ['ALL'] to concrete branches
private expandAllowed(ab?: Branch[]): Exclude<Branch, 'ALL'>[] {
  if (!ab || ab.length === 0) return this.ALL_BRANCHES;
  return ab.includes('ALL') ? this.ALL_BRANCHES : (ab as Exclude<Branch, 'ALL'>[]);
}
private normalizeField(f: FormField) {
  f.position ||= { x: 0, y: 0 };
  if (f.type === 'checkbox') {
    if (typeof f._checkW  !== 'number') f._checkW  = f.inputWidth ?? 260;
    if (typeof f._checkH  !== 'number') f._checkH  = 40;
    if (typeof f._checkML !== 'number') f._checkML = 0;
  }
  // repeat for _email*, _date*, _branch* if you bind them
}
private ensureGridMatrixDefaults(f: FormField) {
  // Narrow to a DataGridField; ignore non-grid fields
  if (!this.isDG(f)) return;

  // Ensure the gridMatrix object exists with sensible defaults
  f.gridMode = f.gridMode || 'matrix';
  f.gridMatrix = f.gridMatrix || {
    rows: 1,
    cols: 1,
    cells: [[{ items: [] }]],
    showBorders: true,
    gap: 12,
    cellH: 140,
    cellW: 160, // width default helps downstream sizing
  };

  const gm = f.gridMatrix;
  // Fill in any missing defaults without clobbering existing values
  gm.showBorders = gm.showBorders ?? true;
  gm.gap        = typeof gm.gap   === 'number' ? gm.gap   : 12;
  gm.cellH      = typeof gm.cellH === 'number' ? gm.cellH : 140;
  gm.cellW      = typeof gm.cellW === 'number' ? gm.cellW : 160;

  // 🔑 Normalize any saved shape (flat / 2-D / object form) → strict 2-D
  const cells2D = this.fallbackCells(f); // returns GridCell[][] and ALSO persists gm.cells/rows/cols in our earlier impl

  // If your fallbackCells doesn't persist, uncomment the next three lines:
  // gm.cells = cells2D;
  // gm.rows  = Math.max(1, cells2D.length);
  // gm.cols  = Math.max(1, cells2D[0]?.length || 1);
}
// can this template be seen by the current branch?
private canSeeTemplate = (f: SavedForm): boolean => {
  const allowed = this.expandAllowed(f.allowedBranches as Branch[] | undefined);
  return this.currentBranch === 'ALL' || allowed.includes(this.currentBranch as any);
};
private templateHasFillableFields(t: SavedForm, treatEmptyGridAsFillable = true): boolean {
  const isFillable = (s: string) =>
    this.FILLABLE_TYPES.has(s); // your existing Set (includes 'data-grid')

  for (const p of (t.formPages ?? [])) {
    for (const f of (p.fields ?? [])) {
      const type = String(f?.type ?? '')
        .toLowerCase()
        .replace(/[_\s]+/g, '-');

 if (type === 'data-grid') {
  if (treatEmptyGridAsFillable) return true; // show templates that just have a grid

  // Normalize to 2-D cells and scan items
  if (this.isDG(f)) {
    const cells2D = this.fallbackCells(f);
    for (const row of cells2D) {
      for (const cell of row) {
        for (const it of (cell?.items ?? [])) {
          const itType = String(it?.type ?? '').toLowerCase().replace(/[_\s]+/g, '-');
          if (isFillable(itType)) return true;
        }
      }
    }
  }
} else if (isFillable(type)) {
  return true;
}
}}
return false;
}
private attachAutoGrowListeners() {
  // ✨ Respect fixed layout: no auto-grow
  if (this.fixedLayout) return;

  this.textareas.forEach((textareaEl) => {
    const ta = textareaEl.nativeElement;
    if ((ta as any).__ag__) return;
    (ta as any).__ag__ = true;
    this.autoGrow(ta);
    if (ta.id !== 'description') {
      ta.addEventListener('input', () => this.autoGrow(ta));
    }
  });
}
  hasAnyChecked(field: { options?: { checked?: boolean }[] } | null | undefined): boolean {
  if (!field?.options?.length) return false;
  return field.options.some(o => !!o?.checked);
}
onCheckboxToggle(field: FormField) {
  // Keep field.value = array of selected option values
  if (field.type === 'checkbox' && Array.isArray(field.options)) {
    field.value = field.options.filter(o => !!o.checked).map(o => o.value);
  }
}
showFilledForms() {
  if (!this.filledForms.length) this.loadFromFirebase('filled');
  this.viewMode = 'filled';
}
private async handleDashboardDownload(id: string) {
  // Try in-memory first
  let form = this.forms.find(f => String(f.formId) === String(id));

  // Fallback: fetch from Firebase if not found
  if (!form) {
    try {
      const [templates, filled] = await Promise.all([
        this.formService.getFormTemplates().catch(() => []),
        this.formService.getFilledForms().catch(() => []),
      ]);
      

      const toSaved = (item: any, source: 'template' | 'filled') => ({
        formId: String(
          item?.formId ?? item?.id ?? item?.docId ?? item?._id ?? item?.uid ?? item?.ref?.id ?? ''
        ),
        formName: item?.formName || item?.name || item?.title || `Untitled (${source})`,
        formPages: source === 'filled'
          ? (item?.formPagesSnapshot || item?.formPages || [])
          : (item?.formPages || []),
        source,
        pdfUrl: item?.pdfUrl ?? item?.formPdfPreview ?? null,
        sourceFormId: item?.sourceFormId ?? item?.templateId ?? null,
      });

      const all = [
        ...(templates || []).map((x: any) => toSaved(x, 'template')),
        ...(filled || []).map((x: any) => toSaved(x, 'filled')),
      ];

      form = all.find(f => String(f.formId) === String(id)) as any;
    } catch {}
  }

  // Last fallback: localStorage legacy
  if (!form) {
    try {
      const arr: any[] = JSON.parse(localStorage.getItem('filledForms') || '[]');
      const local = arr.find(x => String(x.id ?? x.formId) === String(id));
      if (local) {
        form = {
          formId: local.id ?? local.formId,
          formName: local.formName ?? local.name ?? 'Untitled',
          formPages: local.formPagesSnapshot ?? local.formPages ?? [],
          source: 'filled',
          pdfUrl: (typeof local.pdfUrl === 'string' && /\.pdf(\?|$)/i.test(local.pdfUrl)) ? local.pdfUrl : null,
          sourceFormId: local.sourceFormId ?? local.templateId ?? null,
        };
      }
    } catch {}
  }

  if (!form) throw new Error('Form not found');

  // Use your existing method: downloads if pdfUrl exists; otherwise generates, uploads, then downloads
  await this.onClickDownloadIcon(form);
}
private anchorPageToTopLeft(page: FormPage, pad = 12): void {
  const fs = page.fields || [];
  if (!fs.length) return;

  const minX = Math.min(...fs.map(f => (f.position?.x ?? 0)));
  const minY = Math.min(...fs.map(f => (f.position?.y ?? 0)));

  // how much empty space exists before the first field?
  const shiftX = Math.max(0, minX - pad);
  const shiftY = Math.max(0, minY - pad);

  if (shiftX || shiftY) {
    fs.forEach(f => {
      if (!f.position) f.position = { x: 0, y: 0 };
      f.position.x = Math.max(0, f.position.x - shiftX);
      f.position.y = Math.max(0, f.position.y - shiftY);
    });
  }
}
/** Columns CSS; if you store fixed widths use them, else equal columns. */
gridColsCss(field: any): string {
  const gm = field.gridMatrix || {};
  const cols = Math.max(1, gm.cols ?? (this.fallbackCells(field)[0]?.length || 1));
  const cellW = this.gridCellWFromWrapper(field);
  return `repeat(${cols}, ${cellW}px)`;
}
onCellDragOver(ev: DragEvent) {
  ev.preventDefault();
  ev.stopPropagation();         // <- block page-level drop
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
}
ensureGridMatrix(field: DataGridField): GridMatrix {
  field.gridMatrix ??= {} as any;
  const gm = field.gridMatrix as any;
  gm.rows ??= 2;
  gm.cols ??= 2;
  gm.cellW ??= 160;
  gm.cellH ??= 90;
  gm.gap  ??= 8;
  gm.cells ??= Array.from({ length: gm.rows }, () =>
    Array.from({ length: gm.cols }, () => ({ items: [] }))
  );
  return gm as GridMatrix;
}



gridItemBlockStyle(field: DataGridField) {
  const pad = this.GRID_CELL_PAD_PX ?? 8;
  // ignore pos/size; just fill the cell with padding
  return {
    flex: '1 1 auto',
    width: '100%',
    height: '100%',
    padding: `${pad}px`,
    boxSizing: 'border-box'
  } as const;
}
onCellDrop(ev: DragEvent, field: DataGridField, r: number, c: number) {
  ev.preventDefault();
  ev.stopPropagation();

  const gm = this.ensureGridMatrix(field);

  let payload: any;
  try { payload = JSON.parse(ev.dataTransfer?.getData('text/plain') || '{}'); } catch {}
  const type  = this.toGridItemType?.(payload?.type) ?? (payload?.type || 'text');
  const label = String(payload?.label ?? '');

  const item: GridItem = {
    id: 'gi_' + Math.random().toString(36).slice(2),
    type, label, value: null, options: [],
    pos:  { x: 0, y: 0 },     // not used in block mode
    size: { w: 0, h: 0 },     // not used in block mode
  };

  const cells = this.ensure2DGrid(gm);
  const nextRow  = [...cells[r]];
  const nextCell = { ...(cells[r][c] ?? {}), items: [item] }; // replace
  nextRow[c] = nextCell;

  const nextCells = [...cells];
  nextCells[r] = nextRow;

  field.gridMatrix = { ...gm, cells: nextCells };
  this.cdr.markForCheck();
}
private suppressNextPageDrop = false;

private isOverGrid(ev: DragEvent): boolean {
  const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
  return !!el?.closest('.dg-cell, .data-grid-matrix');
}

onPageDragOver(ev: DragEvent) {
  if (this.isOverGrid(ev)) return;          // let the cell handle it
  if (!this.isBuilderMode) return;           // optional safety
  ev.preventDefault();
  ev.dataTransfer && (ev.dataTransfer.dropEffect = 'copy');
}

onPageDrop(ev: DragEvent) {
  if (ev.defaultPrevented) return;           // a cell already handled it
  if (this.isOverGrid(ev)) return;           // ignore drops over grid
  if (!this.isBuilderMode) return;           // optional safety
  ev.preventDefault();
    ev.stopPropagation();

  // ... your existing "add a normal field to the page" logic ...
}

private defaultSizeFor(type: GridItem['type'], cellW: number, cellH: number) {
  switch (type) {
    case 'text':
    case 'number':
    case 'date':
    case 'select':
      // full row by default (exact cell width)
      return { w: cellW, h: 40 };
    case 'textarea':
      return { w: cellW, h: Math.min(120, cellH) };
    case 'file':
      return { w: cellW, h: 40 };
    default:
      return { w: Math.min(220, cellW), h: 40 };
  }
}
pixelGridWidth(field: DataGridField): number {
  const gm = field.gridMatrix || {};
      
  const cols = gm.cols ?? (this.fallbackCells(field)[0]?.length || 1);
  const cellW = (gm as any).cellW ?? 280;
  const gap   = gm.gap ?? 12;
  return cols * cellW + (cols - 1) * gap;
}

onGridFile(e: Event, it: any) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => { it.value = r.result; };
  r.readAsDataURL(file);
}
// Works regardless of the cell's actual pixel size.
gridItemAbsoluteStyle(it: any, field: DataGridField) {
  const pad = this.GRID_CELL_PAD_PX ?? 8;

  // store something small / stable if you serialize
  it.pos  = { x: pad, y: pad };
  it.size = { w: 1, h: 1 };

  return {
    position: 'absolute',
    inset: `${pad}px`,          // left/top/right/bottom = pad
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
  };
}
  // NON-STRICT (fallback): allow free positioning but clamp inside cell


  
gridOuterPxWidth(f: FormField) {
  const gm = f.gridMatrix!;
  const w = (gm.cellW || 160) * gm.cols + (gm.gap || 12) * (gm.cols - 1) + 16; // + padding
  return { width: `${w}px` };
}
async publishTemplate(): Promise<void> {
  if (!this.selectedForm) return;

  // 1) deep clone & normalize fields (incl. data-grid)
  const pages: FormPage[] = JSON.parse(JSON.stringify(this.selectedForm.formPages || []));
  for (const p of pages) {
    for (const f of (p.fields || [])) {
      this.normalizeFieldType(f);        // 'datagrid'/'grid' → 'data-grid'
      this.ensureGridMatrixDefaults(f);  // rows/cols/cells/gap/borders

      // sanitize selects & fill unset values inside grid cells
    if (this.isDG(f)) {
        const cells2D = this.fallbackCells(f); // ✅ always GridCell[][]
        for (const row of cells2D) {
          for (const cell of row) {
            for (const it of (cell.items || [])) {
              if (it.type === 'select' && Array.isArray(it.options)) {
                it.options = it.options.map((o: any) => ({
                  label: (o.label ?? String(o.value ?? '')).toString(),
                  value: (o.value ?? o.label ?? '').toString(),
                }));
              }
              if (it.value === undefined) it.value = null;
            }
          }
        }
      }

      // basic geometry defaults
      f.position ||= { x: 0, y: 0 };
      if (typeof f.width  !== 'number') f.width  = (f.type === 'data-grid') ? 600 : 300;
      if (typeof f.height !== 'number') {
        f.height = f.type === 'signature' ? 150 :
                   f.type === 'textarea'  ? 120 :
                   f.type === 'data-grid' ? 200 : 48;
      }
    }
  }

  const name = (this.selectedForm.formName || 'Untitled Template').trim();
  const allowedBranches: Branch[] = this.isAdmin() ? ['ALL'] : [this.currentBranch as Branch];

  try {
    // 2) create or update?
    const isFirestoreId =
      /^[A-Za-z0-9_-]{10,}$/.test(this.selectedForm.formId) &&
      !this.selectedForm.formId.startsWith('new-');

    if (isFirestoreId) {
      await this.formService.updateFormTemplate(this.selectedForm.formId, {
        formName: name,
        formPages: pages,
        allowedBranches,
      });
    } else {
      const ref = await this.formService.saveFormTemplate(name, pages, allowedBranches);
      this.selectedForm.formId = ref.id;
    }

    // 3) reload list and show it under “Forms to Fill”
    await this.loadFromFirebase('templates');
    this.viewMode = 'tofill';
    this.showFormEditor = false;
    this.snackBar.open('Template published. Check “Forms to Fill”.', 'Close', { duration: 2500 });
  } catch (e) {
    console.error(e);
    this.snackBar.open('Failed to publish template.', 'Close', { duration: 3000 });
  }
}

  
private beginCapture(root: HTMLElement): () => void {
  const edited: Array<{ el: HTMLElement; style: Partial<CSSStyleDeclaration> }> = [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = root as HTMLElement | null;

  while (node) {
    const prev: Partial<CSSStyleDeclaration> = {
      overflow: node.style.overflow ?? '',
      overflowY: node.style.overflowY ?? '',
      height: node.style.height ?? '',
      maxHeight: node.style.maxHeight ?? '',
      transform: node.style.transform ?? '',
      filter: node.style.filter ?? '',
    };

    node.style.overflow = 'visible';
    node.style.overflowY = 'visible';
    node.style.transform = 'none';
    node.style.filter = 'none';

    if (node.tagName === 'TEXTAREA') {
      const ta = node as HTMLTextAreaElement;
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }

    edited.push({ el: node, style: prev });
    node = walker.nextNode() as HTMLElement | null;
  }

  return () => {
    for (const { el, style } of edited) {
      el.style.overflow = style.overflow ?? '';
      el.style.overflowY = style.overflowY ?? '';
      el.style.height = style.height ?? '';
      el.style.maxHeight = style.maxHeight ?? '';
      el.style.transform = style.transform ?? '';
      el.style.filter = style.filter ?? '';
    }
  };
}
private pageOrigins = new WeakMap<any, { ox: number; oy: number }>();

/** Compute/calc origin from the upper-left field; cache it (no saving/mutation) */
public preparePageOrigin(page: { fields?: Array<{ position?: { x?: number; y?: number } }> }): void {
  const fs = page?.fields || [];
  if (!fs.length) { this.pageOrigins.set(page, { ox: 0, oy: 0 }); return; }
  const ox = Math.min(...fs.map(f => Math.max(0, Math.round(f.position?.x ?? 0))));
  const oy = Math.min(...fs.map(f => Math.max(0, Math.round(f.position?.y ?? 0))));
  this.pageOrigins.set(page, { ox, oy });
}

/** Read cached origin; default 0,0 */
private originFor(page: any): { ox: number; oy: number } {
  return this.pageOrigins.get(page) ?? { ox: 0, oy: 0 };
}

private anchorAllPages(pages: FormPage[], pad = 12): void {
  (pages || []).forEach(p => this.anchorPageToTopLeft(p, pad));
}


  asKey(id?: string) {
    return String(id ?? '');
  }
  isDownloading(id?: string) {
    return this.downloading.has(this.asKey(id));
  }

  public downloading = new Set<string>();
public getFieldStyle(field: any) {
  const x = Math.max(0, Math.round(field?.position?.x ?? 0));
  const y = Math.max(0, Math.round(field?.position?.y ?? 0));
  const w = Math.max(20, Math.round(field?.width  ?? 300));
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
public gridCellWFromWrapper(f: any): number {
  const gm   = f?.gridMatrix || {};
  const cols = Math.max(1, gm.cols ?? (f?.gridMatrix?.cells?.[0]?.length || 1));
  const gap  = Math.max(0, gm.gap ?? 12);
  const wrapW = Math.max(40, Math.round(f?.width ?? 300));
  return Math.max(40, Math.floor((wrapW - gap * (cols - 1)) / cols));
}

// Derive pixel cell height from wrapper height
public gridCellHFromWrapper(f: any): number {
  const gm   = f?.gridMatrix || {};
  const rows = Math.max(1, gm.rows ?? (f?.gridMatrix?.cells?.length || 1));
  const gap  = Math.max(0, gm.gap ?? 12);
  const wrapH = Math.max(40, Math.round(f?.height ?? 240));
  return Math.max(40, Math.floor((wrapH - gap * (rows - 1)) / rows));
}


labelStyle(field: any) {
  return (field?.ui?.direction === 'row')
    ? { flex: `0 0 ${field?.ui?.labelWidthPx ?? 120}px`, margin: 0 }
    : { margin: '0 0 6px 0' };
}
gridItemStyle(item: any) {
  const w = item?.fullWidth ? 100 : (item?.widthPct ?? null);
  return {
    width: w ? `${w}%` : null,
    flex: w ? '0 0 auto' : '1 1 auto',
    boxSizing: 'border-box',
  };
}


controlStyle(field: { width?: number | null; height?: number | null }) {
  const s: any = {};
  if (field?.width  != null) s.width  = `${field.width}px`;
  if (field?.height != null) s.height = `${field.height}px`;
  return s;
}
onAddTemplate(): void {
  const pageW = 760; // your working surface width; adjust if needed
  const cardW = Math.min(440, pageW - 40); // default control width
  const y1 = 16, y2 = y1 + 72; // stacked spacing

  const tpl: SavedForm = {
    formId: 'new-' + Math.random().toString(36).slice(2),
    formName: 'Untitled',
    formPages: [{
      fields: [
        {
          id: 'date',
          label: 'Date Field',
          type: 'date',
          value: '',                    // filled at open-time
          width: cardW,
          height: 56,
          required: false,
          position: { x: 16, y: y1 },
        },
        {
          id: 'branch',
          label: 'Branch Field',
          type: 'branch',               // you already support this
          value: '',                    // filled at open-time
          width: cardW,
          height: 56,
          required: false,
          position: { x: 16, y: y2 },
          // if you render with a select, you can also embed the options here
          options: [
            { value: 'MACKAY', label: 'MACKAY' },
            { value: 'YAT',    label: 'YAT' },
            { value: 'NSW',    label: 'NSW' },
          ],
        },
      ],
    }],
    source: 'template',
    allowedBranches: this.isAdmin() ? ['ALL'] : [this.currentBranch as Exclude<Branch,'ALL'>],
    // optional metadata
    // createdAt: Date.now(),
  };

  this.forms.unshift(tpl);
  this.splitLists();
  this.openForm(tpl);        // editor opens with fixed layout (see B/C below)
}

  /* ---------------- Dialog for Save/Load choice ---------------- */

  openChoice(mode: 'save' | 'load'): Promise<'local' | 'firebase' | 'both' | null> {
    const ref = this.dialog.open(this.saveLoadChoiceTpl, {
      width: '340px',
      data: { mode },
      autoFocus: true,
      restoreFocus: true,
    });
    return firstValueFrom(ref.afterClosed());
  }

  /* ---------------- PDF Preview (optional) ---------------- */

  async loadPdf(url: string) {
    this.pdfDoc = await getDocument(url).promise;
    if (this.pdfDoc.numPages > 0) this.renderPage(1);
  }

  async renderPage(pageNum: number) {
    if (!this.pdfDoc) return;
    const page = await this.pdfDoc.getPage(pageNum);
    const canvas = this.pdfCanvas.nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return;

    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    canvas.height = viewport.height;
    canvas.width = viewport.width;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';

    await page.render({ canvasContext: context, viewport }).promise;
  }
  pdfTooltip(f: SavedForm): string {
  if (this.downloading.has(this.asKey(f.formId))) return 'Generating…';
  return f.pdfUrl ? 'Open PDF' : 'Generate PDF';
}

  /* ---------------- Local template fallback ---------------- */
loadForms(): void {
  const raw = localStorage.getItem('filledForms');
  if (!raw) { this.forms = []; this.splitLists(); return; }

  try {
    const arr = JSON.parse(raw) ?? [];

    const looksLikeRealPdf = (url: any) =>
      typeof url === 'string' &&
      (
        /\.pdf(\?|$)/i.test(url) ||           // ends with .pdf (optionally with query)
        (url.startsWith('http') && !url.startsWith('data:')) // remote URL, not a data: uri
      );

    // New shape: { id, sourceFormId, formName, formPagesSnapshot, pdfUrl }
    if (arr.length && arr[0]?.id && arr[0]?.sourceFormId) {
      this.forms = arr.map((it: any) => ({
        formId: it.id,
        formName: it.formName,
        formPages: it.formPagesSnapshot || [],
        source: 'filled' as const,
        pdfUrl: looksLikeRealPdf(it.pdfUrl) ? it.pdfUrl : null,
      }));
    } else {
      // Old shape fallback: { formId, name, formPagesSnapshot, formPdfPreview }
      this.forms = arr.map((it: any) => {
        const maybe = it.pdfUrl ?? it.formPdfPreview ?? null; // may be a PNG dataURL
        return {
          formId: it.formId,
          formName: it.name,
          formPages: it.formPagesSnapshot || [],
          source: 'filled' as const,
          pdfUrl: looksLikeRealPdf(maybe) ? maybe : null, // don’t treat PNG preview as PDF
        } as SavedForm;
      });
    }
  } catch {
    this.forms = [];
  } finally {
    this.splitLists();
  }
}
// If your FormField union includes data-grid, narrow first:
private clampGridItems(field: FormField): void {
  if (!this.isDG(field)) return;                 // ✅ type guard → DataGridField
  const gm = field.gridMatrix;
  if (!gm) return;

  // ensure grid defaults and normalized 2D cells
  const cells2D = this.fallbackCells(field);     // ✅ now field is DataGridField
  const pad   = 6;
  const cellW = gm.cellW ?? 160;
  const cellH = gm.cellH ?? 140;

  for (const row of cells2D) {
    for (const cell of row) {
      for (const it of (cell.items || [])) {
        // make sure we have pos/size objects
        const size = it as any;
        const pos  = it as any;

        const w0 = size?.size?.w ?? 220;
        const h0 = size?.size?.h ?? 60;

        const maxX = Math.max(pad, cellW - w0 - pad);
        const maxY = Math.max(pad, cellH - h0 - pad);

        const x0 = pos?.pos?.x ?? pad;
        const y0 = pos?.pos?.y ?? pad;

        const x = Math.max(pad, Math.min(x0, maxX));
        const y = Math.max(pad, Math.min(y0, maxY));

        // write back, clamped
        size.size = { w: Math.min(w0, cellW - pad * 2), h: h0 };
        pos.pos   = { x, y };
      }
    }
  }
}
private deepCleanForFirestore<T>(v: T): T {
  const visit = (x: any): any => {
    if (x === undefined) return null;                 // <-- key for Firestore
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(visit);
    const out: any = {};
    for (const k of Object.keys(x)) {
      const val = visit((x as any)[k]);
      // keep nulls; drop only symbols / functions
      if (typeof val !== 'function') out[k] = val;
    }
    return out;
  };
  return visit(v);
}
private normalizeFieldForSave(f: any) {
  const t = String(f.type || '').toLowerCase().replace(/\s+/g, '-');
  if (t === 'datagrid' || t === 'data-grid') f.type = 'data-grid';
  // ensure positions/sizes exist
  f.position ||= { x: 0, y: 0 };
  if (typeof f.width  !== 'number')  f.width  = (f.type === 'data-grid') ? 600 : 300;
  if (typeof f.height !== 'number')  f.height =
      f.type === 'signature' ? 150 :
      f.type === 'textarea'  ? 120 :
      f.type === 'data-grid' ? 200 : 48;
type SelectOpt = { label?: string; value?: string };
  // for data-grid specifically: ensure a full mxn matrix and plain items
  if (f.type === 'data-grid') {
    this.ensureGridMatrixDefaults(f);         // you already have this
    const gm = f.gridMatrix!;
    // also sanitize select options that may have undefined values
    for (const row of gm.cells) {
      for (const cell of row) {
        for (const it of (cell.items || [])) {
           if (it.type === 'select' && Array.isArray(it.options)) {
          const opts = it.options as SelectOpt[];
          it.options = opts.map((o: SelectOpt): SelectOpt => ({
            label: (o.label ?? String(o.value ?? '')).toString(),
            value: (o.value ?? o.label ?? '').toString(),
          }));
        }
          if (it.value === undefined) it.value = null; // avoid undefined
        }
      }
    }
  }
}

  /* ---------------- Firebase loading ---------------- */

  private makeId(item: any, source: 'template' | 'filled'): string {
    return String(
      item?.formId ??
        item?.id ??
        item?.docId ??
        item?._id ??
        item?.uid ??
        item?.ref?.id ??
        `${source}:${(item?.formName || item?.name || item?.title || 'untitled')
          .toString()
          .trim()
          .toLowerCase()}`
    );
  }
loadFromFirebase(kind: 'filled' | 'templates' | 'both' = 'templates'): void {
  const toSaved = (item: any, source: 'template' | 'filled'): SavedForm => ({
    formId: this.makeId(item, source),
    formName: item?.formName || item?.name || item?.title || `Untitled (${source})`,
    formPages: source === 'filled'
      ? (item?.formPagesSnapshot || item?.formPages || [])
      : (item?.formPages || []),
    source,
    pdfUrl: item?.pdfUrl ?? item?.formPdfPreview ?? null,
    sourceFormId: item?.sourceFormId ?? item?.templateId ?? null,
    allowedBranches: item?.allowedBranches?.length ? item.allowedBranches : ['ALL'],
  });

  const templatePromise = this.isAdmin()
    ? this.formService.getFormTemplates()
    : this.formService.getVisibleTemplatesForBranch(this.currentBranch);

  const filledPromise   = this.formService.getFilledForms();

  this.snackBar.open(`Loading ${kind} from Firebase…`, undefined, { duration: 1200 });

  const fetch =
    kind === 'templates' ? templatePromise.then(list => ({ templates: list, filled: [] as any[] })) :
    kind === 'filled'    ? filledPromise  .then(list => ({ templates: [] as any[], filled: list })) :
                           Promise.all([templatePromise, filledPromise])
                             .then(([t, f]) => ({ templates: t, filled: f }));

  fetch
    .then(({ templates, filled }) => {
      // map + normalize
      const tSaved = (templates || []).map((x: any) => {
        const sf = toSaved(x, 'template');
        this.normalizeTemplatePages(sf); 
        
  // 🛡️ Make sure grid fields are fully shaped before the list touches them
  (sf.formPages || []).forEach(p =>
    (p.fields || []).forEach((f: any) => {
      this.normalizeFieldType(f);        // 'datagrid' -> 'data-grid'
      this.ensureGridMatrixDefaults(f);
      this.normalizeTemplatePages(sf);   // rows/cols/cells/gaps/borders
    })
  );

        
        // ✅ fixed layout captured up-front
        return sf;
      });

   const fSaved = (filled || []).map((x: any) => {
  const sf = toSaved(x, 'filled');
  // ✅ only fill missing width/height so legacy items render predictably
  (sf.formPages || []).forEach(p =>
    (p.fields || []).forEach((f: any) => {
      if (typeof f.width  !== 'number') f.width  = 300;
      if (typeof f.height !== 'number') {
        f.height = f.type === 'signature' ? 150
                 : f.type === 'textarea'  ? 120
                 : 48;
      }
    })
  );
  return sf;
});

      // branch-filter for non-admins (templates only)
      const tFiltered = this.isAdmin() ? tSaved : tSaved.filter(this.canSeeTemplate);
const toFill = tFiltered
  .map(sf => {
    (sf.formPages || []).forEach(p =>
      (p.fields || []).forEach((f: any) => {
        this.normalizeFieldType(f);
        this.ensureGridMatrixDefaults(f);
      })
    );
    return sf;
  })
  .filter(t => this.templateHasFillableFields(t)); // <- includes data-grid
      // combine depending on kind
  const combined =
  kind === 'templates' ? toFill :
  kind === 'filled'    ? fSaved :
                         [...toFill, ...fSaved];

      // sort & apply
      const nameOf = (x: SavedForm) => x.formName ?? '';
      this.forms = combined.sort((a, b) =>
        nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' })
      );

      this.splitLists();

      const counts = { templates: tFiltered.length, filled: fSaved.length };
      const msg =
        kind === 'templates' ? `Loaded ${counts.templates} templates.` :
        kind === 'filled'    ? `Loaded ${counts.filled} filled forms.` :
                               `Loaded ${counts.templates} templates & ${counts.filled} filled forms.`;
      this.snackBar.open(msg, 'Close', { duration: 2500 });
    })
    .catch((err: any) => {
      console.error('Error loading from Firestore:', err);
      this.snackBar.open(`Failed to load ${kind} from Firebase.`, 'Close', { duration: 3000 });
    });
}
loadFormsFromFirebase(): void {
  const kind: 'filled' | 'templates' | 'both' =
    this.viewMode === 'filled' ? 'filled' :
    this.viewMode === 'tofill' ? 'templates' : 'both';

  if (kind === 'templates') this.viewMode = 'tofill';
  if (kind === 'filled')    this.viewMode = 'filled';

  this.loadFromFirebase(kind);
}
onDateFocus(ev: FocusEvent): void {
  // If locked, immediately blur so the native picker doesn’t pop while dragging
  if (this.calendarLocked) {
    (ev.target as HTMLInputElement)?.blur();
  }
}


onDateMouseDown(ev: MouseEvent): void {
  if (this.calendarLocked) {
    // Block the native picker when the field is being dragged
    ev.preventDefault();
  } else {
    // When we intentionally open the picker, don’t start dragging the card
    ev.stopPropagation();
  }
}


getTemplateName(f: SavedForm): string {
  if (!f?.sourceFormId) return 'Unknown Form';
  return this.templates.find(t => t.formId === f.sourceFormId)?.formName || 'Unknown Form';
}
  getPageHeight(page: { fields: any[] }): number {
    const MIN = 800;
    const PAD = 120;
    if (!page?.fields?.length) return MIN;

    const maxY = page.fields.reduce((m, f) => {
      const y = Number(f?.position?.y ?? 0);
      const h = Number(f?.height) || (f?.type === 'signature' ? 150 : f?.type === 'textarea' ? 120 : 48);
      return Math.max(m, y + h);
    }, 0);

    return Math.max(MIN, Math.ceil(maxY + PAD));
  }

  /* ---------------- Opening for edit ---------------- */

getAdjustedHeight(
  fieldHeight: number | null | undefined,
  min = 40,
  labelSpace = 22
): number | null {
  if (!fieldHeight) return null;
  const wrapperPaddingV = 12; // .field-wrapper { padding: 6px 8px; }
  return Math.max(min, fieldHeight - labelSpace - wrapperPaddingV);
}

 get isFillMode(): boolean {
  // Editor opened from “Forms to Fill” or “Filled Forms”
  return this.viewMode === 'tofill' || this.viewMode === 'filled';
}

getSignatureCanvasHeight(fieldHeight: number | null | undefined, min = 120, labelSpace = 22): number {
  if (fieldHeight == null) return min;                 // accept null/undefined
  return Math.max(min, fieldHeight - labelSpace);
}
private normalizeCurrentForm(): void {
  const sf = this.selectedForm;
  if (!sf) return;

  for (const page of sf.formPages ?? []) {
    for (const field of page.fields ?? []) {
      
      this.ensureGridMatrixDefaultsSafe(field);  // 2-D cells, rows/cols, cellW/cellH
      this.clampGridItems?.(field);              // optional; keep items inside each cell
    }
  }
}
 openForm(form: SavedForm): void {
  const instance: FilledInstance = {
    instanceId: form.source === 'filled' ? form.formId : null,
    templateId: form.source === 'template' ? form.formId : undefined,
    formName: form.formName || 'Untitled',
    formPagesSnapshot: JSON.parse(JSON.stringify(form.formPages)),
    data: {},
    preview: null,
    updatedAt: Date.now(),
  };

  this.normalizeCurrentForm();
  this.beginEditing(instance);

  requestAnimationFrame(() => {
    this.applyPositionsToLiveForm();

    // 🔹 Lock the canvas width immediately after rendering
    const el = document.getElementById('form-to-export');
    if (el) {
      this.setPdfContentWidthVar(el);
    }
  });
}
private freezePage(livePage: HTMLElement, clonePage: HTMLElement) {
  const hostRect = livePage.getBoundingClientRect();
  const liveFields = Array.from(livePage.querySelectorAll<HTMLElement>('.field-wrapper'));
  for (const el of liveFields) {
    const id = el.getAttribute('data-id');
    if (!id) continue;
    const r = el.getBoundingClientRect();
    const c = clonePage.querySelector<HTMLElement>(`.field-wrapper[data-id="${id}"]`);
    if (!c) continue;
    c.style.position = 'absolute';
    c.style.left  = `${Math.round(r.left - hostRect.left)}px`;
    c.style.top   = `${Math.round(r.top  - hostRect.top)}px`;
    c.style.width = `${Math.round(r.width)}px`;
    c.style.height= `${Math.round(r.height)}px`;
  }
  if (!clonePage.style.position) clonePage.style.position = 'relative';
}
  private syncInkAndPhotosIntoValues() {
    (this.selectedForm?.formPages || []).forEach((p) =>
     p.fields.forEach((f: FormField) => {

        if (f.type === 'signature') {
          const cnv = this.getCanvasById(f.id);
          if (cnv) f.value = cnv.toDataURL('image/png');
        }
      })
    );
  }

  private async withPdfMode<T>(fn: () => Promise<T> | T): Promise<T> {
    document.body.classList.add('for-pdf');
    try {
      return await fn();
    } finally {
      document.body.classList.remove('for-pdf');
    }
  }

private beginEditing(inst: FilledInstance) {
  this.currentInstance = JSON.parse(JSON.stringify(inst));
  this.selectedForm = {
    formId: inst.instanceId ?? inst.templateId ?? 'temp',
    formName: inst.formName,
    formPages: inst.formPagesSnapshot,
    source: inst.instanceId ? 'filled' : 'template',
  };
    this.selectedForm.formPages.forEach(p =>
    p.fields.forEach(f =>{
this.normalizeFieldType(f);  
     this.ensureGridMatrixDefaults(f);
    })
  );
 this.selectedForm.formPages.forEach(p =>
    p.fields
      .filter(f => ['data-grid', 'grid', 'matrix'].includes((f.type || '').toLowerCase()))
      .forEach(f => this.clampGridItems(f))
  );
 this.hydrateAllGridsFromValues();  // <-- add this

  // Filled experience (no drag/resize chrome)
  this.isBuilderMode = false;
  this.fillLayoutMode = 'exact';
  this.filledDataName = inst.formName;
  this.showFormEditor = true;
  this.showNameInput = false;
  this.nameError = false;
  this.adjustFormContainerHeight();

  setTimeout(() => {
    this.initCanvases();
    requestAnimationFrame(() => this.applyPositionsToLiveForm());
  }, 0);
}


/** Compute a JSON-friendly value for saving (rows -> cols -> items -> value) */
private computeGridValue(f: any) {
  const gm = f?.gridMatrix;
  if (!gm?.cells) return null;
  return gm.cells.map((row: any[]) =>
    row.map((cell: any) =>
      (cell.items || []).map((it: any) => it?.value ?? null)
    )
  );
}

/** Called on ANY input change inside the grid to keep field.value in sync */
onGridInputChange(field: any) {
  this.ensureGridMatrixDefaults(field);
  field.value = this.computeGridValue(field);
}

/** True if any cell has a non-empty value (for required) */
gridHasAnyValue(field: DataGridField): boolean {
  const cells2D = this.ensure2DGrid(field.gridMatrix);
  for (const row of cells2D) {
    for (const cell of row) {
      for (const it of (cell.items || [])) {
        if ((it as any)?.type === 'file') { if ((it as any).value) return true; continue; }
        const v = (it as any)?.value;
        if (typeof v === 'number') { if (!Number.isNaN(v)) return true; }
        else if (typeof v === 'string') { if (v.trim().length) return true; }
        else if (v != null) return true;
      }
    }
  }
  return false;
}


/** Apply previously-saved field.value back into gm.cells[*][*].items[*].value */
private hydrateGridValuesForField(f: any) {
  if (f.type !== 'data-grid') return;
  this.ensureGridMatrixDefaults(f);

  const gm = f.gridMatrix;
  const vals = f.value; // expected shape: [rows][cols][items] (same as computeGridValue)
  if (!Array.isArray(vals)) return;

  for (let r = 0; r < gm.rows; r++) {
    for (let c = 0; c < gm.cols; c++) {
      const cell = gm.cells?.[r]?.[c];
      const cellVals = vals?.[r]?.[c];
      if (!cell || !Array.isArray(cellVals)) continue;

      for (let i = 0; i < cell.items.length; i++) {
        const it = cell.items[i];
        it.value = (i < cellVals.length) ? cellVals[i] : it.value ?? null;
      }
    }
  }
}

/** Run this before collecting values to ensure grid fields set field.value */
private syncGridValuesIntoFields() {
  (this.selectedForm?.formPages || []).forEach(p =>
    (p.fields || []).forEach((f: any) => {
      if (f.type === 'data-grid') f.value = this.computeGridValue(f);
    })
  );
}

/** Run this after loading/opening a form so the grid controls show saved values */
private hydrateAllGridsFromValues() {
  (this.selectedForm?.formPages || []).forEach(p =>
    (p.fields || []).forEach((f: any) => this.hydrateGridValuesForField(f))
  );
}
private measureTightControlBox(wrapper: HTMLElement): { w: number; h: number } {
  // what we consider the "real" control inside the wrapper
  const tightSel =
    '.date-input-shell, .fw-field, .mat-mdc-form-field, ' +
    'textarea, select, input[type="text"], input[type="number"], input[type="email"], input[type="tel"], ' +
    '.checkbox-group, .radio-group, canvas.signature-canvas, img.uploaded-img';

  const ctrl = wrapper.querySelector<HTMLElement>(tightSel) || wrapper;
  const r = ctrl.getBoundingClientRect();

  // include label height (so the stored height matches what you see)
  const label = wrapper.querySelector<HTMLElement>('.field-label');
  const labelH = label ? Math.ceil(label.getBoundingClientRect().height) + 6 : 0;

  return {
    w: Math.max(20, Math.round(r.width)),
    h: Math.max(20, Math.round(r.height + labelH)),
  };
}

  

  private ensureProblemInit(field: any) {
    if (!field.problemItems) field.problemItems = [];
  }

  addProblemItem(field: any) {
    this.ensureProblemInit(field);
    field.problemItems.push({ no: field.problemItems.length + 1, text: '' });
  }

  updateProblemText(field: any, idx: number, val: string) {
    if (!field?.problemItems?.[idx]) return;
    field.problemItems[idx].text = val ?? '';
  }

  removeProblemItem(field: any, idx: number) {
    if (!field?.problemItems) return;
    field.problemItems.splice(idx, 1);
    field.problemItems.forEach((it: any, i: number) => (it.no = i + 1));
  }

  isDescriptionField(field: any): boolean {
    if (!field) return false;
    const typeOk = field.type === 'textarea' || field.type === 'description';
    const label = (field.label || '').toString().trim();
    return (
      typeOk &&
      (/description/i.test(label) ||
        field.id === 'description' ||
        field.isDescription === true ||
        Array.isArray(field.problemItems))
    );
  }

  resizingField: FormField | null = null;
  private startX = 0;
  private startY = 0;
  private startW = 0;
  private startH = 0;

  startResize(e: MouseEvent, field: FormField) {
    e.preventDefault();
    e.stopPropagation();
    this.resizingField = field;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startW = field.width ?? 240;
    this.startH = field.height ?? this.getWrapperCurrentHeight(field);
    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.stopResize);
  }

  onResizeMove = (e: MouseEvent) => {
    if (!this.resizingField) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    this.resizingField.width = Math.max(20, this.startW + dx);
    this.resizingField.height = Math.max(20, this.startH + dy);
  };

  stopResize = () => {
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.stopResize);
    this.resizingField = null;
  };

  private getWrapperCurrentHeight(field: FormField): number {
    const el = document.querySelector<HTMLElement>(`.field-wrapper[data-id="${field.id}"]`);
    return el ? el.getBoundingClientRect().height : 120;
  }

  private freezePositionsFromLive(liveSurface: HTMLElement, cloneSurface: HTMLElement) {
    const hostRect = liveSurface.getBoundingClientRect();
    const liveFields = Array.from(liveSurface.querySelectorAll<HTMLElement>('.field-wrapper'));
    for (const live of liveFields) {
      const id = live.getAttribute('data-id');
      if (!id) continue;
      const r = live.getBoundingClientRect();
      const cloneField = cloneSurface.querySelector<HTMLElement>(`.field-wrapper[data-id="${id}"]`);
      if (!cloneField) continue;
      cloneField.style.position = 'absolute';
      cloneField.style.left = `${Math.round(r.left - hostRect.left)}px`;
      cloneField.style.top = `${Math.round(r.top - hostRect.top)}px`;
      cloneField.style.width = `${Math.round(r.width)}px`;
      cloneField.style.height = `${Math.round(r.height)}px`;
    }
    const cs = cloneSurface as HTMLElement;
    if (!cs.style.position) cs.style.position = 'relative';
  }
  private canvasToBlob(cnv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    cnv.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  );
}

/** Upload all signature canvases to Storage; annotate fields with signatureUrl. */
private async uploadAllSignatures(kind: 'filled' | 'template', docId: string) {
  if (!this.selectedForm) return;

  for (const page of this.selectedForm.formPages) {
    for (const field of page.fields) {
      if (field.type !== 'signature') continue;
      const cnv = this.getCanvasById(field.id);
      if (!cnv) continue;

      const blob = await this.canvasToBlob(cnv);
      const url = await this.formService.uploadImageBlob(kind, docId, field.id, blob);

      // keep dataURL for local preview if you like, but also store a durable URL:
      (field as any).signatureUrl = url;
      // optional: shrink payload by clearing base64
      // field.value = undefined;
    }
  }
}

private replaceControlsWithValues(root: HTMLElement) {
  const replaceHost = (el: HTMLElement, text: string) => {
    const host = el.closest('.mat-mdc-form-field, .mat-form-field') as HTMLElement | null;
    const target = host ?? el;                       // <- replace the wrapper, not just the input

    const span = document.createElement('span');
    span.className = 'print-value';
    span.textContent = text ?? '';

    const r = target.getBoundingClientRect();
    span.style.display = 'block';
    span.style.width = `${Math.max(1, Math.round(r.width))}px`;
    span.style.minHeight = `${Math.max(36, Math.round(r.height || 36))}px`;
    span.style.boxSizing = 'border-box';
    span.style.padding = '6pt 8pt';
    span.style.border = '0.5pt solid #E5E7EB';
    span.style.background = '#FAFAFA';
    span.style.borderRadius = '4px';
    span.style.whiteSpace = 'pre-wrap';

    target.replaceWith(span);
  };

  // text-like inputs
  root.querySelectorAll<HTMLInputElement>(
    'input[type="text"],input[type="number"],input[type="email"],input[type="tel"],input[type="date"]'
  ).forEach(el => replaceHost(el, el.value ?? ''));

  // textarea
  root.querySelectorAll<HTMLTextAreaElement>('textarea')
      .forEach(el => replaceHost(el, el.value ?? ''));

  // native select
  root.querySelectorAll<HTMLSelectElement>('select')
      .forEach(el => {
        const label = el.selectedOptions?.[0]?.text ?? el.value ?? '';
        replaceHost(el, label);
      });

  // plain checkboxes (non-Material)
  root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(el => {
    const span = document.createElement('span');
    const labelText = (el.parentElement?.textContent || '').trim();
    span.textContent = `${el.checked ? '☑' : '☐'} ${labelText}`;
    span.style.display = 'inline-block';
    el.parentElement ? el.parentElement.replaceWith(span) : el.replaceWith(span);
  });

  // plain radios (non-Material)
  root.querySelectorAll<HTMLLabelElement>('label.radio-option').forEach(label => {
    const input = label.querySelector<HTMLInputElement>('input[type="radio"]');
    const text = (label.textContent || '').trim();
    const span = document.createElement('span');
    span.textContent = `${input?.checked ? '◉' : '○'} ${text}`;
    span.style.display = 'inline-block';
    label.replaceWith(span);
  });
}
private prettyValue(f: FormField): string {
  if (!f) return '';
  if (f.type === 'checkbox' && Array.isArray(f.options)) {
    const chosen = Array.isArray(f.value)
      ? f.value
      : f.options.filter(o => !!o.checked).map(o => o.value);
    return chosen
      .map(v => f.options!.find(o => o.value === v)?.label ?? String(v))
      .join(', ');
  }
  if (f.type === 'radio' && Array.isArray(f.options)) {
    const opt = f.options.find(o => o.checked || o.value === f.value);
    return opt?.label ?? (f.value ?? '');
  }
  if (f.type === 'date') return this.toDdMmYyyy(f.value) || '';
  return (f.value ?? '').toString();
}

/** Replace the whole control area with a single full-width value block. */
private renderValuesIntoWrappers(clone: HTMLElement) {
  (this.selectedForm?.formPages || []).forEach(p => {
    (p.fields || []).forEach((f: FormField) => {
      const wrap = clone.querySelector<HTMLElement>(`.field-wrapper[data-id="${f.id}"]`);
      if (!wrap) return;

      // keep the label text if present
      const labelEl = wrap.querySelector<HTMLElement>('.field-label');
      const labelText = (labelEl?.textContent || f.label || '').trim();

      // clear everything inside the wrapper
      wrap.replaceChildren();

      if (labelText) {
        const lab = document.createElement('div');
        lab.className = 'field-label';
        lab.textContent = labelText;
        wrap.appendChild(lab);
      }

      // signatures/photos are handled elsewhere – skip here
      if (f.type === 'signature' || f.type === 'photo' || f.type === 'file') return;

      const val = document.createElement('div');
      val.className = 'print-value';
      val.textContent = this.prettyValue(f);

      val.style.display = 'block';
      val.style.width = '100%';
      val.style.boxSizing = 'border-box';
      val.style.minHeight = (f.height ? Math.max(36, f.height - 22) : 36) + 'px';
      val.style.padding = '6pt 8pt';
      val.style.border = '0.5pt solid #E5E7EB';
      val.style.background = '#FAFAFA';
      val.style.borderRadius = '4px';
      val.style.whiteSpace = 'pre-wrap';

      wrap.appendChild(val);
    });
  });
}

  private addCanvasAsMultipage(
    pdf: jsPDF,
    sourceCanvas: HTMLCanvasElement,
    pageWmm: number,
    pageHmm: number,
    useExistingFirstPdfPage: boolean,
    marginMm = 8
  ): void {
    const header = (this.selectedForm?.formName || '').trim();
    const headerHmm = header ? 12 : 0;

    const availWmm = pageWmm - marginMm * 2;
    const pxPerMm = sourceCanvas.width / pageWmm;
    const pageHeightPx = Math.floor((pageHmm - marginMm * 2 - headerHmm) * pxPerMm);

    let offsetPx = 0;
    let isFirstSlice = true;

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = sourceCanvas.width;
    const ctx = sliceCanvas.getContext('2d') as CanvasRenderingContext2D;

    while (offsetPx < sourceCanvas.height) {
      const slicePx = Math.min(pageHeightPx, sourceCanvas.height - offsetPx);
      sliceCanvas.height = slicePx;
      ctx.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        sourceCanvas,
        0,
        offsetPx,
        sourceCanvas.width,
        slicePx,
        0,
        0,
        sliceCanvas.width,
        slicePx
      );

      const sliceHmm = slicePx / pxPerMm;
      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.98);

      if (!(useExistingFirstPdfPage && isFirstSlice)) pdf.addPage();

      if (header) {
        const cx = pageWmm / 2;
        const ty = marginMm + 5;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.text(header, cx, ty, { align: 'center' } as any);
        pdf.setDrawColor(210);
        pdf.line(marginMm, ty + 3.5, pageWmm - marginMm, ty + 3.5);
      }
      pdf.addImage(imgData, 'JPEG', marginMm, marginMm + headerHmm, availWmm, sliceHmm);

      offsetPx += slicePx;
      isFirstSlice = false;
    }
  }

  private injectPdfCleanupCss(root: HTMLElement) {
    const style = document.createElement('style');
    style.setAttribute('data-pdf-cleanup', '');
    
    style.textContent = `
      .field-wrapper::before,
      .field-wrapper::after,
      .resize-handle,
      .drag-handle,
      [data-nonprint],
      .export-pdf-icons,
      .ui-only { display: none !important; }

      .field-wrapper { box-shadow: none !important; background: #fff !important; }

      .mat-form-field-underline,
      .mat-form-field-ripple,
      .mat-form-field-suffix,
      .mat-form-field-prefix { display: none !important; }
         /* ✨ Make print values expand to the full control width in PDF */
    .field-wrapper .print-value {
      display: block !important;
      width: 100% !important;
      box-sizing: border-box !important;
      min-height: 36px;                 /* sensible fallback */
      padding: 6pt 8pt;
      border: 0.5pt solid #E5E7EB;
      background: #FAFAFA;
      border-radius: 4px;
      white-space: pre-wrap;
    }

    /* Ensure Material containers don't constrain width */
    .field-wrapper .mat-form-field,
    .field-wrapper .mat-form-field-wrapper,
    .field-wrapper .mat-form-field-flex,
    .field-wrapper .mat-form-field-infix {
      display: block !important;
      width: 100% !important;
    }

    /* Avoid clipping when rendering to canvas */
    .field-wrapper, .field-wrapper * { overflow: visible !important; }
    `;
    root.prepend(style);
    
  }
  private restoreCheckboxesFromValue() {
  (this.selectedForm?.formPages || []).forEach(p =>
    p.fields.forEach((f: any) => {
      if (f.type === 'checkbox' && Array.isArray(f.options)) {
        const chosen: string[] = Array.isArray(f.value) ? f.value : [];
        f.options.forEach((o: any) => o.checked = chosen.includes(o.value));
      }
    })
  );
}
  

  private reflowIntoGrid(clone: HTMLElement): void {
    const surface =
      (clone.querySelector('.page-surface') as HTMLElement) ||
      (clone.querySelector('.form-page-container') as HTMLElement) ||
      clone;

    const fields = Array.from(surface.querySelectorAll<HTMLElement>('.field-wrapper'));
    fields.sort((a, b) => {
      const ra = a.getBoundingClientRect(),
        rb = b.getBoundingClientRect();
      return ra.top === rb.top ? ra.left - rb.left : ra.top - rb.top;
    });

    const grid = document.createElement('div');
    grid.className = 'pdf-grid';
    surface.replaceChildren(grid);

    fields.forEach((el) => {
      el.style.position = 'static';
      el.style.left = el.style.top = '';
      el.style.width = el.style.height = '';
      grid.appendChild(el);
    });
  }

private swapSignaturesInto(root: HTMLElement) {
  (this.selectedForm?.formPages || []).forEach(p =>
p.fields.forEach((f: FormField) => {

      if (f.type !== 'signature') return;

      const wrap = root.querySelector<HTMLElement>(`.field-wrapper[data-id="${f.id}"]`);
      const liveCanvas = wrap?.querySelector<HTMLCanvasElement>(`canvas[data-id="${f.id}"]`);
      const cnv = this.getCanvasById(f.id);
      if (!wrap || !cnv) return;

      const w = Math.round(wrap.clientWidth || f.width || 300);
      const h = Math.round(wrap.clientHeight || f.height || 150);

      const img = new Image();
      img.src = cnv.toDataURL('image/png');
      img.style.display = 'block';
      img.style.width = `${w}px`;
      img.style.height = `${h}px`;

      if (liveCanvas) liveCanvas.replaceWith(img);
      else wrap.appendChild(img);

      // hide UI-only clear button if present
      const clearBtn = wrap.querySelector('button');
      if (clearBtn) (clearBtn as HTMLElement).style.display = 'none';
    })
  );
}


  private readonly edgeGrab = 20;
  onWrapperMouseDown(e: MouseEvent, field: FormField) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const nearRight = rect.width - offsetX <= this.edgeGrab;
    const nearBottom = rect.height - offsetY <= this.edgeGrab;
    if (!nearRight && !nearBottom) return;

    e.preventDefault();
    e.stopPropagation();

    this.resizingField = field;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startW = field.width ?? rect.width;
    this.startH = field.height ?? rect.height;

    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.stopResize);
  }

  closeForm(): void {
    this.showFormEditor = false;
    this.selectedForm = null;
    this.currentInstance = null;
    this.filledDataName = '';
    this.showNameInput = false;
    this.nameError = false;
    this.closeFormEvent.emit();
  }
async confirmSaveFilledForm(): Promise<void> {
  // 0) guards + UX
  if (!this.selectedForm || !this.currentInstance) {
    this.snackBar.open('Form not ready to save.', 'Close', { duration: 2000 });
    return;
  }
  const nameTrimmed = (this.filledDataName || '').trim();
  if (!nameTrimmed) {
    this.nameError = true;
    this.snackBar.open('Please enter a form name.', 'Close', { duration: 2000 });
    return;
  }
  this.nameError = false;

  // 1) capture signatures (best-effort)
  try {
this.selectedForm.formPages.forEach((page: FormPage) => {
  page.fields.forEach((field: FormField) => {
        if (field.type === 'signature') {
          const c = this.getCanvasById(field.id);
          if (c) field.value = c.toDataURL('image/png');
        }
      });
    });
  } catch {}

  
this.selectedForm.formPages.forEach((p) => p.fields.forEach((f: any) => {
  if (f.type === 'checkbox' && Array.isArray(f.options)) {
    f.value = f.options.filter((o: any) => !!o.checked).map((o: any) => o.value);
  }
}));
try {
  this.updatePositionsFromDOM();
} catch {}
  this.syncGridValuesIntoFields();
  // 2) collect values
const values: Record<string, any> = {};
this.selectedForm.formPages.forEach((p: FormPage) =>
  p.fields.forEach((f: FormField) => {
    if (f.type === 'checkbox') {
      // ensure array even if nothing selected
      values[f.id] = Array.isArray(f.value) ? f.value : [];
    } else {
      values[f.id] = f.value ?? null;
    }
  })
);

  // 3) tiny preview (non-blocking)
  try {
    const formElement = document.querySelector('.form-page-container') as HTMLElement | null;
    if (formElement) {
      const canvas = await html2canvas(formElement, { scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)) });
      this.formPdfImagePreview = canvas.toDataURL('image/png');
    }
  } catch {}

  // 4) update working instance
  this.currentInstance.formName = nameTrimmed;
  this.currentInstance.formPagesSnapshot = JSON.parse(JSON.stringify(this.selectedForm.formPages));
  this.currentInstance.data = values;
  this.currentInstance.preview = this.formPdfImagePreview || null;
  this.currentInstance.updatedAt = Date.now();

  // 5) ask where to save — if dialog fails, default to firebase
  let choice: 'local' | 'firebase' | 'both' | null = null;
  try {
    choice = await this.openChoice('save');
  } catch (e) {
    console.warn('[confirmSaveFilledForm] dialog failed; defaulting to firebase', e);
    choice = 'firebase';
  }
  if (!choice) {
    this.snackBar.open('Save cancelled.', 'Close', { duration: 1500 });
    return;
  }

  // 6) local helper
  const saveLocal = () => {
    const existingId = this.currentInstance!.instanceId || null;
    const submissionId = existingId || ('filled-' + Math.random().toString(36).slice(2));
    const sourceFormId = this.currentInstance!.templateId || this.selectedForm!.formId;
    const snapshot = JSON.parse(JSON.stringify(this.currentInstance!.formPagesSnapshot));

    const list: any[] = JSON.parse(localStorage.getItem('filledForms') || '[]');
    const rec = {
      id: submissionId,
      sourceFormId,
      formName: nameTrimmed,
      formPagesSnapshot: snapshot,
      data: this.currentInstance!.data,
      updatedAt: new Date().toISOString(),
      pdfUrl: this.currentInstance!.preview ?? null,
    };
    const i = list.findIndex((x) => (x.id ?? x.formId) === submissionId);
    if (i >= 0) list[i] = rec; else list.unshift(rec);
    localStorage.setItem('filledForms', JSON.stringify(list));
    this.currentInstance!.instanceId = submissionId;

    // reflect in UI
    const mem: SavedForm = {
      formId: submissionId,
      formName: nameTrimmed,
      formPages: snapshot,
      source: 'filled',
      pdfUrl: this.currentInstance!.preview ?? null,
    };
    const idx = this.forms.findIndex((x) => x.formId === submissionId);
    if (idx >= 0) this.forms[idx] = mem; else this.forms.unshift(mem);
    this.splitLists();
  };

  // 7) firebase helpers
  const saveFirebaseCreate = async () => {
    const ref = await this.formService.createFilledForm({
      sourceFormId: this.currentInstance!.templateId ?? this.selectedForm!.formId,
      formName: this.currentInstance!.formName,
      name: this.currentInstance!.formName,
      data: this.currentInstance!.data,
      formPagesSnapshot: this.currentInstance!.formPagesSnapshot,
      preview: this.currentInstance!.preview ?? null,
      updatedAt: this.currentInstance!.updatedAt,
    });
    // optional: upload signature images and patch the doc
    try {
      await this.uploadAllSignatures('filled', ref.id);
      await this.formService.updateFilledForm(ref.id, { formPagesSnapshot: this.selectedForm!.formPages });
    } catch {}
    this.forms.unshift({
      formId: ref.id,
      formName: this.currentInstance!.formName,
      formPages: this.currentInstance!.formPagesSnapshot,
      source: 'filled',
      pdfUrl: this.currentInstance!.preview ?? null,
    });
    this.splitLists();
  };

  const saveFirebaseUpdate = async () => {
    await this.formService.updateFilledForm(this.selectedForm!.formId, {
      formName: this.currentInstance!.formName,
      name: this.currentInstance!.formName,
      data: this.currentInstance!.data,
      formPagesSnapshot: this.currentInstance!.formPagesSnapshot,
      preview: this.currentInstance!.preview ?? null,
      updatedAt: this.currentInstance!.updatedAt,
    });
    const idx = this.forms.findIndex((f) => f.formId === this.selectedForm!.formId);
    if (idx >= 0) this.forms[idx].formName = this.currentInstance!.formName;
    this.splitLists();
  };

  // 8) perform save
  try {
    const isFilled = this.selectedForm.source === 'filled';
    if (choice === 'local') {
      saveLocal();
      this.snackBar.open(`Form saved locally as “${nameTrimmed}”`, 'Close', { duration: 2500 });
    } else if (choice === 'firebase') {
      if (isFilled) await saveFirebaseUpdate(); else await saveFirebaseCreate();
      this.snackBar.open(`Form saved to Firebase as “${nameTrimmed}”`, 'Close', { duration: 2500 });
    } else {
      // both
      saveLocal();
      if (isFilled) await saveFirebaseUpdate(); else await saveFirebaseCreate();
      this.snackBar.open(`Form saved locally & to Firebase as “${nameTrimmed}”`, 'Close', { duration: 2500 });
    }
    this.filledFormsUpdated.emit();
    this.closeForm();
  } catch (err) {
    console.error('Save failed:', err);
    this.snackBar.open('Failed to save. Check console for details.', 'Close', { duration: 3500 });
  }
}
  /* ---------------- Save (Local / Firebase / Both) ---------------- */



  /* ---------------- Delete ---------------- */

  /* ---------------- File handling ---------------- */

  onFileSelected(event: Event, field: any) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        field.value = reader.result as string; // base64
         this.cdr.detectChanges(); 
      };
      reader.readAsDataURL(file);
    }
  }
async deleteForm(form: SavedForm): Promise<void> {
  const ok = confirm(`Delete "${form.formName || 'Untitled'}"? This cannot be undone.`);
  if (!ok) return;

  const doLocalCleanup = () => {
    const stored = localStorage.getItem('filledForms');
    if (stored) {
      const arr: any[] = JSON.parse(stored);
      const next = arr.filter((x) => (x.id ?? x.formId) !== form.formId);
      localStorage.setItem('filledForms', JSON.stringify(next));
    }
    this.forms = this.forms.filter((f) => f.formId !== form.formId);
    this.splitLists?.();
    if (this.selectedForm?.formId === form.formId) this.closeForm?.();
    this.snackBar.open('Deleted.', 'Close', { duration: 2000 });
  };

  try {
    // Local-only filled instance
    const isLocalOnlyFilled = form.source === 'filled' && form.formId.startsWith('filled-');
    if (isLocalOnlyFilled) {
      doLocalCleanup();
      return;
    }

    if (form.source === 'filled') {
      // Remote filled instance
      await this.formService.deleteFilledForm(form.formId);
      doLocalCleanup();
      return;
    }

    // Template: delete master + branch mirrors
    const id = form.firebaseId || form.formId;
    await this.formService.deleteFormTemplate(id); // ✅ public method
    doLocalCleanup();
  } catch (err) {
    console.error(err);
    this.snackBar.open('Failed to delete.', 'Close', { duration: 3000 });
  }
}
  /* ---------------- Signature / Pointer helpers ---------------- */
isInlineRow(field: any): boolean {
  const t = (field?.type || 'text').toLowerCase();
  // things that should stack vertically
  const stackTypes = ['textarea', 'description', 'signature', 'file', 'photo'];
  return !stackTypes.includes(t);
}
initCanvases(): void {
  this.ctxMap = {};
  this.drawingMap = {};
  this.lastPos = {};
  // tear down old observers if any
  Object.values(this.sigResizeObs).forEach(o => o.disconnect());
  this.sigResizeObs = {};
  this.sigSrcMap = {};

  if (!this.canvasRefs) return;

  this.canvasRefs.forEach((ref) => {
    const canvas = ref.nativeElement;
    const fieldId = canvas.getAttribute('data-id') || '';
    const field = this.selectedForm?.formPages
      .flatMap((p) => p.fields)
      .find((f) => f.id === fieldId);

    // capture signature source for redraws (value first, fallback to URL)
    if (field?.type === 'signature') {
      const src = (field as any)?.value || (field as any)?.signatureUrl || '';
      if (src) this.sigSrcMap[fieldId] = src;
    }

    // set CSS size
    const cssW = Math.max(1, (field?.width ?? canvas.clientWidth) || 300);
  const cssH = Math.max(1, this.getSignatureCanvasHeight(field?.height ?? undefined) || canvas.clientHeight || 150);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // initial HiDPI setup + initial draw
    this.resizeAndRedrawSignature(fieldId, canvas, ctx, cssW, cssH);

    // pen style for live drawing
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    this.ctxMap[fieldId] = ctx;
    this.drawingMap[fieldId] = false;

    // 🔽 install a ResizeObserver with rAF throttle
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      // throttle bursts of size changes into one draw per frame
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const entry = entries[0];
        if (!entry) return;
        const box = entry.contentRect;
        const newCssW = Math.max(1, Math.round(box.width));
        const newCssH = Math.max(1, Math.round(box.height));
        // keep CSS size authoritative
        canvas.style.width = newCssW + 'px';
        canvas.style.height = newCssH + 'px';
        this.resizeAndRedrawSignature(fieldId, canvas, ctx, newCssW, newCssH);
      });
    });
    ro.observe(canvas);
    this.sigResizeObs[fieldId] = ro;
  });
}
  private swapPhotosIntoClone(root: HTMLElement) {
(this.selectedForm?.formPages || []).forEach((p: FormPage) =>
p.fields.forEach((f: FormField) => {
      if (f.type !== 'file' && f.type !== 'photo') return;
      if (!f.value) return;
      const wrap = root.querySelector<HTMLElement>(`.field-wrapper[data-id="${f.id}"]`);
      if (!wrap) return;
      const img = document.createElement('img');
      img.src = f.value;
      img.style.display = 'block';
      if (f.width)  img.style.width  = `${Math.round(f.width)}px`;
      if (f.height) img.style.height = `${Math.round(f.height)}px`;
      wrap.replaceChildren(img);
    })
  );
}

  getCanvasById(fieldId: string): HTMLCanvasElement | null {
    if (!this.canvasRefs) return null;
    const ref = this.canvasRefs.find((r) => r.nativeElement.getAttribute('data-id') === fieldId);
    return ref ? ref.nativeElement : null;
  }

startDrawing(event: PointerEvent, fieldId: string): void {
  event.preventDefault();
  (event.target as HTMLElement)?.setPointerCapture?.(event.pointerId);

  this.drawingMap[fieldId] = true;

  const pos = this.getPointerPos(event, fieldId);
  this.lastPos[fieldId] = pos;

  const ctx = this.ctxMap[fieldId];
  if (!ctx) return;

  // sensible defaults (only once if you want)
  ctx.lineWidth = ctx.lineWidth || 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';

  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
}


draw(event: PointerEvent, fieldId: string): void {
  event.preventDefault();
  if (!this.drawingMap[fieldId]) return;

  const ctx = this.ctxMap[fieldId];
  if (!ctx) return;

  const pos = this.getPointerPos(event, fieldId);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  this.lastPos[fieldId] = pos;
}

stopDrawing(event: PointerEvent, fieldId: string): void {
  event.preventDefault();
  if (!this.drawingMap[fieldId]) return;

  const ctx = this.ctxMap[fieldId];
  if (!ctx) return;

  ctx.closePath();
  this.drawingMap[fieldId] = false;

  const cnv = this.getCanvasById(fieldId);
  const field = this.selectedForm?.formPages.flatMap(p => p.fields).find(f => f.id === fieldId);
  if (cnv && field) {
    const data = cnv.toDataURL('image/png');
    field.value = data;
    this.sigSrcMap[fieldId] = data;
  }
}

clearSignatureCanvas(fieldId: string): void {
  const canvas = this.getCanvasById(fieldId);
  const ctx = this.ctxMap[fieldId];
  if (canvas && ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const field = this.selectedForm?.formPages.flatMap((p) => p.fields).find((f) => f.id === fieldId);
    if (field) field.value = '';
    delete this.sigSrcMap[fieldId];
  }
}


getPointerPos(event: PointerEvent, fieldId: string): { x: number; y: number } {
  const canvas = this.getCanvasById(fieldId);
  if (!canvas) return { x: 0, y: 0 };

  const rect = canvas.getBoundingClientRect();
  // convert CSS pixels -> canvas pixels
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top)  * scaleY
  };
}

  /* ---------------- Layout / UI helpers ---------------- */

  addNewField(pageIndex: number, newField: FormField) {
    if (!this.selectedForm) return;
    newField.position = this.getNextAvailablePosition(pageIndex);
    this.selectedForm.formPages[pageIndex].fields.push(newField);
    this.adjustFormContainerHeight();
    this.snackBar.open('Field added. Remember to Save.', 'Close', { duration: 1500 });
  }

  deleteField(pageIndex: number, fieldIndex: number) {
    if (!this.selectedForm) return;
    this.selectedForm.formPages[pageIndex].fields.splice(fieldIndex, 1);
    this.adjustFormContainerHeight();
    this.snackBar.open('Field removed. Remember to Save.', 'Close', { duration: 1500 });
  }

  createDefaultField(): FormField {
    return {
      id: 'field_' + Math.random().toString(36).substring(2, 9),
      label: 'New Field',
      type: 'text',
      value: '',
      width: 300,
      height: 150,
      required: false,
      position: { x: 10, y: 10 },
    };
  }

  getNextAvailablePosition(pageIndex: number): { x: number; y: number } {
    if (!this.selectedForm) return { x: 10, y: 10 };
    const page = this.selectedForm.formPages[pageIndex];
    if (!page) return { x: 10, y: 10 };

    const margin = 10;
    const fieldHeight = 150;
    let maxY = 0;

    page.fields.forEach((field) => {
      const bottom = (field.position?.y || 0) + (field.height || fieldHeight);
      if (bottom > maxY) maxY = bottom;
    });

    return { x: margin, y: maxY + margin };
  }

  autoGrow(element: EventTarget | null) {
    if (!(element instanceof HTMLTextAreaElement)) return;
      if (this.fixedLayout) return; 
    element.style.width = 'auto';
    element.style.height = 'auto';

    const maxWidth = 600;
    const maxHeight = 400;

    const newWidth = Math.min(element.scrollWidth + 2, maxWidth);
    const newHeight = Math.min(element.scrollHeight + 2, maxHeight);

    element.style.width = newWidth + 'px';
    element.style.height = newHeight + 'px';
  }

  adjustFormContainerHeight(): void {
    if (!this.selectedForm) return;

    let maxY = 0;
    this.selectedForm.formPages.forEach((page) => {
      page.fields.forEach((field) => {
        const bottom = (field.position?.y || 0) + (field.height || 150);
        if (bottom > maxY) maxY = bottom;
      });
    });

    this.containerHeight = maxY + 20;
  }
private normalizeFieldType(f: any) {
  const t = String(f?.type || '').toLowerCase().replace(/[_\s]+/g, '-');
  if (t === 'datagrid' || t === 'data-grid' || t === 'grid' || t === 'matrix') {
    f.type = 'data-grid';
  } else {
    f.type = t;
  }
}

// add this helper
workspacePad = 240; // big padding around the page so you can move it anywhere
private panningPageIdx: number | null = null;
private panStart = { x: 0, y: 0, offX: 0, offY: 0 };

private normalizeTemplatePages(form: { formPages?: any[] }) {
  (form.formPages || []).forEach((p: any) => {
    // page offsets (for panning) – keep them defined
    p.offsetX = p.offsetX ?? 0;
    p.offsetY = p.offsetY ?? 0;

    (p.fields || []).forEach((f: any) => {
      // --- absolute geometry ---
      f.position ??= { x: 0, y: 0 };

      // width defaults
      if (typeof f.width !== 'number') {
        f.width = (f.type === 'data-grid') ? 600 : 300; // grid wider by default
      }

      // height defaults
      if (typeof f.height !== 'number') {
        f.height =
          f.type === 'signature'   ? 150 :
          f.type === 'textarea'    ? 120 :
          f.type === 'description' ? 120 :
          f.type === 'data-grid'   ? 200 : // provisional, refined below for matrix
          48;
      }

      // NEW: inner layout defaults so filled view matches template
      f.ui ??= {};
      if (!f.ui.direction) {
        const multiline = ['textarea','description','signature','file','photo']
          .includes(String(f.type || '').toLowerCase());
        f.ui.direction = multiline ? 'column' : 'row';
      }
      if (typeof f.ui.labelWidthPx !== 'number') f.ui.labelWidthPx = 120;
      if (typeof f.ui.gapPx        !== 'number') f.ui.gapPx        = 10;
    });
  });
}
toNativeDate(v: any): string {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth()+1).padStart(2,'0');
    const d = String(v.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const p = this.parseDdMmYyyy(String(v));
  return p ? `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}` : '';
}

toDdMmYyyy(v: any): string {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    const d = String(v.getDate()).padStart(2,'0');
    const m = String(v.getMonth()+1).padStart(2,'0');
    const y = v.getFullYear();
    return `${d}/${m}/${y}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y,m,d] = v.split('-').map(Number);
    return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
  return '';
}

parseDdMmYyyy(s: string): {d:number,m:number,y:number} | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = +m[1], mon = +m[2], y = +m[3];
  if (mon < 1 || mon > 12) return null;
  const days = new Date(y, mon, 0).getDate();
  if (d < 1 || d > days) return null;
  return { d, m: mon, y };
}

onDateInput(e: Event, field: any): void {
  const s = (e.target as HTMLInputElement).value;
  const parts = this.parseDdMmYyyy(s);
  field.value = parts
    ? `${parts.y}-${String(parts.m).padStart(2,'0')}-${String(parts.d).padStart(2,'0')}`
    : s; // keep typing buffer
}

onDateBlur(e: Event, field: any): void {
  const s = (e.target as HTMLInputElement).value.trim();
  if (!s) { field.value = ''; return; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(field.value as any)) return;
  const parts = this.parseDdMmYyyy(s);
  if (!parts) {
    this.snackBar.open('Invalid date. Use DD/MM/YYYY', 'Close', { duration: 1800 });
    field.value = '';
  } else {
    field.value = `${parts.y}-${String(parts.m).padStart(2,'0')}-${String(parts.d).padStart(2,'0')}`;
  }
}


onNativeDateChange(e: Event, field: any): void {
  const v = (e.target as HTMLInputElement).value; // 'YYYY-MM-DD'
  field.value = v || '';
}

openNativePicker(native: HTMLInputElement): void {
  const wasLocked = this.calendarLocked;
  this.calendarLocked = false;
  try {
    if (typeof (native as any).showPicker === 'function') (native as any).showPicker();
    else native.click();
  } finally {
    setTimeout(() => (this.calendarLocked = wasLocked), 0);
  }
}
updatePositionsFromDOM(): void {
  if (!this.selectedForm) return;
  const container = document.getElementById('form-to-export');
  if (!container) return;

  this.selectedForm.formPages.forEach((page, pageIndex) => {
    const pageEl = container.querySelectorAll('.page-container')[pageIndex] as HTMLElement | undefined;
    if (!pageEl) return;

    page.fields.forEach((field) => {
      const fieldEl = pageEl.querySelector<HTMLElement>(
        `.field-wrapper[data-id="${field.id}"]`
      );
      if (!fieldEl) return;

      // position relative to the page
      const hostRect = pageEl.getBoundingClientRect();
      const r = fieldEl.getBoundingClientRect();
      field.position = { x: r.left - hostRect.left, y: r.top - hostRect.top };

      // ⬇️ NEW: store tight width/height based on inner control (not the big wrapper)
      const { w, h } = this.measureTightControlBox(fieldEl);
      field.width  = w;
      field.height = h;
    });
  });
}
onPageMouseDown(e: MouseEvent, pageIndex: number) {
  // don’t start panning if you clicked on a field
  if ((e.target as HTMLElement).closest('.field-wrapper')) return;

  this.panningPageIdx = pageIndex;
  const page = this.selectedForm!.formPages[pageIndex];
  this.panStart = {
    x: e.clientX,
    y: e.clientY,
    offX: page.offsetX || 0,
    offY: page.offsetY || 0,
  };

  document.addEventListener('mousemove', this.onPageMouseMove);
  document.addEventListener('mouseup', this.onPageMouseUp);
}

onPageMouseMove = (e: MouseEvent) => {
  if (this.panningPageIdx == null || !this.selectedForm) return;
  const page = this.selectedForm.formPages[this.panningPageIdx];
  page.offsetX = this.panStart.offX + (e.clientX - this.panStart.x);
  page.offsetY = this.panStart.offY + (e.clientY - this.panStart.y);
  this.cdr.markForCheck();
};

onPageMouseUp = () => {
  document.removeEventListener('mousemove', this.onPageMouseMove);
  document.removeEventListener('mouseup', this.onPageMouseUp);
  this.panningPageIdx = null;
};

// Small helpers (optional)
centerPage(pIndex: number) {
  if (!this.selectedForm) return;
  const page = this.selectedForm.formPages[pIndex];
  page.offsetX = 0; page.offsetY = 0;
}
startFormFromTemplate(tpl: SavedForm) {
  const inst: FilledInstance = {
    instanceId: null,
    templateId: tpl.formId,
    formName: tpl.formName || 'Untitled Form',
    formPagesSnapshot: JSON.parse(JSON.stringify(tpl.formPages || [])),
    data: {},
    preview: null,
    updatedAt: Date.now(),
  };

  // ensure page coords start at (0,0)
  this.normalizePagesToTopLeft(inst.formPagesSnapshot);
  // this.anchorAllPages(inst.formPagesSnapshot); // <- only if you really use panning

  this.beginEditing(inst);
  this.restoreCheckboxesFromValue();

  // Lay out to saved geometry after the view is in the DOM
  requestAnimationFrame(() => {
    this.applyPositionsToLiveForm();
    // do one more tick to catch late material sizing
    requestAnimationFrame(() => this.applyPositionsToLiveForm());
  });
}
private normalizePagesToTopLeft(pages: FormPage[]) {
  for (const p of (pages || [])) {
    const fs = p.fields || [];
    if (!fs.length) continue;

    let minX = Infinity, minY = Infinity;
    for (const f of fs) {
      const x = Math.round(f?.position?.x ?? 0);
      const y = Math.round(f?.position?.y ?? 0);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
    }
    if (!isFinite(minX)) minX = 0;
    if (!isFinite(minY)) minY = 0;

    for (const f of fs) {
      f.position = f.position || { x: 0, y: 0 };
      f.position.x = Math.max(0, Math.round((f.position.x || 0) - minX));
      f.position.y = Math.max(0, Math.round((f.position.y || 0) - minY));
    }
  }
}
private get fixedLayout(): boolean {
  // Both template editing and filled modes should respect saved x/y/w/h
  return !!this.selectedForm && (this.selectedForm.source === 'template' || this.selectedForm.source === 'filled');
}
applyPositionsToLiveForm(): void {
  if (!this.selectedForm) return;
  const root = document.getElementById('form-to-export');
  if (!root) return;

  const pages = Array.from(root.querySelectorAll<HTMLElement>('.page-container'));
  if (!pages.length) return;

  this.selectedForm.formPages.forEach((page, pageIndex) => {
    const pageEl = pages[pageIndex];
    if (!pageEl) return;

    const host =
      (pageEl.querySelector('.page-surface') as HTMLElement) ||
      (pageEl.querySelector('.form-page-container') as HTMLElement) ||
      pageEl;

    // fixed positioning context
    if (!host.style.position) host.style.position = 'relative';

    page.fields.forEach((field) => {
      const sel = `.field-wrapper[data-id="${field.id}"]`;
      const fieldEl =
        (host.querySelector(sel) as HTMLElement) ||
        (pageEl.querySelector(sel) as HTMLElement);
      if (!fieldEl) return;

      const x = Math.max(0, Math.round(field.position?.x ?? 0));
      const y = Math.max(0, Math.round(field.position?.y ?? 0));
      const w = Math.max(20, Math.round(field.width ?? 300));
      const hasH = field.height != null;
      const h = hasH ? Math.max(20, Math.round(field.height as number)) : undefined;

      fieldEl.style.position = 'absolute';
      fieldEl.style.left = `${x}px`;
      fieldEl.style.top = `${y}px`;
      fieldEl.style.width = `${w}px`;
    if (hasH) {
  fieldEl.style.height = `${h}px`;
  fieldEl.style.minHeight = `${h}px`;   // ✅ ensures consistent box sizing
} else {
  fieldEl.style.removeProperty('height');
  fieldEl.style.removeProperty('min-height');
}
    });
  });
}

  /* ---------------- Fast download helpers ---------------- */
private normalizePageOrigin(page: FormPage) {
  if (!page?.fields?.length) return;

  const xs = page.fields.map(f => Math.max(0, Math.round(f?.position?.x ?? 0)));
  const ys = page.fields.map(f => Math.max(0, Math.round(f?.position?.y ?? 0)));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  // If everything is offset from the top/left, pull it back to the edge.
  if (isFinite(minX) && minX > 0) {
    page.fields.forEach(f => { if (f.position) f.position.x -= minX; });
  }
  if (isFinite(minY) && minY > 0) {
    page.fields.forEach(f => { if (f.position) f.position.y -= minY; });
  }
}
  private startDirectDownload(url: string, filename = 'form.pdf') {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename; // browsers that honor download will save; others may open inline
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

 async onClickDownloadIcon(form: SavedForm) {
  const key = this.asKey(form.formId);
  if (this.downloading.has(key)) return;

  this.downloading.add(key);
  this.cdr.detectChanges();
  try {
    if (form?.pdfUrl) {
      this.startDirectDownload(form.pdfUrl, `${form.formName || 'form'}.pdf`);
      this.snackBar.open('PDF download started.', 'Close', { duration: 2000 });
    } else {
      await this.exportFormToPDF_LIVE(form); // your working path (generate → upload → download)
    }
  } catch (e) {
    console.error('Download failed:', e);
    this.snackBar.open('Download failed.', 'Close', { duration: 2500 });
  } finally {
    this.downloading.delete(key);
    this.cdr.detectChanges();
  }
}

  /** From editor list: if URL exists, use it; else generate & upload quickly. */
  private async downloadPdf(form: SavedForm) {
    if (form?.pdfUrl) {
      this.startDirectDownload(form.pdfUrl, `${form.formName || 'form'}.pdf`);
      return;
    }
    await this.exportFormToPDF_LIVE(form);
  }

  /** Optional button that still uses tight-crop slicer */
  async onPdfClick(form: SavedForm) {
    this.downloading.add(form.formId);
    this.cdr.detectChanges();
   try {
    // If a valid PDF url already exists -> download instantly
    if (form?.pdfUrl) {
      this.startDirectDownload(form.pdfUrl, `${form.formName || 'form'}.pdf`);
      this.snackBar.open('PDF download started.', 'Close', { duration: 2000 });
      return;
    }

      // generate with tight-crop slicer (kept for editor use)
      const blob = await this.generatePdfBlobByPages(form);

      // upload & attach (best-effort)
      try {
        const kind: 'filled' | 'template' = form.source === 'filled' ? 'filled' : 'template';
        const url = await this.formService.uploadPdfBlob(kind, form.formId, blob, form.formName || 'form');
        await this.formService.attachPdfUrl(kind, form.formId, url);
        const idx = this.forms.findIndex((f) => f.formId === form.formId);
        if (idx >= 0) this.forms[idx] = { ...this.forms[idx], pdfUrl: url };
      } catch (e) {
        console.warn('Upload failed (download still OK):', e);
      }

      // local download
      const dl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dl;
      a.download = `${form.formName || 'form'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dl);
      this.snackBar.open('PDF downloaded.', 'Close', { duration: 2000 });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Download failed.', 'Close', { duration: 2500 });
    } finally {
      this.downloading.delete(form.formId);
      this.cdr.detectChanges();
    }
  }
  private setPageHeightsForPdf(): void {
  const A4H = 1123;               // px @ ~96dpi (matches CSS)
  const PADDING = 24;

  (this.selectedForm?.formPages || []).forEach((p, i) => {
    const bottom = Math.max(
      0,
      ...((p.fields || []).map(f =>
        (f?.position?.y || 0) + (Number(f?.height) || 0)
      ))
    );
    const min = Math.ceil(bottom + PADDING * 2);
    // Let tall pages spill to multiple A4 pages (html2pdf will paginate)
    const host = document.querySelectorAll<HTMLElement>('.page-surface')[i];
    if (host) host.style.minHeight = Math.max(A4H, min) + 'px';
  });
}
private expandForPdf(root: HTMLElement): () => void {
  const edited: Array<{el: HTMLElement, style: Partial<CSSStyleDeclaration>}> = [];

  // Any element that can crop content
  root.querySelectorAll<HTMLElement>('textarea, [style*="overflow"], .mdc-text-field, .mat-mdc-form-field, .field-wrapper')
    .forEach(el => {
      const prev: Partial<CSSStyleDeclaration> = {
        overflow: el.style.overflow,
        overflowY: el.style.overflowY,
        height: el.style.height,
      };

      // unlock overflow
      el.style.overflow = 'visible';
      el.style.overflowY = 'visible';

      // for textareas: grow to fit content
      if (el.tagName === 'TEXTAREA') {
        const ta = el as HTMLTextAreaElement;
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight}px`;
      }

      edited.push({ el, style: prev });
    });

  // return undo
  return () => edited.forEach(({el, style}) => {
    if (style.overflow !== undefined) el.style.overflow = style.overflow!;
    if (style.overflowY !== undefined) el.style.overflowY = style.overflowY!;
    if (style.height !== undefined) el.style.height = style.height!;
  });
}
  /** Tight-crop generator (used from editor). */
  private async generatePdfBlobByPages(form: SavedForm): Promise<Blob> {
    try {
      this.applyPositionsToLiveForm?.();
    } catch {}

    const root = document.getElementById('form-to-export');
    const surfaces = Array.from(root?.querySelectorAll<HTMLElement>('.page-surface') ?? []);
    if (!surfaces.length) throw new Error('No pages found to export.');

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const MARGIN_MM = 8;

    const exportSurface = async (surface: HTMLElement, useExistingFirstPdfPage: boolean) => {
      const clone = surface.cloneNode(true) as HTMLElement;
      this.stripBuilderChrome(clone);

      (this.selectedForm?.formPages || []).forEach((p) =>
     p.fields.forEach((f: FormField) => {
          if (f.type !== 'signature') return;
          const wrap = clone.querySelector(`.field-wrapper[data-id="${f.id}"]`) as HTMLElement | null;
          const cnv = this.getCanvasById(f.id);
          if (!wrap || !cnv) return;
          wrap.replaceChildren();
          const img = document.createElement('img');
          img.src = cnv.toDataURL('image/png');
          img.style.width = (f.width ?? 300) + 'px';
          img.style.height = (f.height ?? 150) + 'px';
          wrap.appendChild(img);
        })
      );
      this.freezePositionsFromLive(surface, clone);
   this.renderValuesIntoWrappers(clone);
      this.injectPdfCleanupCss(clone);
      this.swapPhotosIntoClone(clone);

      const hostRect = surface.getBoundingClientRect();
      const fieldEls = Array.from(surface.querySelectorAll<HTMLElement>('.field-wrapper')).filter((el) => {
        const r = el.getBoundingClientRect();
        return el.offsetParent !== null && r.width > 0 && r.height > 0;
        });

      let minX = Infinity,
        minY = Infinity,
        maxX = 0,
        maxY = 0;
      if (fieldEls.length) {
        for (const el of fieldEls) {
          const r = el.getBoundingClientRect();
          minX = Math.min(minX, r.left - hostRect.left);
          minY = Math.min(minY, r.top - hostRect.top);
          maxX = Math.max(maxX, r.right - hostRect.left);
          maxY = Math.max(maxY, r.bottom - hostRect.top);
        }
      } else {
        minX = 0;
        minY = 0;
        maxX = surface.scrollWidth;
        maxY = surface.scrollHeight;
      }

      const PAD = 8;
      minX = Math.max(0, Math.floor(minX - PAD));
      minY = Math.max(0, Math.floor(minY - PAD));
      maxX = Math.ceil(maxX + PAD);
      maxY = Math.ceil(maxY + PAD);

      const bboxW = Math.max(1, Math.round(maxX - minX));
      const bboxH = Math.max(1, Math.round(maxY - minY));

      const cropShell = document.createElement('div');
      cropShell.style.position = 'relative';
      cropShell.style.overflow = 'hidden';

      const mover = document.createElement('div');
      mover.style.position = 'absolute';
      mover.style.left = `${-minX}px`;
      mover.style.top = `${-minY}px`;

      while (clone.firstChild) mover.appendChild(clone.firstChild as Node);
      cropShell.appendChild(mover);
      clone.appendChild(cropShell);

      const mmToPx = (mm: number) => Math.round(mm * (96 / 25.4));
      const A4W_PX = mmToPx(210);
      const targetW = Math.max(1, A4W_PX - mmToPx(MARGIN_MM) * 2);

      const SCALE = Math.min(3, targetW / Math.max(1, bboxW));
      mover.style.transform = `scale(${SCALE})`;
      mover.style.transformOrigin = 'top left';

      const scaledW = Math.round(bboxW * SCALE);
      const scaledH = Math.round(bboxH * SCALE);
      cropShell.style.width = `${scaledW}px`;
      cropShell.style.height = `${scaledH}px`;

      const sandbox = document.createElement('div');
      sandbox.style.position = 'fixed';
      sandbox.style.inset = '0';
      sandbox.style.opacity = '0.01';
      sandbox.style.pointerEvents = 'none';
      sandbox.appendChild(cropShell);
      document.body.appendChild(sandbox);

      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));

      const canvas = await html2canvas(cropShell, {
        scale: SNAPSHOT_SCALE,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: scaledW,
        height: scaledH,
        windowWidth: scaledW,
        windowHeight: scaledH,
        scrollX: 0,
        scrollY: 0,
        logging: false,
      });

      this.addCanvasAsMultipage(pdf, canvas, pageW, pageH, useExistingFirstPdfPage, MARGIN_MM);

      sandbox.remove();
    };

    for (let i = 0; i < surfaces.length; i++) {
      await exportSurface(surfaces[i], i === 0);
    }
    return pdf.output('blob');
  }

  private stripBuilderChrome(root: HTMLElement) {
    root
      .querySelectorAll(
        '.export-pdf-icons, .field-actions, .drag-handle, .resize-handle, ' +
          '.delete-icon, [data-nonprint], .mat-form-field-prefix, .mat-form-field-suffix'
      )
      .forEach((el: any) => (el.style.display = 'none'));

    const style = document.createElement('style');
    style.textContent = `
      .field-wrapper::before,
      .field-wrapper::after { content: none !important; display: none !important; }
      .field-wrapper, .field-wrapper * { box-shadow: none !important; outline: 0 !important; }
      input, textarea { caret-color: transparent !important; }
      .field-wrapper, .field-wrapper * { overflow: hidden !important; }
      .mat-radio-container, .mat-checkbox-inner-container { display: none !important; }
    `;
    root.prepend(style);
  }

  /* ---------------- Exports (buttons) ---------------- */

  downloadFilledData(): void {
    if (!this.selectedForm) return;

    const filledData: { formName?: string; data: Record<string, any> } = {
      formName: this.selectedForm.formName,
      data: {},
    };

    this.selectedForm.formPages.forEach((page) => {
      page.fields.forEach((field) => {
        filledData.data[field.id] = field.value;
      });
    });

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filledData));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `${this.selectedForm.formName || 'form'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  private insertPdfHeader(clone: HTMLElement) {
    const title = (this.selectedForm?.formName || '').trim();
    if (!title) return;

    const target =
      (clone.querySelector('.page-surface') as HTMLElement) ||
      (clone.querySelector('.form-page-container') as HTMLElement) ||
      clone;

    const header = document.createElement('div');
    header.className = 'pdf-header';
    header.textContent = title;

    header.style.font = '600 15pt/1.2 "Roboto","Segoe UI",Arial,sans-serif';
    header.style.color = '#111';
    header.style.margin = '0 0 6mm 0';
    header.style.whiteSpace = 'pre-wrap';

    const sub = document.createElement('div');
    sub.textContent = new Date().toLocaleString();
    sub.style.font = '400 9pt/1.2 "Roboto","Segoe UI",Arial,sans-serif';
    sub.style.color = '#666';
    header.appendChild(sub);

    target.insertBefore(header, target.firstChild);
  }

  downloadFormAsPDFByPages() {
    const root = document.getElementById('form-to-export');
    const surfaces = Array.from(root?.querySelectorAll<HTMLElement>('.page-surface') ?? []);
    if (!surfaces.length) {
      this.snackBar.open('No pages found to export.', 'Close', { duration: 2500 });
      return;
    }

    try {
      this.applyPositionsToLiveForm?.();
    } catch {}

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const mmToPx = (mm: number) => Math.round(mm * (96 / 25.4));
    const A4W_PX = mmToPx(210);
    const MARGIN_MM = 4;

    const exportPage = async (surface: HTMLElement, useExistingFirstPdfPage: boolean) => {
      const clone = surface.cloneNode(true) as HTMLElement;
      clone.style.position = 'relative';
      clone.style.background = '#fff';
      clone.style.transform = 'none';
      clone.style.overflow = 'hidden';
      this.stripBuilderChrome(clone);

      (this.selectedForm?.formPages || []).forEach((p) =>
  p.fields.forEach((f: FormField) => {
          if (f.type !== 'signature') return;
          const wrap = clone.querySelector(`.field-wrapper[data-id="${f.id}"]`) as HTMLElement | null;
          const cnv = this.getCanvasById(f.id);
          if (!wrap || !cnv) return;
          const img = document.createElement('img');
          img.src = cnv.toDataURL('image/png');
          img.style.width = (f.width ?? 300) + 'px';
          img.style.height = (f.height ?? 150) + 'px';
          wrap.replaceChildren(img);
        })
      );

      this.freezePositionsFromLive(surface, clone);
   this.renderValuesIntoWrappers(clone);
      this.injectPdfCleanupCss(clone);
      this.swapPhotosIntoClone(clone);


      const hostRect = surface.getBoundingClientRect();
      const fieldEls = Array.from(surface.querySelectorAll<HTMLElement>('.field-wrapper')).filter((el) => {
        const r = el.getBoundingClientRect();
        return el.offsetParent !== null && r.width > 0 && r.height > 0;
      });

      let minX = Infinity,
        minY = Infinity,
        maxX = 0,
        maxY = 0;
      if (fieldEls.length) {
        for (const el of fieldEls) {
          const r = el.getBoundingClientRect();
          minX = Math.min(minX, r.left - hostRect.left);
          minY = Math.min(minY, r.top - hostRect.top);
          maxX = Math.max(maxX, r.right - hostRect.left);
          maxY = Math.max(maxY, r.bottom - hostRect.top);
        }
      } else {
        minX = 0;
        minY = 0;
        maxX = surface.scrollWidth;
        maxY = surface.scrollHeight;
      }

      const PAD = 8;
      minX = Math.max(0, Math.floor(minX - PAD));
      minY = Math.max(0, Math.floor(minY - PAD));
      maxX = Math.ceil(maxX + PAD);
      maxY = Math.ceil(maxY + PAD);

      const bboxW = Math.max(1, Math.round(maxX - minX));
      const bboxH = Math.max(1, Math.round(maxY - minY));

      const frame = document.createElement('div');
      frame.style.position = 'relative';
      frame.style.background = '#fff';
      frame.style.overflow = 'hidden';

      const mover = document.createElement('div');
      mover.style.position = 'absolute';
      mover.style.left = `${-minX}px`;
      mover.style.top = `${-minY}px`;

      while (clone.firstChild) mover.appendChild(clone.firstChild as Node);
      frame.appendChild(mover);

      const targetW = Math.max(1, A4W_PX - mmToPx(MARGIN_MM) * 2);
      const SCALE = Math.min(3, targetW / bboxW);
      const scaledW = Math.round(bboxW * SCALE);
      const scaledH = Math.round(bboxH * SCALE);

      mover.style.transform = `scale(${SCALE})`;
      mover.style.transformOrigin = 'top left';
      frame.style.width = `${scaledW}px`;
      frame.style.height = `${scaledH}px`;

      const sandbox = document.createElement('div');
      sandbox.style.position = 'fixed';
      sandbox.style.inset = '0';
      sandbox.style.pointerEvents = 'none';
      sandbox.style.opacity = '0.01';
      sandbox.style.zIndex = '9999';

      sandbox.appendChild(frame);
      document.body.appendChild(sandbox);

      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));

      const canvas = await html2canvas(frame, {
        scale: SNAPSHOT_SCALE,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: scaledW,
        height: scaledH,
        windowWidth: scaledW,
        windowHeight: scaledH,
        scrollX: 0,
        scrollY: 0,
        logging: false,
      });

      this.addCanvasAsMultipage(pdf, canvas, pageW, pageH, useExistingFirstPdfPage, MARGIN_MM);

      sandbox.remove();
    };

    (async () => {
      for (let i = 0; i < surfaces.length; i++) {
        await exportPage(surfaces[i], i === 0);
      }
      pdf.save(`${this.selectedForm?.formName || 'form'}.pdf`);
    })();
  }
  private openUrlInNewTab(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
private fitCloneToA4Width(host: HTMLElement, shell: HTMLElement, A4Wpx: number, marginMm = this.PDF_MARGIN_MM) {
  const marginPx = Math.round(marginMm * this.pxPerMm);
  const avail = A4Wpx - marginPx * 2;

  const hostRect = host.getBoundingClientRect();
  let maxRight = hostRect.left;

  host.querySelectorAll<HTMLElement>('.field-wrapper').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) maxRight = Math.max(maxRight, r.right);
  });

  const used = Math.ceil(maxRight - hostRect.left);
  if (used > avail && used > 0) {
    const scale = avail / used;
    host.style.transform = `scale(${scale})`;
    host.style.transformOrigin = 'top left';
    // ensure shell is tall enough after scaling
    const scaledH = Math.ceil(host.scrollHeight * scale);
    shell.style.minHeight = Math.max(parseInt(shell.style.minHeight || '0', 10) || 0, scaledH) + 'px';
  }
}
private openBlobInNewTab(blob: Blob) {
  const url = URL.createObjectURL(blob);
  this.openUrlInNewTab(url);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
private freezePageLayout(livePage: HTMLElement, clonePage: HTMLElement) {
  const host = livePage.getBoundingClientRect();
  clonePage.style.position = 'relative';

  const liveFields = Array.from(livePage.querySelectorAll<HTMLElement>('.field-wrapper'));
  for (const lf of liveFields) {
    const id = lf.getAttribute('data-id');
    if (!id) continue;
    const cf = clonePage.querySelector<HTMLElement>(`.field-wrapper[data-id="${id}"]`);
    if (!cf) continue;

    const r = lf.getBoundingClientRect();
    cf.style.position = 'absolute';
    cf.style.left   = `${Math.round(r.left - host.left)}px`;
    cf.style.top    = `${Math.round(r.top  - host.top)}px`;
    cf.style.width  = `${Math.round(r.width)}px`;
    cf.style.height = `${Math.round(r.height)}px`;
  }
}
async downloadFilledFormAsPDF() {
  const live = document.getElementById('form-to-export') as HTMLElement | null;
     
  if (!live) { this.snackBar.open('Form surface not found.', 'Close', { duration: 2500 }); return; }
document.body.classList.add('for-pdf');
this.setPdfContentWidthVar(live);
  try { this.applyPositionsToLiveForm?.(); } catch {}
  try { this.syncInkAndPhotosIntoValues?.(); } catch {}

  const clone = live.cloneNode(true) as HTMLElement;

  // ── A4 constants
  const mmToPx = (mm: number) => Math.round(mm * (96 / 25.4));
  const A4W = mmToPx(210);
  const A4H = mmToPx(297);

  // NEW: freeze per-page layout in the clone before swapping anything
  const livePages  = Array.from(live .querySelectorAll<HTMLElement>('.page-surface, .form-page-container'));
  const clonePages = Array.from(clone.querySelectorAll<HTMLElement>('.page-surface, .form-page-container'));

  if (livePages.length && livePages.length === clonePages.length) {
    for (let i = 0; i < livePages.length; i++) {
      this.freezePageLayout(livePages[i], clonePages[i]);
    }
  } else {
    // fallback: freeze against the whole surface
    this.freezePositionsFromLive(live, clone);
  }
  this.setPdfContentWidthVar(live);  
  // NEW: make each page sized like A4 so offsets are relative to a page
  (clonePages.length ? clonePages : [clone]).forEach(p => {
    p.style.position   = 'relative';
    p.style.width      = `${A4W}px`;
    p.style.minHeight  = `${A4H}px`;
    p.style.background = '#fff';
    p.style.overflow   = 'visible';
  });
  this.setPdfContentWidthVar(clone); 
  // Now do the swaps (canvases → img, inputs → text, photos → img)
 this.swapSignaturesInto(clone);
this.renderValuesIntoWrappers(clone);
this.swapPhotosIntoClone(clone);
this.injectPdfCleanupCss(clone); // ensures .print-value fills the control width

  // ── sandbox & snapshot (unchanged)
  const sandbox = document.createElement('div');
  sandbox.style.position = 'fixed';
  sandbox.style.inset = '0';
  sandbox.style.zIndex = '9999';
  sandbox.style.pointerEvents = 'none';
  sandbox.style.opacity = '0.01';

  const shell = document.createElement('div');
  shell.style.position = 'fixed';
  shell.style.top = '0';
  shell.style.left = '0';
  shell.style.width = A4W + 'px';
  shell.style.minHeight = A4H + 'px';
  shell.style.background = '#fff';
  shell.style.overflow = 'visible';

  clone.style.position = 'relative';
  clone.style.width = '100%';
  clone.style.minHeight = A4H + 'px';
  clone.style.background = '#fff';

  shell.appendChild(clone);
  sandbox.appendChild(shell);
  document.body.appendChild(sandbox);
const host =
  (clone.querySelector('.page-surface') as HTMLElement) ||
  (clone.querySelector('.form-page-container') as HTMLElement) ||
  clone;
this.fitCloneToA4Width(host, shell, A4W, this.PDF_MARGIN_MM);
  try {
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    try { await (document as any).fonts?.ready; } catch {}

    const fullW = shell.scrollWidth;
    const fullH = Math.max(shell.scrollHeight, A4H);

    const canvas = await html2canvas(shell, {
      scale:  SNAPSHOT_SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0, scrollY: 0,
      windowWidth: fullW, windowHeight: fullH,
      width: fullW, height: fullH
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pW = pdf.internal.pageSize.getWidth();
    const pH = pdf.internal.pageSize.getHeight();
    this.addCanvasAsMultipage(pdf, canvas, pW, pH, true, 8);

    pdf.save(`${this.selectedForm?.formName || 'form'}.pdf`);
    
  } catch (e) {
    console.error('PDF preview failed:', e);
    this.snackBar.open('Failed to open PDF.', 'Close', { duration: 3000 });
  } finally {
    document.body.classList.remove('for-pdf');
    sandbox.remove();
  }
}

openFilledForm(filled: any) {
  const inst: FilledInstance = {
    instanceId: filled.id ?? filled.formId,
    templateId: filled.sourceFormId ?? filled.templateId ?? undefined,
    formName: filled.formName || 'Untitled',
    formPagesSnapshot: JSON.parse(JSON.stringify(
      filled.formPagesSnapshot || filled.formPages || []
    )),
    data: filled.data || {},
    preview: filled.preview ?? filled.pdfUrl ?? null,
    updatedAt: Date.now(),
  };
    this.normalizeGridForOpen(inst.formPagesSnapshot);
   this.normalizeTemplatePages({ formPages: inst.formPagesSnapshot } as any);

  // ⭐ pull everything back to (0,0) so there's no top/left gap
  inst.formPagesSnapshot.forEach(p => this.normalizePageOrigin(p));

  this.beginEditing(inst);         // <-- ensures canvases init & UI set
  this.restoreCheckboxesFromValue();
   // ensure template is applied before positioning
  if ((this as any).cdRef?.detectChanges) {
    (this as any).cdRef.detectChanges();
  }
 
    // 👇 force the saved layout back onto the DOM
  requestAnimationFrame(() => this.applyPositionsToLiveForm());
      // 5) now that the DOM exists, hydrate grid UI from values
    this.hydrateAllGridsFromValues();

  // defer signature replay until canvases exist
  setTimeout(() => this.initCanvases(), 0);
}

/** Ensure data-grid fields have a usable gridMatrix when opening a filled form */
private normalizeGridForOpen(pages: any[]) {
  for (const page of pages || []) {
    for (const f of page.fields || []) {
      if (f.type !== 'data-grid') continue;

      // CASE A: already matrix — just ensure defaults
      if (f.gridMatrix) {
        f.gridMode = f.gridMode || 'matrix';
        const gm = f.gridMatrix;
        gm.rows = Array.isArray(gm.cells) ? gm.cells.length : (gm.rows ?? 1);
        gm.cols = Array.isArray(gm.cells?.[0]) ? gm.cells[0].length : (gm.cols ?? 1);
        gm.cellH = gm.cellH ?? 140;
        gm.gap   = gm.gap   ?? 12;
        gm.showBorders = !!gm.showBorders;
        // ensure each cell has items array
        for (let r = 0; r < gm.rows; r++) {
          gm.cells[r] = gm.cells[r] || Array.from({ length: gm.cols }, () => ({ items: [] }));
          for (let c = 0; c < gm.cols; c++) {
            gm.cells[r][c] = gm.cells[r][c] || { items: [] };
            gm.cells[r][c].items = gm.cells[r][c].items || [];
          }
        }
        continue;
      }

      // CASE B: table mode saved (gridConfig / columns / rows) → render as matrix
      if (f.gridConfig && Array.isArray(f.gridConfig.columns)) {
        const cols = Math.max(1, f.gridConfig.columns.length);
        const rows = Math.max(1, (f.rows?.length || 1));
        f.gridMode = 'matrix';
        f.gridMatrix = {
          rows,
          cols,
          cellH: 140,
          gap: 12,
          showBorders: false,
          // put each former column as a single tile in row 0 by default
          cells: Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => ({
              items: [
                {
                  id: f.gridConfig.columns[c].id || `col_${c}`,
                  type: f.gridConfig.columns[c].fieldDef?.type || 'text',
                  label: f.gridConfig.columns[c].label || `Column ${c + 1}`,
                },
              ],
            }))
          ),
        };
        continue;
      }

      // CASE C: minimal fallback — ensure an empty 1x1 matrix so it renders
      f.gridMode = 'matrix';
      f.gridMatrix = {
        rows: 1,
        cols: 1,
        cellH: 140,
        gap: 12,
        showBorders: false,
        cells: [[{ items: [] }]],
      };
    }
  }
}

private hydrateDataGrids(pages: any[]) {
  for (const page of pages || []) {
    for (const f of page.fields || []) {
      if (f?.type !== 'data-grid' && f?.type !== 'datagrid' && f?.type !== 'grid' && f?.type !== 'matrix') continue;

      // A) Already matrix → ensure sane defaults and arrays
      if (f.gridMatrix) {
        f.gridMode = f.gridMode || 'matrix';
        const gm = f.gridMatrix;
        gm.rows = gm.rows ?? (Array.isArray(gm.cells) ? gm.cells.length : 1);
        gm.cols = gm.cols ?? (Array.isArray(gm.cells?.[0]) ? gm.cells[0].length : 1);
        gm.cellH = gm.cellH ?? 140;
        gm.gap = gm.gap ?? 12;
        gm.showBorders = !!gm.showBorders;

        // ensure gm.cells[r][c].items exists
        for (let r = 0; r < (gm.rows || 1); r++) {
          gm.cells[r] = gm.cells[r] || Array.from({ length: gm.cols || 1 }, () => ({ items: [] }));
          for (let c = 0; c < (gm.cols || 1); c++) {
            gm.cells[r][c] = gm.cells[r][c] || { items: [] };
            gm.cells[r][c].items = gm.cells[r][c].items || [];
          }
        }
        continue;
      }

      // B) Table-mode saved (columns/rows) → build a 1-row matrix
      if (f.gridConfig?.columns?.length) {
        const cols = f.gridConfig.columns;
        f.gridMode = 'matrix';
        f.gridMatrix = {
          rows: 1,
          cols: cols.length,
          cellH: 140,
          gap: 12,
          showBorders: false,
          cells: [
            cols.map((col: any, i: number) => ({
              items: [{
                id: col.id || `col_${i}`,
                type: col.fieldDef?.type || 'text',
                label: col.label || `Column ${i + 1}`,
                value: ''
              }]
            }))
          ]
        };
        continue;
      }

      // C) Last-resort 1×1
      f.gridMode = 'matrix';
      f.gridMatrix = {
        rows: 1, cols: 1, cellH: 140, gap: 12, showBorders: false,
        cells: [[{ items: [] }]]
      };
    }
  }
}



 async savePDFPreview() {
  const surface = document.getElementById('form-to-export') as HTMLElement;
  if (!surface) return;

  // ensure live DOM is at the exact saved positions
  this.applyPositionsToLiveForm();
  this.setPdfContentWidthVar(surface);  
  // enter export mode
  document.body.classList.add('for-pdf');

  // unlock clipping & grow textareas
  const undo = this.beginCapture(surface);

  // give layout a tick to settle
  await new Promise(r => requestAnimationFrame(r));

  const opt = {
    margin: this.PDF_MARGIN_MM,                              // 👈 match the CSS var
    filename: `${this.selectedForm?.formName || 'form'}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
      useCORS: true,
      backgroundColor: '#fff',
      ignoreElements: (el: Element) => el.hasAttribute('data-nonprint'),
      windowWidth: surface.scrollWidth                      // 👈 don’t clamp
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  };

  await (html2pdf as any)().set(opt).from(surface).save();
  undo();
  document.body.classList.remove('for-pdf');
}
  cancelSave(): void {
    this.showNameInput = false;
    this.nameError = false;
    this.filledDataName = '';
  }
  

  private waitForElement(selector: string, timeoutMs = 2500): Promise<void> {
    const start = performance.now();
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        if (document.querySelector(selector)) return resolve();
        if (performance.now() - start > timeoutMs)
          return reject(new Error(`waitForElement timeout: ${selector}`));
        requestAnimationFrame(check);
      };
      check();
    });
  }

  private async liveSnapshotFallback(filename: string) {
    const live =
      (document.querySelector('#form-to-export .page-surface') as HTMLElement) ||
      (document.querySelector('#form-to-export .form-page-container') as HTMLElement) ||
      (document.getElementById('form-to-export') as HTMLElement);
    if (!live) throw new Error('form-to-export not found for fallback');

    this.applyPositionsToLiveForm?.();
    await new Promise(requestAnimationFrame);
    try {
      await (document as any).fonts?.ready;
    } catch {}

    const canvas = await html2canvas(live, {
      scale: SNAPSHOT_SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const img = canvas.toDataURL('image/jpeg', 0.98);
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let y = 0,
      heightLeft = imgH;
    pdf.addImage(img, 'JPEG', 0, y, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      pdf.addPage();
      y = heightLeft - imgH;
      pdf.addImage(img, 'JPEG', 0, y, imgW, imgH);
      heightLeft -= pageH;
    }

    pdf.save(`${filename}.pdf`);
  }
  

  private async exportFormToPDF(form: SavedForm) {
    const prevSelected = this.selectedForm;
    const prevShowEditor = this.showFormEditor;

    this.openForm(form);
    this.cdr.detectChanges();

    await new Promise(requestAnimationFrame);
    this.cdr.detectChanges();
    await new Promise((res) => setTimeout(res, 0));
    this.cdr.detectChanges();

    try {
      await this.waitForElement('#form-to-export .field-wrapper', 3000);
    } catch {
      console.warn('Fields did not appear in time; using fallback.');
      await this.liveSnapshotFallback(form.formName || 'form');
      this.selectedForm = prevSelected;
      this.showFormEditor = prevShowEditor;
      this.cdr.detectChanges();
      return;
    }

    try {
      await this.exportToPDFAndUpload();
    } catch (e) {
      console.error('Main generator failed, using fallback', e);
      await this.liveSnapshotFallback(form.formName || 'form');
    } finally {
      document.body.classList.remove('for-pdf');    
      this.selectedForm = prevSelected;
      this.showFormEditor = prevShowEditor;
      this.cdr.detectChanges();
    }
  }
  

  private async settleLayoutForPdf() {
    this.applyPositionsToLiveForm?.();
    await new Promise(requestAnimationFrame);
    try {
      await (document as any).fonts?.ready;
    } catch {}
  }

  private prepareCloneForPdf(clone: HTMLElement) {
    const replaceWithSpan = (el: HTMLElement, text: string) => {
      const span = document.createElement('span');
      span.className = 'print-value';
      span.textContent = text ?? '';
      const cs = window.getComputedStyle(el);
        span.style.display = 'block';
  span.style.width = '100%';             // <-- key change
  span.style.boxSizing = 'border-box';
  span.style.whiteSpace = cs.whiteSpace || 'pre-wrap';
  span.style.font = cs.font;
  span.style.lineHeight = cs.lineHeight;
  span.style.letterSpacing = cs.letterSpacing;
  span.style.minHeight = (el as HTMLElement).clientHeight ? (el as HTMLElement).clientHeight + 'px' : '36px';
  span.style.padding = cs.padding || '6pt 8pt';
  span.style.border = '0.5pt solid #E5E7EB';
  span.style.background = '#FAFAFA';
  span.style.borderRadius = '4px';

  el.replaceWith(span);
};

    clone
      .querySelectorAll('input[type="text"], input[type="number"], input[type="date"], input[type="email"], input[type="tel"]')
      .forEach((el: any) => {
        replaceWithSpan(el, el.value ?? '');
      });
    clone.querySelectorAll('textarea').forEach((el: any) => replaceWithSpan(el, el.value ?? ''));
    clone.querySelectorAll('select').forEach((el: HTMLSelectElement) => {
      const label = el.selectedOptions?.[0]?.text ?? el.value ?? '';
      replaceWithSpan(el as any, label);
    });
    this.insertPdfHeader(clone);

    const mmToPx = (mm: number) => mm * (96 / 25.4);
    const a4W = mmToPx(210),
      a4H = mmToPx(297);

    const pageContainers = Array.from(clone.querySelectorAll('.page-container')) as HTMLElement[];
    const pageSurfaces = Array.from(clone.querySelectorAll('.page-surface')) as HTMLElement[];
    const pageInner = Array.from(clone.querySelectorAll('.form-page-container')) as HTMLElement[];

    const targets = pageSurfaces.length
      ? pageSurfaces
      : pageContainers.length
      ? pageContainers
      : pageInner.length
      ? pageInner
      : [clone];

    targets.forEach((page, i) => {
      page.style.width = a4W + 'px';
      page.style.minHeight = a4H + 'px';
      page.style.position = 'relative';
      page.style.background = page.style.background || '#fff';
      page.style.overflow = 'visible';
      if (i < targets.length - 1) {
        page.style.pageBreakAfter = 'always';
        (page.style as any).breakAfter = 'page';
      }
    });

    pageInner.forEach((inner) => {
      inner.style.position = 'relative';
      inner.style.width = '100%';
      inner.style.minHeight = '100%';
    });

    clone.querySelectorAll('[data-nonprint], .export-pdf-icons').forEach((el: any) => {
      el.style.display = 'none';
    });
  }

  private reapplyPositionsInClone(clone: HTMLElement) {
    if (!this.selectedForm) return;

    this.selectedForm.formPages.forEach((page) => {
      page.fields.forEach((field) => {
        const target = clone.querySelector(`.field-wrapper[data-id="${field.id}"]`) as HTMLElement | null;
        if (!target) return;

        if (field.id === 'description') {
          target.style.position = 'relative';
          target.style.left = '';
          target.style.top = '';
          target.style.width = field.width ? field.width + 'px' : '100%';
        } else {
          target.style.position = 'absolute';
          target.style.left = (field.position?.x ?? 0) + 'px';
          target.style.top = (field.position?.y ?? 0) + 'px';
          target.style.width = (field.width ?? 300) + 'px';
        }
        if (field.height) target.style.height = field.height + 'px';
      });
    });
  }

 
private swapSignaturesInClone(clone: HTMLElement) {
  (this.selectedForm?.formPages || []).forEach(p =>
p.fields.forEach((f: FormField) => {

      if (f.type !== 'signature') return;

      const wrap = clone.querySelector<HTMLElement>(`.field-wrapper[data-id="${f.id}"]`);
      const canvasInClone = wrap?.querySelector<HTMLCanvasElement>(`canvas[data-id="${f.id}"]`);
      const cnv = this.getCanvasById(f.id);
      if (!wrap || !cnv) return;

      const img = new Image();
      img.src = cnv.toDataURL('image/png');
      img.style.width  = `${f.width ?? 300}px`;
      img.style.height = `${f.height ?? 150}px`;

      if (canvasInClone) canvasInClone.replaceWith(img);
      else wrap.appendChild(img);
    })
  );
}
private flattenMatSelects(root: HTMLElement) {
  const sels = Array.from(root.querySelectorAll<HTMLElement>('.mat-select'));
  sels.forEach(sel => {
    const host = (sel.closest('.mat-form-field') as HTMLElement) ?? sel;
    const txt =
      (sel.querySelector('.mat-select-value-text')?.textContent ??
       sel.querySelector('.mat-select-min-line')?.textContent ??
       '').trim();

    const span = document.createElement('span');
    span.className = 'print-value';
    span.textContent = txt || '';
    const r = host.getBoundingClientRect();
    span.style.display = 'block';
    span.style.width = `${Math.max(1, Math.round(r.width))}px`;
    span.style.minHeight = `${Math.max(36, Math.round(r.height || 36))}px`;
    span.style.padding = '6pt 8pt';
    span.style.border = '0.5pt solid #E5E7EB';
    span.style.background = '#FAFAFA';
    span.style.borderRadius = '4px';
    host.replaceWith(span);
  });
}

/** Turn mat-radio / mat-checkbox groups into inline text */
private flattenMatRadiosAndChecks(root: HTMLElement) {
  // radios
  root.querySelectorAll<HTMLElement>('.mat-radio-group').forEach(group => {
    const checked = group.querySelector<HTMLElement>('.mat-radio-checked .mat-radio-label-content');
    const label = (checked?.textContent || '').trim();
    const span = document.createElement('span');
    span.className = 'print-value';
    span.textContent = label ? `◉ ${label}` : '○';
    const host = (group.closest('.mat-form-field') as HTMLElement) ?? group;
    host.replaceWith(span);
  });

  // checkboxes
  root.querySelectorAll<HTMLElement>('.mat-checkbox').forEach(box => {
    const label = (box.querySelector('.mat-checkbox-label')?.textContent || '').trim();
    const checked = box.classList.contains('mat-checkbox-checked');
    const span = document.createElement('span');
    span.textContent = `${checked ? '☑' : '☐'} ${label}`;
    span.style.display = 'inline-block';
    const host = (box.closest('.mat-form-field') as HTMLElement) ?? box;
    host.replaceWith(span);
  });
}

  private async exportToPDFAndUpload(): Promise<void> {
    const filename = prompt('Enter filename for PDF', this.selectedForm?.formName || 'form');
    if (!filename || !this.selectedForm) return;

    await this.settleLayoutForPdf();

    const container = document.getElementById('form-to-export');
    if (!container) {
      alert('Form container not found!');
      return;
    }
  this.setPdfContentWidthVar(container);  
    const clone = container.cloneNode(true) as HTMLElement;
  this.setPdfContentWidthVar(container);  
    clone.style.position = 'fixed';
    clone.style.top = '0';
    clone.style.left = '0';
    clone.style.opacity = '0.01';
    clone.style.pointerEvents = 'none';
    clone.style.background = window.getComputedStyle(container).backgroundColor || '#fff';
    document.body.appendChild(clone);

    try {
     this.swapSignaturesInto(clone);
this.flattenMatSelects(clone);           // <-- add
this.flattenMatRadiosAndChecks(clone);   // <-- add
  this.renderValuesIntoWrappers(clone);
this.swapPhotosIntoClone(clone);
this.injectPdfCleanupCss(clone);
        const liveRoot =
          (container.querySelector('.page-surface') as HTMLElement) ||
    (container.querySelector('.form-page-container') as HTMLElement) ||
    (container.querySelector('.page-container') as HTMLElement) ||
    container;

      const root =
        (clone.querySelector('.page-surface') as HTMLElement) ||
        (clone.querySelector('.form-page-container') as HTMLElement) ||
        (clone.querySelector('.page-container') as HTMLElement) ||
        clone;
  this.freezePositionsFromLive(liveRoot, root);
    this.swapPhotosIntoClone(clone);

  this.injectPdfCleanupCss(clone);    
      root.getBoundingClientRect();
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));

      const box = root.getBoundingClientRect();
      if (box.width < 10 || box.height < 10 || !root.querySelector('.field-wrapper')) {
        throw new Error('Nothing to render: target has no measurable size or fields.');
      }

      const a4Px = { w: Math.round(210 * (96 / 25.4)), h: Math.round(297 * (96 / 25.4)) };

      const worker = (html2pdf as any)()
        .from(root)
        .set({
           margin: this.PDF_MARGIN_MM,  
          filename: `${filename}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: SNAPSHOT_SCALE,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: a4Px.w,
            windowHeight: a4Px.h,
            scrollX: 0,
            scrollY: 0,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        })
        .toPdf();

      const pdf: any = await worker.get('pdf');
      const blob: Blob = pdf.output('blob');

      const kind: 'filled' | 'template' = this.selectedForm.source === 'filled' ? 'filled' : 'template';
      const id = this.selectedForm.formId;
      const url = await this.formService.uploadPdfBlob(kind, id, blob, filename);
      await this.formService.attachPdfUrl(kind, id, url);

      const idx = this.forms.findIndex((f) => f.formId === id);
      if (idx >= 0) this.forms[idx] = { ...this.forms[idx], pdfUrl: url };
      if (this.selectedForm && this.selectedForm.formId === id) {
        (this.selectedForm as any).pdfUrl = url;
      }

      pdf.save(`${filename}.pdf`);
      this.snackBar.open('PDF uploaded and downloaded.', 'Close', { duration: 2500 });
    } catch (err) {
      console.error('PDF export/upload failed:', err);
      this.snackBar.open('Failed to export/upload PDF.', 'Close', { duration: 3000 });
    } finally {
      clone.remove();
    }
  }
  

  private captureInlineStyles(root: HTMLElement): () => void {
    const entries: Array<{ el: HTMLElement; css: string | null }> = [];
    const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
    for (const el of all) {
      entries.push({ el, css: el.getAttribute('style') });
    }
    return () => {
      for (const { el, css } of entries) {
        if (css === null) el.removeAttribute('style');
        else el.setAttribute('style', css);
      }
    };
  }


private readonly A4_W_MM = 210;
private readonly PDF_MARGIN_MM = 10;       // 10mm margin on each side
private readonly pxPerMm = 96 / 25.4;      // CSS px @ 96dpi

private setPdfContentWidthVar(surface: HTMLElement) {
  // width available INSIDE the margins
  const contentPx = Math.floor((this.A4_W_MM - 2 * this.PDF_MARGIN_MM) * this.pxPerMm);
  // ~717px with 10mm margins; safer than 794px
  surface.style.setProperty('--pdf-content-width', `${contentPx}px`);
}

private async exportFormToPDF_LIVE(form: SavedForm) {
  const prevSelected = this.selectedForm;
  const prevShow = this.showFormEditor;

  this.openForm(form);
  this.cdr.detectChanges();
  await new Promise((r) => setTimeout(r, 200));
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 0));
  this.cdr.detectChanges();

  const liveRoot = document.getElementById('form-to-export');
  if (!liveRoot) {
    this.snackBar.open('form-to-export not found', 'Close', { duration: 2500 });
    return;
  }

  document.body.classList.add('for-pdf');
  this.setPdfContentWidthVar(liveRoot);      // set --pdf-content-width on the live DOM once
  const restoreLive = this.captureInlineStyles(liveRoot);

  try {
    try { this.applyPositionsToLiveForm?.(); } catch {}
    try { await (document as any).fonts?.ready; } catch {}

    const clone = liveRoot.cloneNode(true) as HTMLElement;

    // ✅ Force the clone to the exact inner A4 content width
    const contentPx =
      parseInt(getComputedStyle(liveRoot).getPropertyValue('--pdf-content-width')) ||
      Math.floor((this.A4_W_MM - 2 * this.PDF_MARGIN_MM) * this.pxPerMm);

    clone.style.width = contentPx + 'px';
    clone.style.maxWidth = contentPx + 'px';
    clone.style.minWidth = contentPx + 'px';
    clone.style.background = '#fff';

    // Replace controls with values & swap media
    this.swapSignaturesInto(clone);
    this.flattenMatSelects(clone);
    this.flattenMatRadiosAndChecks(clone);
    this.renderValuesIntoWrappers(clone);
    this.swapPhotosIntoClone(clone);
    this.injectPdfCleanupCss(clone);

    // A4 metrics
    const mmToPx = (mm: number) => Math.round(mm * (96 / 25.4));
    const A4W = mmToPx(210);
    const A4H = mmToPx(297);

    // Sandbox shell the size of a physical A4 page (visual)
    const sandbox = document.createElement('div');
    sandbox.style.position = 'fixed';
    sandbox.style.inset = '0';
    sandbox.style.zIndex = '9999';
    sandbox.style.pointerEvents = 'none';
    sandbox.style.background = 'transparent';
    sandbox.style.opacity = '0.01';
    sandbox.style.userSelect = 'none';

    const shell = document.createElement('div');
    shell.style.position = 'fixed';
    shell.style.top = '0';
    shell.style.left = '0';
    shell.style.width = A4W + 'px';
    shell.style.minHeight = A4H + 'px';
    shell.style.background = '#fff';
    shell.style.overflow = 'visible';

    // 👇 keep the fixed width we just set; don't overwrite with 100%
    clone.style.position = 'relative';
    clone.style.minHeight = A4H + 'px';

    shell.appendChild(clone);
    sandbox.appendChild(shell);
    document.body.appendChild(sandbox);

    const host =
      (clone.querySelector('.page-surface') as HTMLElement) ||
      (clone.querySelector('.form-page-container') as HTMLElement) ||
      clone;

    // Fit horizontally if user content was wider than A4 inner width
    this.fitCloneToA4Width(host, shell, A4W, this.PDF_MARGIN_MM);

    // Let layout settle
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));

    const rect = shell.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20 || !clone.querySelector('.field-wrapper')) {
      sandbox.remove();
      this.snackBar.open('Nothing measurable to render.', 'Close', { duration: 2500 });
      return;
    }

    // ✅ FULL capture area (no viewport clipping)
    const fullW = shell.scrollWidth;
    const fullH = Math.max(shell.scrollHeight, A4H);

    const canvas = await html2canvas(shell, {
      scale: SNAPSHOT_SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: fullW,
      height: fullH,
      windowWidth: fullW,
      windowHeight: fullH,
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pW = pdf.internal.pageSize.getWidth();
    const pH = pdf.internal.pageSize.getHeight();
    this.addCanvasAsMultipage(pdf, canvas, pW, pH, true, 8);

    const filename = (form.formName || 'form').trim() || 'form';
    const blob: Blob = pdf.output('blob');
    pdf.save(`${filename}.pdf`);

    // Best-effort upload
    try {
      const kind: 'filled' | 'template' = form.source === 'filled' ? 'filled' : 'template';
      const url = await this.formService.uploadPdfBlob(kind, form.formId, blob, filename);
      await this.formService.attachPdfUrl(kind, form.formId, url);
      const idx = this.forms.findIndex((f) => f.formId === form.formId);
      if (idx >= 0) this.forms[idx] = { ...this.forms[idx], pdfUrl: url };
    } catch (e) {
      console.warn('Upload failed; local save done:', e);
    }

    sandbox.remove();
  } finally {
    document.body.classList.remove('for-pdf');
    restoreLive();
    this.selectedForm = prevSelected;
    this.showFormEditor = prevShow;
    this.cdr.detectChanges();
  }
}

  private debugShowCloneOnce() {
    const container = document.getElementById('form-to-export');
    if (!container) {
      alert('form-to-export not found');
      return;
    }

    const clone = container.cloneNode(true) as HTMLElement;
    this.swapSignaturesInClone(clone);
    this.prepareCloneForPdf(clone);
    this.reapplyPositionsInClone(clone);

    clone.style.position = 'fixed';
    clone.style.inset = '20px';
    clone.style.overflow = 'auto';
    clone.style.background = '#fff';
    clone.querySelectorAll('.page-surface, .page-container, .form-page-container').forEach(
      (el: any) => (el.style.outline = '2px solid rgba(0,128,255,.5)')
    );
    clone.querySelectorAll('.field-wrapper').forEach(
      (el: any) => (el.style.outline = '1px dashed rgba(255,0,0,.6)')
    );

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '99998';
    overlay.style.background = 'rgba(0,0,0,.2)';
    overlay.appendChild(clone);

    const btn = document.createElement('button');
    btn.textContent = 'Close debug clone';
    btn.style.position = 'fixed';
    btn.style.top = '8px';
    btn.style.right = '8px';
    btn.style.zIndex = '99999';
    btn.onclick = () => overlay.remove();

    overlay.appendChild(btn);
    document.body.appendChild(overlay);
  }

  /** Legacy export button kept for completeness (now uses SNAPSHOT_SCALE) */
  exportToPDF(): void {
  const filename = prompt('Enter filename for PDF', this.selectedForm?.formName || 'form');
  if (!filename) return;

  this.applyPositionsToLiveForm?.();
  this.cdr.detectChanges();

  const container = document.getElementById('form-to-export');
  if (!container) {
    alert('Form container not found!');
    return;
  }
  container.classList.add('export-pdf-icons');

  (document as any).fonts?.ready?.then(() => {
    const clone = container.cloneNode(true) as HTMLElement;

    // A4 surface for the clone
    const mmToPx = (mm: number) => Math.round(mm * (96 / 25.4));
    clone.style.position = 'fixed';
    clone.style.top = '-9999px';
    clone.style.left = '-9999px';
    clone.style.width = mmToPx(210) + 'px';
    clone.style.minHeight = mmToPx(297) + 'px';
    clone.style.background = getComputedStyle(container).backgroundColor || '#fff';
    document.body.appendChild(clone);

    // --- swap signatures (keep labels) & photos ---
    (this.selectedForm?.formPages || []).forEach(p =>
   p.fields.forEach((f: FormField) => {
        // signatures: canvas -> img (do NOT clear wrapper)
        if (f.type === 'signature') {
          const liveCanvas = this.getCanvasById(f.id);
          if (!liveCanvas) return;
          const wrap = clone.querySelector<HTMLElement>(`.field-wrapper[data-id="${f.id}"]`);
          if (!wrap) return;

          const img = new Image();
          img.src = liveCanvas.toDataURL('image/png');
        const w = Math.round(f.width ?? (wrap.clientWidth ?? 300));
const h = Math.round(f.height ?? (wrap.clientHeight ?? 150));
          img.style.width = `${w}px`;
          img.style.height = `${h}px`;
          img.style.display = 'block';

          const canvasInClone = wrap.querySelector<HTMLCanvasElement>(`canvas[data-id="${f.id}"]`);
          canvasInClone ? canvasInClone.replaceWith(img) : wrap.appendChild(img);
        }

        // photos: file input -> img (uses base64 in field.value)
        if (f.type === 'file' && f.value) {
          const wrap = clone.querySelector<HTMLElement>(`.field-wrapper[data-id="${f.id}"]`);
          if (wrap) {
            const img = new Image();
            img.src = String(f.value);
            img.style.maxWidth = '100%';
            const input = wrap.querySelector('input[type="file"]');
            input ? input.replaceWith(img) : wrap.appendChild(img);
          }
        }
      })
    );

    // render values, not native controls (prevents tiny inputs)
this.renderValuesIntoWrappers(clone);
    // strip UI-only chrome
    this.injectPdfCleanupCss(clone);

    (html2pdf as any)()
      .from(clone)
      .set({
         margin: this.PDF_MARGIN_MM, 
        filename: `${filename}.pdf`,
        html2canvas: { scale: SNAPSHOT_SCALE, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .save()
      .finally(() => {
        clone.remove();
        container.classList.remove('export-pdf-icons');
      });
  });
}
private sanitizeGridForTemplateSave(f: any): void {
  if (f.type !== 'data-grid') return;

  this.ensureGridMatrixDefaults(f);
  const gm = f.gridMatrix!;
  // ensure numeric, sane dimensions
  gm.rows = Math.max(1, Number(gm.rows) || (gm.cells?.length || 1));
  gm.cols = Math.max(1, Number(gm.cols) || (gm.cells?.[0]?.length || 1));
  gm.cellH ??= 140;
  gm.gap ??= 12;
  gm.showBorders = gm.showBorders !== false;

  const cells: GridCell[][] = [];
  for (let r = 0; r < gm.rows; r++) {
    cells[r] = [];
    for (let c = 0; c < gm.cols; c++) {
      const src = gm.cells?.[r]?.[c] || { items: [] };
      const items = (src.items || []).map((it: any) => {
        // explicit select option typing fixes "implicit any"
        type Opt = { label?: string; value?: string };
        const opts = Array.isArray(it.options) ? (it.options as Opt[]) : undefined;
        return {
          id: it.id || `g_${r}_${c}_${Math.random().toString(36).slice(2,7)}`,
          type: it.type || 'text',
          label: it.label ?? '',
          value: null,                               // templates must not carry filled data
          options: opts?.map((o: Opt) => ({
            label: (o.label ?? String(o.value ?? '')).toString(),
            value: (o.value ?? o.label ?? '').toString(),
          })),
        };
      });
      cells[r][c] = { items };
    }
  }
  gm.cells = cells;

  // don’t keep computed matrix values on templates
  delete (f as any).value;
}

private normalizePagesForTemplateSave(pages: FormPage[]): FormPage[] {
  const clone: FormPage[] = JSON.parse(JSON.stringify(pages || []));
  clone.forEach(p => {
    p.fields = (p.fields || []).map((f: any) => {
      // keep your layout defaults
      if (!f.position) f.position = { x: 0, y: 0 };
      if (typeof f.width  !== 'number')  f.width  = f.type === 'data-grid' ? 600 : 300;
      if (typeof f.height !== 'number')  f.height =
        f.type === 'signature' ? 150 :
        f.type === 'textarea'  ? 120 :
        f.type === 'data-grid' ? 200 : 48;

      f.ui ??= {};
      f.ui.direction   ||= (['textarea','description','signature','file','photo'].includes(String(f.type||'').toLowerCase()) ? 'column' : 'row');
      f.ui.labelWidthPx = typeof f.ui.labelWidthPx === 'number' ? f.ui.labelWidthPx : 120;
      f.ui.gapPx        = typeof f.ui.gapPx        === 'number' ? f.ui.gapPx        : 10;

      if (f.type === 'data-grid') this.sanitizeGridForTemplateSave(f);
      return f;
    });
  });
  return clone;
}
saveForm(form: SavedForm) {
  // 1) capture geometry
  try { this.updatePositionsFromDOM(); } catch {}
  this.normalizeTemplatePages(form);

  // 2) normalize/sanitize fields (esp. data-grid)
  for (const p of form.formPages || []) {
    for (const f of p.fields || []) this.normalizeFieldForSave(f);
  }

  // 3) Firestore-safe data (no undefined anywhere)
  const cleanedPages = this.deepCleanForFirestore(form.formPages);

  // keep current memory copy tidy
  const idx = this.forms.findIndex((f) => f.formId === form.formId);
  if (idx !== -1) {
    const clone = JSON.parse(JSON.stringify({ ...form, formPages: cleanedPages }));
    this.forms[idx] = clone;
  }

  this.openChoice('save').then(async (choice) => {
    if (!choice) return;

    const saveLocal = () => {
      localStorage.setItem('savedFormPages', JSON.stringify(this.forms));
      this.snackBar.open(`Template "${form.formName}" saved locally!`, 'Close', { duration: 2000 });
    };

    const saveFirebase = async () => {
      const allowed = (form.allowedBranches?.length
        ? form.allowedBranches
        : [this.isAdmin() ? 'ALL' : (this.currentBranch as Exclude<Branch,'ALL'>)]);

      await this.formService.saveFormTemplate(
        form.formName || 'Untitled',
        cleanedPages,                               // ✅ sanitized pages
        allowed as Branch[]
      );

      this.snackBar.open('Template saved to Firestore!', 'Close', { duration: 2000 });

      // ✅ force-refresh the Templates list so it appears in “Forms to fill”
      this.loadFromFirebase('templates');
    };

    try {
      if (choice === 'local') {
        saveLocal();
      } else if (choice === 'firebase') {
        await saveFirebase();
      } else if (choice === 'both') {
        saveLocal();
        await saveFirebase();
      }
    } catch (e) {
      console.error(e);
      this.snackBar.open('Failed to save template.', 'Close', { duration: 3000 });
    }
  });
}}