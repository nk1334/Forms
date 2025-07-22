import {
  Component, OnInit, QueryList, ViewChildren, ElementRef,
  AfterViewInit, ChangeDetectorRef
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';


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
  selectedForm: SavedForm | null = null;
  showFormEditor = false;
  showNameInput = false;
nameError = false;

  filledDataName = '';

  @ViewChildren('canvas') canvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;
  ctxMap: Record<string, CanvasRenderingContext2D> = {};
  drawingMap: Record<string, boolean> = {};
  lastPos: Record<string, { x: number; y: number }> = {};

  constructor(
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

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

  openForm(form: SavedForm): void {
  this.selectedForm = JSON.parse(JSON.stringify(form));
  this.showFormEditor = true;
  this.showNameInput = false;  // ✅ Add this line to prevent name popup when opening
   this.nameError = false;
  this.filledDataName = '';
  const saved = localStorage.getItem('filledForms');
  const allFilledForms: FilledFormData[] = saved ? JSON.parse(saved) : [];

  // If you want, load previous filled data here
  // ... your existing logic ...
  
  setTimeout(() => this.initCanvases(), 0);
}

  closeForm(): void {
    this.showFormEditor = false;
    this.selectedForm = null;
    this.filledDataName = '';
     this.showNameInput = false;  // Hide name input popup
  this.nameError = false;      // Reset error
  }

 confirmSaveFilledForm(): void {
    console.log('Raw input:', JSON.stringify(this.filledDataName));
  const nameTrimmed = this.filledDataName?.trim() || '';
  console.log('Trimmed input:', JSON.stringify(nameTrimmed));
  if (!this.selectedForm) return;

  if (!this.filledDataName.trim()) {
    this.nameError = true;  // show error if empty
    return;
  }

  this.nameError = false;
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

    const filledData: Record<string, any> = {};
    this.selectedForm.formPages.forEach(page => {
      page.fields.forEach(field => {
        filledData[field.id] = field.value;
      });
    });

    const newEntry: FilledFormData = {
      formId: this.selectedForm.formId,
      name: this.filledDataName.trim(),
      data: filledData,
    };

    const stored = localStorage.getItem('filledForms');
    const allFilledForms: FilledFormData[] = stored ? JSON.parse(stored) : [];

    const index = allFilledForms.findIndex(
      f => f.formId === newEntry.formId && f.name === newEntry.name
    );

    if (index >= 0) {
      allFilledForms[index] = newEntry;
    } else {
      allFilledForms.push(newEntry);
    }

    localStorage.setItem('filledForms', JSON.stringify(allFilledForms));
    this.snackBar.open(`Form saved as "${newEntry.name}"`, 'Close', { duration: 3000 });

    this.closeForm();
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

  exportToPDF(): void {
    if (!this.selectedForm) return;

    import('html2pdf.js').then(html2pdf => {
      const element = document.querySelector('form');
      if (element) {
        html2pdf.default()
          .from(element)
          .set({
            margin: 0.5,
            filename: `${this.selectedForm!.formName || 'form'}.pdf`,
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
          })
          .save();
      }
    });
  }
}