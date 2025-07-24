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
  

  @Input() selectedForm: SavedForm | null = null;
  @Input() filledDataName: string = '';

  @Output() closeFormEvent = new EventEmitter<void>();
  @Output() filledFormsUpdated = new EventEmitter<void>();

  @ViewChildren('canvas') canvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;
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
  console.log('Raw input:', JSON.stringify(this.filledDataName));
  console.log('Trimmed input:', JSON.stringify(nameTrimmed));

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
  // You can handle this however you want,
  // For example, if you have a variable to hold filled forms for dashboard:
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
  exportToPDF() {
  const formElement = document.getElementById('form-to-export');
  if (formElement) {
    const options = {
      margin: 10,
      filename: 'filled-form.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().from(formElement).set(options).save();
  }
}
      }
    