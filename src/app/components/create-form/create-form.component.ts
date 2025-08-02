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
  ChangeDetectorRef
} from '@angular/core';

import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as html2pdf from 'html2pdf.js';
import { getDocument, GlobalWorkerOptions, PDFDocumentProxy } from 'pdfjs-dist';

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
}

interface FormPage {
  fields: FormField[];
}

interface SavedForm {
  formId: string;
  formName?: string;
  formPages: FormPage[];
}

interface FilledFormData {
  formId: string;
  name: string;
  data: Record<string, any>;
  formPagesSnapshot?: FormPage[];
}

GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

@Component({
  selector: 'app-create-form',
  templateUrl: './create-form.component.html',
  styleUrls: ['./create-form.component.scss']
})
export class CreateFormComponent implements OnInit, AfterViewInit {
    examplePdfUrl: string = 'assets/sample.pdf';
  forms: SavedForm[] = [];
  filledForms: FilledFormData[] = [];
  showFormEditor = false;
  showNameInput = false;
  nameError = false;
  isExporting = false;
  containerHeight: number = 600;

  @Input() selectedForm: SavedForm | null = null;
  @Input() filledDataName: string = '';

  @Output() closeFormEvent = new EventEmitter<void>();
  @Output() filledFormsUpdated = new EventEmitter<void>();

  @ViewChildren('canvas') canvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('autoGrowTextarea') textareas!: QueryList<ElementRef<HTMLTextAreaElement>>;
  @ViewChild('pdfCanvas', { static: false }) pdfCanvas!: ElementRef<HTMLCanvasElement>;
  pdfDoc: PDFDocumentProxy | null = null;


  ctxMap: Record<string, CanvasRenderingContext2D> = {};
  drawingMap: Record<string, boolean> = {};
  lastPos: Record<string, { x: number; y: number }> = {};
  isLoadedFromDashboard: boolean = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  get hasValidFormsData(): boolean {
    return (
      Array.isArray(this.forms) &&
      this.forms.length > 0 &&
      Array.isArray(this.forms[0]?.formPages) &&
      this.forms[0].formPages.length > 0 &&
      Array.isArray(this.forms[0].formPages[0]?.fields) &&
      this.forms[0].formPages[0].fields.length > 0
    );
  }

  ngOnInit(): void {
    this.loadForms();
  }

ngAfterViewInit(): void {
    this.initCanvases();
    this.loadPdf(this.examplePdfUrl);

    this.textareas.forEach(textareaEl => {
      const textarea = textareaEl.nativeElement;
      this.autoGrow(textarea);
      if (textarea.id !== 'description') {
        textarea.addEventListener('input', () => {
          this.autoGrow(textarea);
        });
      }
    });

    this.textareas.changes.subscribe(() => {
      this.ngAfterViewInit(); // re-run on new elements
    });
  }

  async loadPdf(url: string) {
    this.pdfDoc = await getDocument(url).promise;
    if (this.pdfDoc.numPages > 0) {
      this.renderPage(1);
    }
  }

  async renderPage(pageNum: number) {
    if (!this.pdfDoc) return;
    const page = await this.pdfDoc.getPage(pageNum);
    const canvas = this.pdfCanvas.nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return;

    const scale = 1.5; // Adjust scale for fitting your container
    const viewport = page.getViewport({ scale });

    canvas.height = viewport.height;
    canvas.width = viewport.width;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';

    const renderContext = {
          canvas,
      canvasContext: context,
       viewport
     
    };
    await page.render(renderContext).promise;
  }


  addNewField(pageIndex: number, newField: FormField) {
    if (!this.selectedForm) return;
    newField.position = this.getNextAvailablePosition(pageIndex);
    this.selectedForm.formPages[pageIndex].fields.push(newField);
    this.adjustFormContainerHeight();
    this.saveForm(this.selectedForm);
  }

  deleteField(pageIndex: number, fieldIndex: number) {
    if (!this.selectedForm) return;
    this.selectedForm.formPages[pageIndex].fields.splice(fieldIndex, 1);
    this.adjustFormContainerHeight();
    this.saveForm(this.selectedForm);
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

    page.fields.forEach(field => {
      const bottom = (field.position?.y || 0) + (field.height || fieldHeight);
      if (bottom > maxY) maxY = bottom;
    });

    return { x: margin, y: maxY + margin };
  }

  autoGrow(element: EventTarget | null) {
    if (!(element instanceof HTMLTextAreaElement)) return;
    const textarea = element;
    textarea.style.width = 'auto';
    textarea.style.height = 'auto';

    const maxWidth = 600;
    const maxHeight = 400;

    const newWidth = Math.min(textarea.scrollWidth + 2, maxWidth);
    const newHeight = Math.min(textarea.scrollHeight + 2, maxHeight);

    textarea.style.width = newWidth + 'px';
    textarea.style.height = newHeight + 'px';
  }

  loadForms(): void {
    const savedFormPages = localStorage.getItem('savedFormPages');
    this.forms = savedFormPages ? JSON.parse(savedFormPages) : [];
  }

  onFileSelected(event: Event, field: any) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        field.value = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  openForm(form: SavedForm): void {
    this.selectedForm = JSON.parse(JSON.stringify(form));
    this.showFormEditor = true;
    this.showNameInput = false;
    this.nameError = false;

    const storedFilledForms = localStorage.getItem('filledForms');
    if (storedFilledForms) {
      const allFilledForms: FilledFormData[] = JSON.parse(storedFilledForms);
      const existingFilled = allFilledForms.find(f => f.formId === form.formId);

      if (existingFilled && existingFilled.data) {
        this.filledDataName = existingFilled.name;
        if (!this.selectedForm) return;
        this.selectedForm.formPages.forEach(page => {
          page.fields.forEach(field => {
            const savedValue = existingFilled.data?.[field.id];
            if (savedValue !== undefined) {
              field.value = savedValue;
            }
          });
        });
      } else {
        this.filledDataName = '';
      }

      this.adjustFormContainerHeight();
      setTimeout(() => this.initCanvases(), 0);
    }
  }

  closeForm(): void {
    this.showFormEditor = false;
    this.selectedForm = null;
    this.filledDataName = '';
    this.showNameInput = false;
    this.nameError = false;
    this.closeFormEvent.emit();
  }

  confirmSaveFilledForm(): void {
    const nameTrimmed = (this.filledDataName || '').trim();
    if (!this.selectedForm) return;
    if (!nameTrimmed) {
      this.nameError = true;
      return;
    }
    this.nameError = false;

    // Save canvas signatures into fields
    this.selectedForm.formPages.forEach(page => {
      page.fields.forEach(field => {
        if (field.type === 'signature') {
          const canvas = this.getCanvasById(field.id);
          if (canvas) {
            field.value = canvas.toDataURL();
          }
        }
      });
    });

    // Collect filled data
    const filledData: Record<string, any> = {};
    this.selectedForm.formPages.forEach(page => {
      page.fields.forEach(field => {
        filledData[field.id] = field.value || null;
      });
    });

    const filledForm: FilledFormData = {
      formId: this.selectedForm.formId,
      name: nameTrimmed,
      data: filledData,
      // formPagesSnapshot: JSON.parse(JSON.stringify(this.selectedForm.formPages)) // optional
    };

    const stored = localStorage.getItem('filledForms');
    const filledForms: FilledFormData[] = stored ? JSON.parse(stored) : [];

    const index = filledForms.findIndex(
      f => f.formId === filledForm.formId && f.name === filledForm.name
    );

    if (index >= 0) {
      filledForms[index] = filledForm;
    } else {
      filledForms.push(filledForm);
    }

    localStorage.setItem('filledForms', JSON.stringify(filledForms));
    this.filledFormsUpdated.emit();

    this.snackBar.open(`Form saved as "${filledForm.name}"`, 'Close', { duration: 3000 });

    this.showFormEditor = false;
    this.selectedForm = null;
    this.filledDataName = '';

    if (typeof this.loadFilledForms === 'function') {
      this.loadFilledForms();
    }
  }

  loadFilledForms(): void {
    const stored = localStorage.getItem('filledForms');
    this.filledForms = stored ? JSON.parse(stored) : [];
  }

  cancelSave(): void {
    this.showNameInput = false;
    this.filledDataName = '';
    this.nameError = false;
  }

  initCanvases(): void {
    this.ctxMap = {};
    this.drawingMap = {};
    this.lastPos = {};

    if (!this.canvasRefs) return;

    this.canvasRefs.forEach(ref => {
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

      const fieldId = canvas.getAttribute('data-id')!;
      this.ctxMap[fieldId] = ctx;
      this.drawingMap[fieldId] = false;
    });
  }

  getCanvasById(fieldId: string): HTMLCanvasElement | null {
    if (!this.canvasRefs) return null;
    const ref = this.canvasRefs.find(r => r.nativeElement.getAttribute('data-id') === fieldId);
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
      const field = this.selectedForm?.formPages.flatMap(p => p.fields).find(f => f.id === fieldId);
      if (field) field.value = '';
    }
  }

  getPointerPos(event: PointerEvent, fieldId: string): { x: number; y: number } {
    const canvas = this.getCanvasById(fieldId);
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  downloadFilledData(): void {
    if (!this.selectedForm) return;

    const filledData: { formName?: string; data: Record<string, any> } = {
      formName: this.selectedForm.formName,
      data: {}
    };

    this.selectedForm.formPages.forEach(page => {
      page.fields.forEach(field => {
        filledData.data[field.id] = field.value;
      });
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filledData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${this.selectedForm.formName || 'form'}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

  downloadFilledFormAsPDF() {
    const formElement = document.getElementById('filled-form-preview');
    if (!formElement) return;

    html2canvas(formElement).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 10, imgWidth, imgHeight);
      pdf.save('filled-form.pdf');
    });
  }

  saveForm(form: SavedForm) {
    const index = this.forms.findIndex(f => f.formId === form.formId);
    if (index !== -1) {
      this.forms[index] = JSON.parse(JSON.stringify(form));
      localStorage.setItem('savedFormPages', JSON.stringify(this.forms));
      this.snackBar.open(`Form "${form.formName}" saved!`, 'Close', { duration: 2000 });
    }
  }

  adjustFormContainerHeight(): void {
    if (!this.selectedForm) return;

    let maxY = 0;
    this.selectedForm.formPages.forEach(page => {
      page.fields.forEach(field => {
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

      page.fields.forEach(field => {
        const fieldEl = pageEl.querySelector(`.field-wrapper[data-id="${field.id}"]`) as HTMLElement;
        if (!fieldEl) return;

        const containerRect = pageEl.getBoundingClientRect();
        const fieldRect = fieldEl.getBoundingClientRect();

        field.position = {
          x: fieldRect.left - containerRect.left,
          y: fieldRect.top - containerRect.top
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

      page.fields.forEach(field => {
        const fieldEl = pageEl.querySelector(`.field-wrapper[data-id="${field.id}"]`) as HTMLElement;
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

        if (field.height) {
          fieldEl.style.height = field.height + 'px';
        } else {
          fieldEl.style.height = '';
        }
      });
    });
  }

  getFieldPositionById(id: string): { x: number; y: number } | null {
    if (!this.selectedForm) return null;
    for (const page of this.selectedForm.formPages) {
      const field = page.fields.find(f => f.id === id);
      if (field?.position) return field.position;
    }
    return null;
  }

  exportToPDF(): void {
    const filename = prompt('Enter filename for PDF', 'form');
    if (!filename) return;

    this.applyPositionsToLiveForm?.();
    this.cdr.detectChanges();

    const container = document.getElementById('form-to-export');
    if (!container) {
      alert('Form container not found!');
      return;
    }

    document.fonts.ready.then(() => {
      const clone = container.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('button, .field-tools, .resize-handle').forEach(el => el.remove());

      clone.style.position = 'relative';
      clone.style.width = container.offsetWidth + 'px';
      clone.style.height = container.offsetHeight + 'px';
      clone.style.background = window.getComputedStyle(container).backgroundColor || 'white';

      this.selectedForm?.formPages.forEach(page => {
        page.fields.forEach(field => {
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
                fieldEl.innerHTML = '';
                fieldEl.appendChild(img);
              }
            }
          }
        });
      });

      document.body.appendChild(clone);
      html2pdf().from(clone).set({
        margin: 10,
        filename: `${filename}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).save().finally(() => {
        clone.remove();
      });
    });
  }
}