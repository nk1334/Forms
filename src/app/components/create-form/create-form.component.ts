import {
  Component, OnInit, QueryList, ViewChildren, ElementRef,
  AfterViewInit, ChangeDetectorRef, Input, Output, EventEmitter
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as html2pdf from 'html2pdf.js';

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

@Component({
  selector: 'app-create-form',
  templateUrl: './create-form.component.html',
  styleUrls: ['./create-form.component.scss']
})
export class CreateFormComponent implements OnInit, AfterViewInit {
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

  ctxMap: Record<string, CanvasRenderingContext2D> = {};
  drawingMap: Record<string, boolean> = {};
  lastPos: Record<string, { x: number; y: number }> = {};
  isLoadedFromDashboard: boolean = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) { }

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

    this.textareas.forEach(textareaEl => {
      const textarea = textareaEl.nativeElement;

      // Set initial size (width and height)
      this.autoGrow(textarea);

      // Add autoGrow input event listener ONLY if NOT the description textarea
      if (textarea.id !== 'description') {
        textarea.addEventListener('input', () => {
          this.autoGrow(textarea);
        });
      }
    });

    // Listen for dynamic changes if new textareas added
    this.textareas.changes.subscribe(() => {
      this.ngAfterViewInit(); // re-run on new elements
    });
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
  // Your existing logic here:
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

      // Create a FileReader to read the file as Data URL (base64)
      const reader = new FileReader();
      reader.onload = () => {
        // Set the base64 string as the field value so it can be shown as image src
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

    const stored = localStorage.getItem('filledForms');
    let allFilledForms: FilledFormData[] = [];

    if (stored !== null) {
      try {
        allFilledForms = JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse filledForms from localStorage", e);
      }
    }

    const existingFilled = allFilledForms.find(f => f.formId === form.formId);
    if (!this.selectedForm) return;

    if (existingFilled && existingFilled.data) {
      this.filledDataName = existingFilled.name;

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

  closeForm(): void {
    this.showFormEditor = false;
    this.selectedForm = null;
    this.filledDataName = '';
    this.showNameInput = false;
    this.nameError = false;

    // Emit close event to parent component if used as child
    this.closeFormEvent.emit();
  }

  confirmSaveFilledForm(): void {
    const nameTrimmed = (this.filledDataName || '').trim();
    if (!this.selectedForm) {
      console.warn('No selected form');
      return;
    }
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

    // Collect all filled data (field id -> value)
    const filledData: Record<string, any> = {};
    this.selectedForm.formPages.forEach(page => {
      page.fields.forEach(field => {
        filledData[field.id] = field.value || null;
      });
    });

    // Prepare filled form object
    const filledForm: FilledFormData = {
      formId: this.selectedForm.formId,
      name: nameTrimmed,
      data: filledData,
      formPagesSnapshot: JSON.parse(JSON.stringify(this.selectedForm.formPages))  // save layout snapshot
    };

    // Get existing filled forms from localStorage
    const stored = localStorage.getItem('filledForms');
    const filledForms: FilledFormData[] = stored ? JSON.parse(stored) : [];

    // Check if a form with the same formId and name exists — update if yes, else add new
    const index = filledForms.findIndex(
      f => f.formId === filledForm.formId && f.name === filledForm.name
    );

    if (index >= 0) {
      filledForms[index] = filledForm; // update existing entry
    } else {
      filledForms.push(filledForm); // add new entry
    }

    // Save updated array back to localStorage
    localStorage.setItem('filledForms', JSON.stringify(filledForms));
    this.filledFormsUpdated.emit();

    // Notify user
    this.snackBar.open(`Form saved as "${filledForm.name}"`, 'Close', { duration: 3000 });

    // Reset and close form editor
    this.showFormEditor = false;
    this.selectedForm = null;
    this.filledDataName = '';

    // Reload filled forms list if you have such a method (optional)
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
      // Deep copy to avoid mutation issues
      this.forms[index] = JSON.parse(JSON.stringify(form));

      // Save updated forms list in localStorage (or your actual storage)
      localStorage.setItem('savedFormPages', JSON.stringify(this.forms));

      // Optional: Show a message on save success
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

    this.containerHeight = maxY + 20; // add some padding
  }



  async exportToPDF(): Promise<void> {
  if (!this.selectedForm) return;
  this.isExporting = true;

  this.adjustFormContainerHeight();
  this.cdr.detectChanges();

  const element = document.getElementById('form-to-export');
  if (!element) return;

  element.classList.add('exporting');

  // Clone the node for clean PDF rendering
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button').forEach(btn => btn.remove());

  clone.style.position = 'fixed';
  clone.style.top = '-9999px';
  clone.style.left = '-9999px';
  clone.style.width = element.offsetWidth + 'px';
  clone.style.background = 'white';

  // Append clone to body
  document.body.appendChild(clone);

  // --- NEW: Set field styles on cloned element to preserve layout ---
  const pageContainers = clone.querySelectorAll('.page-container');

  pageContainers.forEach((pageEl, pageIndex) => {
    const fields = this.selectedForm?.formPages[pageIndex]?.fields || [];

    fields.forEach((field, fieldIndex) => {
      const fieldWrapper = pageEl.querySelector(`.field-wrapper[data-id="${field.id}"]`) as HTMLElement;
      if (!fieldWrapper) return;

      if (field.id === 'description') {
        // description field uses relative positioning
        fieldWrapper.style.position = 'relative';
        fieldWrapper.style.left = '';
        fieldWrapper.style.top = '';
        fieldWrapper.style.width = field.width ? field.width + 'px' : '100%';
      } else {
        // other fields use absolute positioning
        fieldWrapper.style.position = 'absolute';
        fieldWrapper.style.left = (field.position?.x ?? 0) + 'px';
        fieldWrapper.style.top = (field.position?.y ?? 0) + 'px';
        fieldWrapper.style.width = (field.width ?? 300) + 'px';
      }

      if (field.height) {
        fieldWrapper.style.height = field.height + 'px';
      } else {
        fieldWrapper.style.height = '';
      }
    });
  });

  // Wait a moment to ensure styles are applied
  await new Promise(resolve => setTimeout(resolve, 300));

  try {
    const canvas = await html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: '#fff' });
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF('p', 'pt', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);
    pdf.save(`${this.selectedForm.formName || 'form'}.pdf`);
  } catch (error) {
    console.error('PDF generation error:', error);
  } finally {
    element.classList.remove('exporting');
    document.body.removeChild(clone);
    this.isExporting = false;
  }
}}