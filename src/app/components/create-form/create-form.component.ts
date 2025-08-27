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
  options?: { value: string; label: string; checked?: boolean }[];
  width?: number;
  position?: { x: number; y: number };
  required?: boolean;
  height?: number;
  problemItems?: { no: number; text: string }[];
  problemCounter?: number;
  isDescription?: boolean;
}
interface FormPage {
  fields: FormField[];
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

@Component({
  selector: 'app-create-form',
  templateUrl: './create-form.component.html',
  styleUrls: ['./create-form.component.scss'],
})

export class CreateFormComponent implements OnInit, AfterViewInit, OnDestroy {
  private textareasSub?: Subscription;
  examplePdfUrl: string | null = null;

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

  //
  
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

// 2) Branch-aware template load
const fetchTemplates = this.isAdmin()
  ? this.formService.getFormTemplates()                              // Admin sees all
  : this.formService.getVisibleTemplatesForBranch(this.currentBranch); // Crew sees only their branch (or ALL)

fetchTemplates
  .then((list: any[]) => {
    this.forms = (list || []).map((x: any) => ({
      formId: this.makeId(x, 'template'),
      formName: x?.formName ?? x?.name ?? x?.title ?? 'Untitled (template)',
      formPages: x?.formPages ?? [],
      source: 'template' as const,
      pdfUrl: x?.pdfUrl ?? null,
      allowedBranches: x?.allowedBranches?.length ? x.allowedBranches : ['ALL'],
    }));
    this.splitLists(); // populates this.templates
    // Extra safety in case of legacy docs
    if (!this.isAdmin()) this.templates = this.templates.filter(this.canSeeTemplate);
  })
  .catch(err => {
    console.error('load templates failed', err);
    this.loadForms();   // local fallback (legacy)
    this.splitLists();
    if (!this.isAdmin()) this.templates = this.templates.filter(this.canSeeTemplate);
  });}

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

// expand ['ALL'] to concrete branches
private expandAllowed(ab?: Branch[]): Exclude<Branch, 'ALL'>[] {
  if (!ab || ab.length === 0) return this.ALL_BRANCHES;
  return ab.includes('ALL') ? this.ALL_BRANCHES : (ab as Exclude<Branch, 'ALL'>[]);
}

// can this template be seen by the current branch?
private canSeeTemplate = (f: SavedForm): boolean => {
  const allowed = this.expandAllowed(f.allowedBranches as Branch[] | undefined);
  return this.currentBranch === 'ALL' || allowed.includes(this.currentBranch as any);
};
  private attachAutoGrowListeners() {
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


  asKey(id?: string) {
    return String(id ?? '');
  }
  isDownloading(id?: string) {
    return this.downloading.has(this.asKey(id));
  }

  public downloading = new Set<string>();
  getFieldStyle(field: any) {
    if (field?.id === 'description') {
      return {
        position: 'relative',
        width: field?.width ? `${field.width}px` : '100%',
        ...(field?.height ? { height: `${field.height}px` } : {}),
        padding: '8px',
        border: '1px solid #ccc',
        background: '#fafafa',
        boxSizing: 'border-box',
        marginBottom: '1rem',
      };
    }
    return {
      position: 'absolute',
      left: `${field?.position?.x || 0}px`,
      top: `${field?.position?.y || 0}px`,
      width: `${field?.width || 300}px`,
      ...(field?.height ? { height: `${field.height}px` } : {}),
      padding: '8px',
      border: '1px solid #ccc',
      background: '#fff',
      boxSizing: 'border-box',
    };
  }

 onAddTemplate(): void {
  const tpl: SavedForm = {
    formId: 'new-' + Math.random().toString(36).slice(2),
    formName: 'Untitled',
    formPages: [{ fields: [] }],
    source: 'template',
    allowedBranches: this.isAdmin() ? ['ALL'] : [this.currentBranch as Exclude<Branch,'ALL'>],
  };
  this.forms.unshift(tpl);
  this.splitLists();
  this.openForm(tpl);
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

  if (kind === 'both') {
    this.snackBar.open('Loading templates and filled forms…', undefined, { duration: 1500 });
    Promise.all([templatePromise, this.formService.getFilledForms()])
      .then(([templates, filled]) => {
        const t = (templates || []).map((x: any) => toSaved(x, 'template'));
        const f = (filled || []).map((x: any) => toSaved(x, 'filled'));
        const nameOf = (x: SavedForm) => x.formName ?? '';
        this.forms = [...t, ...f].sort((a, b) =>
          nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' })
        );
        this.splitLists();
        if (!this.isAdmin()) this.templates = this.templates.filter(this.canSeeTemplate);
        this.snackBar.open(`Loaded ${this.forms.length} forms from Firebase.`, 'Close', { duration: 2500 });
      })
      .catch((err: any) => {
        console.error('Error loading from Firestore:', err);
        this.snackBar.open('Failed to load from Firebase.', 'Close', { duration: 3000 });
      });
    return;
  }

  // ✅ Only one variable here
  const listPromise =
    kind === 'filled'
      ? this.formService.getFilledForms()
      : templatePromise;

  this.snackBar.open(`Loading ${kind} from Firebase…`, undefined, { duration: 1200 });

  listPromise
    .then((list) => {
      const normalized = (list || []).map((x: any) =>
        toSaved(x, kind === 'filled' ? 'filled' : 'template')
      );
      const nameOf = (x: SavedForm) => x.formName ?? '';
      this.forms = normalized.sort((a, b) =>
        nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' })
      );
      this.splitLists();
      if (!this.isAdmin() && kind !== 'filled') {
        this.templates = this.templates.filter(this.canSeeTemplate);
      }
      this.snackBar.open(`Loaded ${normalized.length} ${kind}.`, 'Close', { duration: 2500 });
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

  getAdjustedHeight(fieldHeight?: number, min = 40, labelSpace = 22): number | null {
    if (!fieldHeight) return null;
    return Math.max(min, fieldHeight - labelSpace);
  }

  getSignatureCanvasHeight(fieldHeight?: number, min = 120, labelSpace = 22): number {
    if (!fieldHeight) return min;
    return Math.max(min, fieldHeight - labelSpace);
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
    this.beginEditing(instance);
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
    this.filledDataName = inst.formName;
    this.showFormEditor = true;
    this.showNameInput = false;
    this.nameError = false;
    this.adjustFormContainerHeight();
    setTimeout(() => this.initCanvases(), 0);
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
  const toSpan = (el: HTMLElement, text: string) => {
    const span = document.createElement('span');
    span.className = 'print-value';
    span.textContent = text ?? '';
    const cs = getComputedStyle(el);
    span.style.display = 'inline-block';
    span.style.whiteSpace = cs.whiteSpace || 'pre-wrap';
    span.style.font = cs.font;
    span.style.lineHeight = cs.lineHeight;
    span.style.letterSpacing = cs.letterSpacing;
    span.style.width = `${(el as HTMLElement).clientWidth}px`;
    span.style.minHeight = `${(el as HTMLElement).clientHeight}px`;
    span.style.padding = cs.padding || '6pt 8pt';
    span.style.border = '0.5pt solid #E5E7EB';
    span.style.background = '#FAFAFA';
    el.replaceWith(span);
  };

  // text-like
  root.querySelectorAll<HTMLInputElement>(
    'input[type="text"],input[type="number"],input[type="email"],input[type="tel"],input[type="date"]'
  ).forEach(el => toSpan(el, el.value ?? ''));

  // textarea
  root.querySelectorAll<HTMLTextAreaElement>('textarea')
    .forEach(el => toSpan(el, el.value ?? ''));

  // native <select>
  root.querySelectorAll<HTMLSelectElement>('select')
    .forEach(el => {
      const label = el.selectedOptions?.[0]?.text ?? el.value ?? '';
      toSpan(el as any, label);
    });

  // checkboxes → inline mark + label (no big box)
  root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(el => {
    const span = document.createElement('span');
    const labelText = (el.parentElement?.textContent || '').trim();
    span.textContent = `${el.checked ? '☑' : '☐'} ${labelText}`;
    span.style.display = 'inline-block';
    el.parentElement ? el.parentElement.replaceWith(span) : el.replaceWith(span);
  });

  // radios → inline mark + label (replace the <label> wrapper)
  root.querySelectorAll<HTMLLabelElement>('label.radio-option').forEach(label => {
    const input = label.querySelector<HTMLInputElement>('input[type="radio"]');
    const text = (label.textContent || '').trim();
    const span = document.createElement('span');
    span.textContent = `${input?.checked ? '◉' : '○'} ${text}`;
    span.style.display = 'inline-block';
    label.replaceWith(span);
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

  // 2) collect values
 const values: Record<string, any> = {};
this.selectedForm.formPages.forEach((p: FormPage) =>
  p.fields.forEach((f: FormField) => (values[f.id] = f.value ?? null))
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
    const cssH = Math.max(1, (this.getSignatureCanvasHeight(field?.height) ?? canvas.clientHeight) || 150);
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
    this.drawingMap[fieldId] = true;
    const pos = this.getPointerPos(event, fieldId);
    this.lastPos[fieldId] = pos;
    const ctx = this.ctxMap[fieldId];
    if (!ctx) return;
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
    this.sigSrcMap[fieldId] = data; // keep the redraw source fresh
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
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
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

  updatePositionsFromDOM(): void {
    if (!this.selectedForm) return;
    const container = document.getElementById('form-to-export');
    if (!container) return;

    this.selectedForm.formPages.forEach((page, pageIndex) => {
      const pageEl = container.querySelectorAll('.page-container')[pageIndex];
      if (!pageEl) return;

      page.fields.forEach((field) => {
        const fieldEl = (pageEl as HTMLElement).querySelector(
          `.field-wrapper[data-id="${field.id}"]`
        ) as HTMLElement;
        if (!fieldEl) return;

        const containerRect = (pageEl as HTMLElement).getBoundingClientRect();
        const fieldRect = fieldEl.getBoundingClientRect();

        field.position = {
          x: fieldRect.left - containerRect.left,
          y: fieldRect.top - containerRect.top,
        };
      });
    });
  }
  startFormFromTemplate(tpl: SavedForm) {
  const inst: FilledInstance = {
    instanceId: null,                       // new instance
    templateId: tpl.formId,                 // link to the template
    formName: tpl.formName || 'Untitled Form',
    formPagesSnapshot: JSON.parse(JSON.stringify(tpl.formPages)),
    data: {},
    preview: null,
    updatedAt: Date.now(),
  };

  this.beginEditing(inst);  
  this.restoreCheckboxesFromValue(); 
                 // opens the editor with a fresh instance
                // optional: switch to “Filled” tab/section
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

      if (!host.style.position) host.style.position = 'relative';
      const hostW = Math.max(1, Math.round(host.clientWidth || host.scrollWidth || 794));

      page.fields.forEach((field) => {
        const sel = `.field-wrapper[data-id="${field.id}"]`;
        const fieldEl = (host.querySelector(sel) as HTMLElement) || (pageEl.querySelector(sel) as HTMLElement);
        if (!fieldEl) return;

        const w = Math.max(20, Math.round(field.width ?? 300));
        const h = field.height ? Math.max(20, Math.round(field.height)) : null;

        const isDesc =
          field.id === 'description' || field.type === 'description' || (field as any).isDescription;
        if (isDesc) {
          fieldEl.style.position = 'relative';
          fieldEl.style.left = '';
          fieldEl.style.top = '';
          fieldEl.style.width = field.width ? `${w}px` : `${hostW}px`;
          fieldEl.style.minHeight = h ? `${h}px` : '140px';
          fieldEl.style.removeProperty('height');
        } else {
          const x = Math.max(0, Math.round(field.position?.x ?? 0));
          const y = Math.max(0, Math.round(field.position?.y ?? 0));
          fieldEl.style.position = 'absolute';
          fieldEl.style.left = `${x}px`;
          fieldEl.style.top = `${y}px`;
          fieldEl.style.width = `${w}px`;
          if (h) fieldEl.style.height = `${h}px`;
          else fieldEl.style.removeProperty('height');
        }
      });
    });
  }

  /* ---------------- Fast download helpers ---------------- */

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
      this.replaceControlsWithValues(clone);
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
      this.replaceControlsWithValues(clone);
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

  // NEW: make each page sized like A4 so offsets are relative to a page
  (clonePages.length ? clonePages : [clone]).forEach(p => {
    p.style.position   = 'relative';
    p.style.width      = `${A4W}px`;
    p.style.minHeight  = `${A4H}px`;
    p.style.background = '#fff';
    p.style.overflow   = 'visible';
  });

  // Now do the swaps (canvases → img, inputs → text, photos → img)
 this.swapSignaturesInto(clone);
this.flattenMatSelects(clone);           // <-- add
this.flattenMatRadiosAndChecks(clone);   // <-- add
this.replaceControlsWithValues(clone);
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
    sandbox.remove();
  }
}

openFilledForm(filled: any) {
  this.selectedForm = {
    formId: filled.id ?? filled.formId,   
    formName: filled.formName,
    formPages: JSON.parse(JSON.stringify(filled.formPagesSnapshot)),
     source: 'filled', 
     sourceFormId: filled.sourceFormId ?? filled.templateId ?? null,
  };
this.restoreCheckboxesFromValue()
  // ✅ restore signature images
 this.selectedForm.formPages.forEach((page: any) => {
    page.fields.forEach((field: any) => {
      if (field.type !== 'signature') return;
      const cnv = this.getCanvasById(field.id);
      const ctx = cnv?.getContext('2d');
      if (!cnv || !ctx) return;

      const src = field.value || field.signatureUrl;
      if (!src) return;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => ctx.drawImage(img, 0, 0, cnv.width, cnv.height);
      img.src = src;
    });
  });
}


  savePDFPreview() {
    this.showNameInput = true;
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

    const clone = container.cloneNode(true) as HTMLElement;

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
this.replaceControlsWithValues(clone);
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
          margin: 0,
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
    const target =
      (liveRoot!.querySelector('.page-surface') as HTMLElement) ||
      (liveRoot!.querySelector('.form-page-container') as HTMLElement) ||
      liveRoot!;

    if (!liveRoot) {
      this.snackBar.open('form-to-export not found', 'Close', { duration: 2500 });
      return;
    }

    const restoreLive = this.captureInlineStyles(liveRoot);

    try {
      try {
        this.applyPositionsToLiveForm?.();
      } catch {}
      try {
        await (document as any).fonts?.ready;
      } catch {}

      const clone = liveRoot.cloneNode(true) as HTMLElement;

  this.swapSignaturesInto(clone);
this.flattenMatSelects(clone);           // <-- add
this.flattenMatRadiosAndChecks(clone);   // <-- add
this.replaceControlsWithValues(clone);
this.swapPhotosIntoClone(clone);
this.injectPdfCleanupCss(clone);

      const mmToPx = (mm: number) => mm * (96 / 25.4);
      const A4W = Math.round(mmToPx(210));
      const A4H = Math.round(mmToPx(297));

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

      clone.style.position = 'relative';
      clone.style.width = '100%';
      clone.style.minHeight = A4H + 'px';
      clone.style.background = '#fff';

      shell.appendChild(clone);
      sandbox.appendChild(shell);
      document.body.appendChild(sandbox);

      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));

      const rect = shell.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20 || !clone.querySelector('.field-wrapper')) {
        sandbox.remove();
        this.snackBar.open('Nothing measurable to render.', 'Close', { duration: 2500 });
        return;
      }

      const canvas = await html2canvas(shell, {
        scale: SNAPSHOT_SCALE,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: 0,
      });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pW = pdf.internal.pageSize.getWidth();
      const pH = pdf.internal.pageSize.getHeight();

      this.addCanvasAsMultipage(pdf, canvas, pW, pH, true, 8);

      const filename = (form.formName || 'form').trim() || 'form';
      const blob: Blob = pdf.output('blob');
      pdf.save(`${filename}.pdf`);

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
    this.replaceControlsWithValues(clone);
    // strip UI-only chrome
    this.injectPdfCleanupCss(clone);

    (html2pdf as any)()
      .from(clone)
      .set({
        margin: 10,
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
  saveForm(form: SavedForm) {
    const idx = this.forms.findIndex((f) => f.formId === form.formId);
    if (idx !== -1) this.forms[idx] = JSON.parse(JSON.stringify(form));

    this.openChoice('save').then(async (choice) => {
      if (!choice) return;

      const saveLocal = () => {
        localStorage.setItem('savedFormPages', JSON.stringify(this.forms));
        this.snackBar.open(`Template "${form.formName}" saved locally!`, 'Close', { duration: 2000 });
      };

    const saveFirebase = () => {
  const allowed = (form.allowedBranches?.length
    ? form.allowedBranches
    : [this.isAdmin() ? 'ALL' : (this.currentBranch as Exclude<Branch,'ALL'>)]);
  return this.formService.saveFormTemplate(
    form.formName || 'Untitled',
    form.formPages,
    allowed as Branch[]
  ).then(() =>
    this.snackBar.open('Template saved to Firestore!', 'Close', { duration: 2000 })
  );
};

      try {
        if (choice === 'local') saveLocal();
        else if (choice === 'firebase') await saveFirebase();
        else if (choice === 'both') {
          saveLocal();
          await saveFirebase();
        }
      } catch (e) {
        console.error(e);
        this.snackBar.open('Failed to save template.', 'Close', { duration: 3000 });
      }
    });
  }
}