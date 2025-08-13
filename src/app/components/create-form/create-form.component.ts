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

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/* ---------------- Types ---------------- */

interface FormField {
  id: string;
  label?: string;
  type?: string;
  value?: any;
  placeholder?: string;
  options?: { value: string; label: string }[];
  width?: number;
  position?: { x: number; y: number };
  required?: boolean;
  height?: number;
    problemItems?: { no: number; text: string }[];
  problemCounter?: number;
}
interface FormPage { fields: FormField[]; }

interface SavedForm {
  formId: string;
  formName?: string;
  formPages: FormPage[];
  source?: 'template' | 'filled';
  pdfUrl?: string | null;  
}

interface FilledFormData { // local fallback
  formId: string;
  name: string;
  data: Record<string, any>;
  formPagesSnapshot?: FormPage[];
  formPdfPreview?: string | null;
}

interface FilledInstance {
  instanceId: string | null;     // Firestore doc.id for filled docs (null until created)
  templateId?: string;           // source template id if created from template
  formName: string;              // editable display name
  formPagesSnapshot: FormPage[]; // full layout + values
  data: Record<string, any>;     // flat values
  preview?: string | null;
  updatedAt: number;             // client timestamp
}

/* ---------------- Component ---------------- */

@Component({
  selector: 'app-create-form',
  templateUrl: './create-form.component.html',
  styleUrls: ['./create-form.component.scss'],
})
export class CreateFormComponent implements OnInit, AfterViewInit {
  examplePdfUrl: string = 'assets/sample.pdf';

  forms: SavedForm[] = [];
  showFormEditor = false;
  showNameInput = false;
  nameError = false;
  containerHeight: number = 600;
  formPdfImagePreview: string | null = null;
  isLoadedFromDashboard = true;

  @Input() selectedForm: SavedForm | null = null;  // UI binding
  @Input() filledDataName: string = '';            // bound to name input

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

  // current filled instance being edited (layout + values)
  private currentInstance: FilledInstance | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private formService: FormService
  ) {}

  /* ---------------- Lifecycle ---------------- */

  ngOnInit(): void {
    this.formService
      .getFormTemplates()
      .then((fetchedForms) => {
        if (fetchedForms.length) {
          this.forms = fetchedForms.map(f => ({ ...f, source: 'template' as const }));
        } else {
          this.loadForms(); // fallback
        }
      })
      .catch(() => this.loadForms());
  }

  ngAfterViewInit(): void {
    this.initCanvases();
    this.loadPdf(this.examplePdfUrl);

    // attach auto-grow
    this.textareas.forEach((textareaEl) => {
      const textarea = textareaEl.nativeElement;
      this.autoGrow(textarea);
      if (textarea.id !== 'description') {
        textarea.addEventListener('input', () => this.autoGrow(textarea));
      }
    });

    this.textareas.changes.subscribe(() => {
      this.ngAfterViewInit();
    });
  }



asKey(id: unknown): string {
  return String(id ?? '');
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
    boxSizing: 'border-box'
  };
}
onAddTemplate(): void {
  // TODO: Replace this with actual add template logic
  console.log('Add Template button clicked');
}
  /* ---------------- Dialog for Save/Load choice ---------------- */

  openChoice(mode: 'save' | 'load'): Promise<'local' | 'firebase' | 'both' | null> {
    const ref = this.dialog.open(this.saveLoadChoiceTpl, {
      width: '340px',
      data: { mode },
      autoFocus: true,
      restoreFocus: true,
    });
    return ref.afterClosed().toPromise();
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

    // FIX: no "canvas" property here
    await page.render({ canvasContext: context, viewport }).promise;
  }

  /* ---------------- Local template fallback ---------------- */

  loadForms(): void {
    const savedFormPages = localStorage.getItem('savedFormPages');
    const local: SavedForm[] = savedFormPages ? JSON.parse(savedFormPages) : [];
    this.forms = local.map(it => ({ ...it, source: it.source ?? 'template' }));
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
    });

    if (kind === 'both') {
      this.snackBar.open('Loading templates and filled forms…', undefined, { duration: 1500 });
      Promise.all([this.formService.getFormTemplates(), this.formService.getFilledForms()])
        .then(([templates, filled]) => {
          const t = (templates || []).map((x: any) => toSaved(x, 'template'));
          const f = (filled   || []).map((x: any) => toSaved(x, 'filled'));
          const nameOf = (x: SavedForm) => x.formName ?? '';
          this.forms = [...t, ...f].sort((a, b) =>
            nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' })
          );
          this.snackBar.open(`Loaded ${this.forms.length} forms from Firebase.`, 'Close', { duration: 2500 });
        })
        .catch((err: any) => {
          console.error('Error loading from Firestore:', err);
          this.snackBar.open('Failed to load from Firebase.', 'Close', { duration: 3000 });
        });
      return;
    }

    const p = kind === 'filled' ? this.formService.getFilledForms() : this.formService.getFormTemplates();
    this.snackBar.open(`Loading ${kind} from Firebase…`, undefined, { duration: 1200 });

    p.then(list => {
        const normalized = (list || []).map((x: any) =>
          toSaved(x, kind === 'filled' ? 'filled' : 'template')
        );
        const nameOf = (x: SavedForm) => x.formName ?? '';
        this.forms = normalized.sort((a, b) =>
          nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' })
        );
        this.snackBar.open(`Loaded ${normalized.length} ${kind}.`, 'Close', { duration: 2500 });
      })
      .catch((err: any) => {
        console.error('Error loading from Firestore:', err);
        this.snackBar.open(`Failed to load ${kind} from Firebase.`, 'Close', { duration: 3000 });
      });
  }

  // alias for your HTML button
  loadFormsFromFirebase(): void {
    this.loadFromFirebase('both');
  }
getPageHeight(page: { fields: any[] }): number {
  const MIN = 800;   // baseline height for empty/short pages
  const PAD = 120;   // breathing room at the bottom

  if (!page?.fields?.length) return MIN;

  const maxY = page.fields.reduce((m, f) => {
    const y = Number(f?.position?.y ?? 0);
    const h =
      Number(f?.height) ||
      (f?.type === 'signature' ? 150 :
       f?.type === 'textarea'  ? 120 : 48);
    return Math.max(m, y + h);
  }, 0);

  return Math.max(MIN, Math.ceil(maxY + PAD));
}
  /* ---------------- Opening for edit ---------------- */
getAdjustedHeight(fieldHeight?: number, min = 40, labelSpace = 22): number | null {
  if (!fieldHeight) return null;
  return Math.max(min, fieldHeight - labelSpace);
}

// signature canvas needs a larger minimum
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
  private ensureProblemInit(field: any) { if (!field.problemItems) field.problemItems = []; }

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
  field.problemItems.forEach((it: any, i: number) => it.no = i + 1);
}
isDescriptionField(field: any): boolean {
  if (!field) return false;

  const typeOk = field.type === 'textarea' || field.type === 'description';
  const label = (field.label || '').toString().trim();

  return typeOk && (
    /description/i.test(label) ||          // label has “description”
    field.id === 'description' ||          // id is “description”
    field.isDescription === true ||        // explicit flag, if present
    Array.isArray(field.problemItems)      // already has items
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
  this.startW = field.width  ?? 240;
  this.startH = field.height ?? this.getWrapperCurrentHeight(field);

  document.addEventListener('mousemove', this.onResizeMove);
  document.addEventListener('mouseup', this.stopResize);
}

onResizeMove = (e: MouseEvent) => {
  if (!this.resizingField) return;
  const dx = e.clientX - this.startX;
  const dy = e.clientY - this.startY;

  // No real limits, keep just a tiny positive min so it doesn't collapse
  this.resizingField.width  = Math.max(20, this.startW + dx);
  this.resizingField.height = Math.max(20, this.startH + dy);
};

stopResize = () => {
  document.removeEventListener('mousemove', this.onResizeMove);
  document.removeEventListener('mouseup', this.stopResize);
  this.resizingField = null;
};

// Helper: read live wrapper height if none set yet
private getWrapperCurrentHeight(field: FormField): number {
  const el = document.querySelector<HTMLElement>(`.field-wrapper[data-id="${field.id}"]`);
  return el ? el.getBoundingClientRect().height : 120;
}
private readonly edgeGrab = 20;
onWrapperMouseDown(e: MouseEvent, field: FormField) {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;

  // only start resize when grabbing near the right/bottom edges
  const nearRight  = rect.width  - offsetX <= this.edgeGrab;
  const nearBottom = rect.height - offsetY <= this.edgeGrab;
  if (!nearRight && !nearBottom) return; // let normal clicks/drag happen

  e.preventDefault();
  e.stopPropagation();

  this.resizingField = field;
  this.startX = e.clientX;
  this.startY = e.clientY;
  this.startW = field.width  ?? rect.width;
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

  /* ---------------- Save (Local / Firebase / Both) ---------------- */

  async confirmSaveFilledForm(): Promise<void> {
    const nameTrimmed = (this.filledDataName || '').trim();
    if (!this.selectedForm || !this.currentInstance) return;
    if (!nameTrimmed) {
      this.nameError = true;
      return;
    }
    this.nameError = false;

    // capture signatures
    this.selectedForm.formPages.forEach((page) => {
      page.fields.forEach((field) => {
        if (field.type === 'signature') {
          const canvas = this.getCanvasById(field.id);
          if (canvas) field.value = canvas.toDataURL();
        }
      });
    });

    // collect values
    const values: Record<string, any> = {};
    this.selectedForm.formPages.forEach((p) =>
      p.fields.forEach((f) => (values[f.id] = f.value ?? null))
    );

    // preview image (optional)
    const formElement = document.querySelector('.form-page-container') as HTMLElement;
    if (formElement) {
      const canvas = await html2canvas(formElement, { scale: 2 });
      this.formPdfImagePreview = canvas.toDataURL('image/png');
    }

    // update instance
    this.currentInstance.formName = nameTrimmed;
    this.currentInstance.formPagesSnapshot = JSON.parse(JSON.stringify(this.selectedForm.formPages));
    this.currentInstance.data = values;
    this.currentInstance.preview = this.formPdfImagePreview || null;
    this.currentInstance.updatedAt = Date.now();

    // where to save?
    const choice = await this.openChoice('save');
    if (!choice) return;

    // Local save (compatible with your existing key)
    const saveLocal = () => {
      const stored = localStorage.getItem('filledForms');
      const arr: FilledFormData[] = stored ? JSON.parse(stored) : [];
      const idForLocal = this.selectedForm!.formId;
      const idx = arr.findIndex((f) => f.formId === idForLocal && f.name === nameTrimmed);
      const filledForm: FilledFormData = {
        formId: idForLocal,
        name: nameTrimmed,
        data: values,
        formPagesSnapshot: this.currentInstance!.formPagesSnapshot,
        formPdfPreview: this.currentInstance!.preview ?? null,
      };
      if (idx >= 0) arr[idx] = filledForm; else arr.push(filledForm);
      localStorage.setItem('filledForms', JSON.stringify(arr));
      if (this.formPdfImagePreview) {
        localStorage.setItem('lastPdf-preview-image', this.formPdfImagePreview);
      }
    };

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
      this.forms.unshift({
        formId: ref.id,
        formName: this.currentInstance!.formName,
        formPages: this.currentInstance!.formPagesSnapshot,
        source: 'filled',
      });
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
    };

    try {
      const isFilled = this.selectedForm.source === 'filled';

      if (choice === 'local') {
        saveLocal();
        this.snackBar.open(`Form saved locally as "${nameTrimmed}"`, 'Close', { duration: 3000 });
      } else if (choice === 'firebase') {
        if (isFilled) {
          await saveFirebaseUpdate();
        } else {
          await saveFirebaseCreate();
        }
        this.snackBar.open(`Form saved to Firebase as "${nameTrimmed}"`, 'Close', { duration: 3000 });
      } else if (choice === 'both') {
        saveLocal();
        if (isFilled) {
          await saveFirebaseUpdate();
        } else {
          await saveFirebaseCreate();
        }
        this.snackBar.open(`Form saved locally & to Firebase as "${nameTrimmed}"`, 'Close', { duration: 3000 });
      }

      this.filledFormsUpdated.emit();
      this.closeForm();
    } catch (err: any) {
      console.error('❌ Error submitting form:', err);
      this.snackBar.open('Failed to save. Please try again.', 'Close', { duration: 3000 });
    }
  }

  /* ---------------- Delete (template or filled) ---------------- */

  deleteForm(form: SavedForm): void {
    if (!confirm(`Delete "${form.formName || 'Untitled'}"? This cannot be undone.`)) return;

    const isFilled = form.source === 'filled';
    const op = isFilled
      ? this.formService.deleteFilledForm(form.formId)
      : this.formService.deleteTemplate(form.formId);

    op.then(() => {
        // also remove matching local
        const stored = localStorage.getItem('filledForms');
        if (stored) {
          const arr: FilledFormData[] = JSON.parse(stored);
          const next = arr.filter(x => x.formId !== form.formId);
          localStorage.setItem('filledForms', JSON.stringify(next));
        }
        this.forms = this.forms.filter(f => f.formId !== form.formId);
        if (this.selectedForm?.formId === form.formId) this.closeForm();
        this.snackBar.open('Deleted.', 'Close', { duration: 2000 });
      })
      .catch((err: any) => {
        console.error(err);
        this.snackBar.open('Failed to delete.', 'Close', { duration: 3000 });
      });
  }

  /* ---------------- File handling (image upload field) ---------------- */

  onFileSelected(event: Event, field: any) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        field.value = reader.result as string; // base64
      };
      reader.readAsDataURL(file);
    }
  }

  /* ---------------- Signature / Pointer helpers ---------------- */

  initCanvases(): void {
    this.ctxMap = {};
    this.drawingMap = {};
    this.lastPos = {};
    if (!this.canvasRefs) return;

    this.canvasRefs.forEach((ref) => {
      const canvas = ref.nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);

      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;

      const fieldId = canvas.getAttribute('data-id') || '';
      this.ctxMap[fieldId] = ctx;
      this.drawingMap[fieldId] = false;
    });
  }

  getCanvasById(fieldId: string): HTMLCanvasElement | null {
    if (!this.canvasRefs) return null;
    const ref = this.canvasRefs.find(
      (r) => r.nativeElement.getAttribute('data-id') === fieldId
    );
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
  }

  clearSignatureCanvas(fieldId: string): void {
    const canvas = this.getCanvasById(fieldId);
    const ctx = this.ctxMap[fieldId];
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const field = this.selectedForm?.formPages
        .flatMap((p) => p.fields)
        .find((f) => f.id === fieldId);
      if (field) field.value = '';
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

  applyPositionsToLiveForm(): void {
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

        if (field.id === 'description') {
          fieldEl.style.position = 'relative';
          fieldEl.style.left = '';
          fieldEl.style.top = '';
          fieldEl.style.width = field.width ? field.width + 'px' : '100%';
        } else {
          fieldEl.style.position = 'absolute';
          fieldEl.style.left = (field.position?.x ?? 0) + 'px';
          fieldEl.style.top = (field.position?.y ?? 0) + 'px';
          fieldEl.style.width = (field.width ?? 300) + 'px';
        }

        if (field.height) fieldEl.style.height = field.height + 'px';
        else fieldEl.style.height = '';
      });
    });
  }


async onClickDownloadIcon(form: SavedForm) {
  if (!form?.pdfUrl) {
    // no pdf yet? generate -> upload -> and the export already pdf.save()'s locally
    await this.onPdfClick(form); 
    return;
  }

  try {
    this.downloading.add(form.formId);
    await this.downloadPdf(form); // your blob+fallback version
    this.snackBar.open('PDF downloaded.', 'Close', { duration: 2000 });
  } catch (e) {
    console.error(e);
    this.snackBar.open('Download failed.', 'Close', { duration: 2500 });
  } finally {
    this.downloading.delete(form.formId);
    this.cdr.detectChanges();
  }
}

  /* ---------------- Exports ---------------- */

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

  downloadFilledFormAsPDF() {
    const el = document.getElementById('filled-form-preview');
    if (!el) return;

    html2canvas(el).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 10, imgWidth, imgHeight);
      pdf.save('filled-form.pdf');
    });
  }

  savePDFPreview() {
    this.showNameInput = true;
  }
  cancelSave(): void {
  this.showNameInput = false;
  this.nameError = false;
  // optional: clear the input
  this.filledDataName = '';
}

async onPdfClick(form: SavedForm) {
    this.downloading.add(form.formId);
    this.cdr.detectChanges();
  try {
    if (form.pdfUrl) {
      await this.downloadPdf(form);
      return;
    }
    await this.exportFormToPDF(form);  // generate + upload + download
  } catch (e) {
    console.error(e);
    this.snackBar.open('PDF action failed.', 'Close', { duration: 2500 });
  }finally {
      this.downloading.delete(form.formId);
      this.cdr.detectChanges();
    }
  }

/** Helper used from the list – temporarily open the form, export, then restore UI */
  private async exportFormToPDF(form: SavedForm) {
  const prevSelected = this.selectedForm;
  const prevShowEditor = this.showFormEditor;

  this.openForm(form);        // binds selectedForm + renders DOM
   await new Promise(requestAnimationFrame);
    this.cdr.detectChanges();
    await new Promise(res => setTimeout(res, 0));   // let Angular paint

  try {
    await this.exportToPDFAndUpload();  // 👈 upload-aware exporter below
  } finally {
    this.selectedForm = prevSelected;
    this.showFormEditor = prevShowEditor;
    this.cdr.detectChanges();
  }
}


/** Export current selectedForm to PDF, upload to Storage, save URL in Firestore, download */
private async exportToPDFAndUpload(): Promise<void> {
  const filename = prompt('Enter filename for PDF', this.selectedForm?.formName || 'form');
  if (!filename || !this.selectedForm) return;

  this.applyPositionsToLiveForm?.();
  this.cdr.detectChanges();

  const container = document.getElementById('form-to-export');
  if (!container) {
    alert('Form container not found!');
    return;
  }
  container.classList.add('export-pdf-icons');
   try { await (document as any).fonts?.ready; } catch {}

  const clone = container.cloneNode(true) as HTMLElement;
  const mmToPx = (mm: number) => mm * (96 / 25.4);
  const a4WidthMM = 210;
  const a4HeightMM = 297;

  clone.style.position = 'relative';
  clone.style.width = mmToPx(a4WidthMM) + 'px';
  clone.style.minHeight = mmToPx(a4HeightMM) + 'px';
  clone.style.background = window.getComputedStyle(container).backgroundColor || 'white';

  this.selectedForm.formPages.forEach((page) => {
    page.fields.forEach((field) => {
      if (field.type === 'signature') {
        const canvas = this.getCanvasById(field.id);
        if (canvas) {
          const base64 = canvas.toDataURL();
          const img = document.createElement('img');
          img.src = base64;
          img.style.width = (field.width ?? 300) + 'px';
          img.style.height = (field.height ?? 150) + 'px';
          const fieldEl = clone.querySelector(`.field-wrapper[data-id="${field.id}"]`);
          if (fieldEl) {
            (fieldEl as HTMLElement).innerHTML = '';
            fieldEl.appendChild(img);
          }
        }
      }
    });
  });

  const pageContainers = clone.querySelectorAll('.page-container');
  pageContainers.forEach((el, i) => {
    if (i < pageContainers.length - 1) {
      (el as HTMLElement).style.pageBreakAfter = 'always';
      (el as HTMLElement).style.breakAfter = 'page';
    }
  });

  clone.style.position = 'fixed';
  clone.style.top = '-9999px';
  clone.style.left = '-9999px';
  document.body.appendChild(clone);

  try {
    const worker = (html2pdf as any)()
      .from(clone)
      .set({
        margin: 10,
        filename: `${filename}.pdf`,
        html2canvas: { scale: 4, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      })
      .toPdf();

    const pdf: any = await worker.get('pdf');
    const blob: Blob = pdf.output('blob');

    const kind: 'filled' | 'template' = this.selectedForm.source === 'filled' ? 'filled' : 'template';
    const id = this.selectedForm.formId;

    const url = await this.formService.uploadPdfBlob(kind, id, blob, filename);
    await this.formService.attachPdfUrl(kind, id, url);

    // reflect URL in UI memory
    const idx = this.forms.findIndex(f => f.formId === id);
    if (idx >= 0) this.forms[idx] = { ...this.forms[idx], pdfUrl: url };
    if (this.selectedForm && this.selectedForm.formId === id) {
      (this.selectedForm as any).pdfUrl = url;
    }

    // also save locally
    pdf.save(`${filename}.pdf`);

    this.snackBar.open('PDF uploaded and downloaded.', 'Close', { duration: 2500 });
  } catch (err) {
    console.error('PDF export/upload failed:', err);
    this.snackBar.open('Failed to export/upload PDF.', 'Close', { duration: 3000 });
  } finally {
    clone.remove();
    container.classList.remove('export-pdf-icons');
  }
}

/** Download helper (fetch to get a blob, then force save-as) */
private async downloadPdf(form: SavedForm) {
  if (!form.pdfUrl) return;
  try {
    const res = await fetch(form.pdfUrl, { mode: 'cors' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form.formName || 'form'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Download failed', e);
    window.open(form.pdfUrl, '_blank'); // fallback preview
  }
}
exportToPDF(): void {
  const filename = prompt('Enter filename for PDF', this.selectedForm?.formName || 'form');
  if (!filename) return;

  // if you position fields absolutely, keep this
  this.applyPositionsToLiveForm?.();
  this.cdr.detectChanges();

  const container = document.getElementById('form-to-export');
  if (!container) {
    alert('Form container not found!');
    return;
  }
  container.classList.add('export-pdf-icons');

  document.fonts.ready.then(() => {
    const clone = container.cloneNode(true) as HTMLElement;

    const mmToPx = (mm: number) => mm * (96 / 25.4);
    const a4WidthMM = 210;
    const a4HeightMM = 297;

    // size to A4
    clone.style.position = 'relative';
    clone.style.width = mmToPx(a4WidthMM) + 'px';
    clone.style.height = mmToPx(a4HeightMM) + 'px';
    clone.style.background =
      window.getComputedStyle(container).backgroundColor || 'white';

    // swap signature canvases for images
    this.selectedForm?.formPages.forEach((page) => {
      page.fields.forEach((field) => {
        if (field.type === 'signature') {
          const canvas = this.getCanvasById(field.id);
          if (canvas) {
            const base64 = canvas.toDataURL();
            const img = document.createElement('img');
            img.src = base64;
            img.style.width = (field.width ?? 300) + 'px';
            img.style.height = (field.height ?? 150) + 'px';

            const fieldEl = clone.querySelector(`.field-wrapper[data-id="${field.id}"]`);
            if (fieldEl) {
              (fieldEl as HTMLElement).innerHTML = '';
              fieldEl.appendChild(img);
            }
          }
        }
      });
    });

    // render offscreen
    clone.style.position = 'fixed';
    clone.style.top = '-9999px';
    clone.style.left = '-9999px';
    document.body.appendChild(clone);

    (html2pdf as any)()
      .from(clone)
      .set({
        margin: 10,
        filename: `${filename}.pdf`,
        html2canvas: { scale: 5, useCORS: true },
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

      const saveFirebase = () =>
        this.formService
          .saveFormTemplate(form.formName || 'Untitled', form.formPages)
          .then(() => this.snackBar.open('Template saved to Firestore!', 'Close', { duration: 2000 }));

      try {
        if (choice === 'local') saveLocal();
        else if (choice === 'firebase') await saveFirebase();
        else if (choice === 'both') { saveLocal(); await saveFirebase(); }
      } catch (e) {
        console.error(e);
        this.snackBar.open('Failed to save template.', 'Close', { duration: 3000 });
      }
    });
  }
}