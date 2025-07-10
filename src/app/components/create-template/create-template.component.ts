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
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Router, ActivatedRoute } from '@angular/router';

export interface FormField {
  id: string;
  label: string;
  type: string;
  placeholder?: string;
  width?: '150' | '300' | '400';
  options?: { value: string; label: string }[];
  value?: any;
}

interface FormPage {
  fields: FormField[];
}

interface SavedForm {
  formId: string;
  formName: string;
  formPages: FormPage[];
}

@Component({
  selector: 'app-create-template',
  templateUrl: './create-template.component.html',
  styleUrls: ['./create-template.component.scss']
})
export class CreateTemplateComponent implements OnInit, AfterViewInit, AfterViewChecked {
  @ViewChildren('canvasElement') canvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;

  // Use a map keyed by field.id for canvas contexts and drawing states
  ctxMap: Record<string, CanvasRenderingContext2D> = {};
  drawingMap: Record<string, boolean> = {};
  isDragging: boolean[] = [];

  lastCanvasCount = 0;
  shouldClearSignatureCanvas = false;

  dashboardVisible = true;
  formBuilderVisible = true;
  fieldConfigVisible = false;
  formListVisible = false;

  paletteFields: FormField[] = [
    { id: 'project-title', label: 'Project Name', type: 'project-title' },
    { id: 'id', label: 'ID Field', type: 'id' },
    { id: 'description', label: 'Description Field', type: 'textarea' },
    { id: 'date', label: 'Date Field', type: 'date' },
    { id: 'text', label: 'Text Field', type: 'text' },
    { id: 'number', label: 'Number Field', type: 'number' },
    { id: 'email', label: 'Email Field', type: 'email' },
    { id: 'branch', label: 'Branch Field', type: 'branch' },
    { id: 'tel', label: 'Phone Field', type: 'tel' },
    {
      id: 'radio', label: 'Radio Field', type: 'radio', options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' }
      ]
    },
    { id: 'file', label: 'Photo', type: 'file' },
    { id: 'empty', label: 'Empty Box', type: 'empty' },
    { id: 'signature', label: 'Signature', type: 'signature' },
    { id: 'submit', label: 'Submit Button', type: 'submit' }
  ];

  newField: FormField = this.getEmptyField();
  pendingFieldToAdd: FormField | null = null;

  formPages: FormPage[] = [{ fields: [] }];
  currentPage = 0;
  savedForms: SavedForm[] = [];
  currentFormId: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const templateId = params['templateId'];
      if (templateId) {
        const saved = localStorage.getItem('savedFormPages');
        if (saved) {
          this.savedForms = JSON.parse(saved);
          this.loadFormById(templateId);
        }
      }
    });
  }

  private getEmptyField(): FormField {
    return {
      id: '',
      label: '',
      type: 'text',
      placeholder: '',
      width: '150',
      value: ''
    };
  }

  generateId(): string {
    return 'field-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  }

  ngAfterViewInit(): void {
    this.initCanvases();
  }

  ngAfterViewChecked(): void {
    const count = this.canvasRefs.length;
    if (count !== this.lastCanvasCount) {
      this.lastCanvasCount = count;
      this.initCanvases();
    }

    if (this.shouldClearSignatureCanvas) {
      setTimeout(() => {
        this.clearCanvasAfterDrop();
        this.shouldClearSignatureCanvas = false;
      }, 0);
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.initCanvases();
  }

  drop(event: CdkDragDrop<FormField[]>) {
    const fromPalette = event.previousContainer.id === 'fieldPalette';
    const toCanvas = event.container.id === 'formCanvas';

    if (fromPalette && toCanvas) {
      const dragged = event.item.data as FormField;
      this.pendingFieldToAdd = {
        ...dragged,
        id: this.generateId(),
        value: dragged.type === 'radio' ? '' : null,
        width: '150'
      };
      this.newField = { ...this.pendingFieldToAdd };
      this.fieldConfigVisible = true;
      this.cdr.detectChanges();

      // Clear canvas for signature field if dropped
      if (dragged.type === 'signature') {
        setTimeout(() => {
          const idx = this.formPages[this.currentPage].fields.findIndex(f => f.id === this.pendingFieldToAdd?.id);
          if (idx !== -1) {
            this.clearCanvas(this.pendingFieldToAdd!.id);
          }
        }, 100);
      }

    } else if (event.previousContainer === event.container && toCanvas) {
      // Reorder fields within the canvas
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);

      const dragged = event.item.data as FormField;

      // Clear signature canvas if applicable
      if (dragged.type === 'signature') {
        setTimeout(() => {
          this.clearCanvas(dragged.id);
        }, 100);
      }
    }

    setTimeout(() => {
      if (this.pendingFieldToAdd?.type === 'project-title') {
        const fieldElement = document.querySelector(`#field-${this.pendingFieldToAdd.id} .editable-div`);
        if (fieldElement) (fieldElement as HTMLElement).focus();
      }
    }, 0);
  }

  createField(): void {
    if (!this.pendingFieldToAdd) return;

    const f = { ...this.newField, id: this.pendingFieldToAdd.id };

    if (f.type === 'project-title') f.value = f.value || '';
    if (f.type === 'branch') {
      f.options = [
        { value: '0', label: 'NSW' },
        { value: '1', label: 'Branch 0 - YATALA' },
        { value: '2', label: 'Branch 3 - MACKAY' }
      ];
    }

    this.formPages[this.currentPage].fields.push(f);

    this.pendingFieldToAdd = null;
    this.cancelFieldConfig();
    setTimeout(() => this.initCanvases(), 50);
  }

  cancelFieldConfig(): void {
    this.fieldConfigVisible = false;
    this.pendingFieldToAdd = null;
    this.newField = this.getEmptyField();
  }

  removeField(pageIndex: number, field: FormField): void {
    this.formPages[pageIndex].fields = this.formPages[pageIndex].fields.filter(f => f !== field);
    setTimeout(() => this.initCanvases(), 0);
  }

  loadFormById(formId: string): void {
    const form = this.savedForms.find(f => f.formId === formId);
    if (form) {
      this.formPages = JSON.parse(JSON.stringify(form.formPages));
      this.currentPage = 0;
      this.currentFormId = form.formId;
      this.dashboardVisible = false;
      this.formBuilderVisible = true;
      this.formListVisible = false;
      alert(`Loaded form "${form.formName}"`);

      setTimeout(() => {
        this.initCanvases();

        // Draw saved signature images on canvas
        this.formPages[this.currentPage].fields.forEach((field) => {
          if (field.type === 'signature' && field.value) {
            const canvasRef = this.canvasRefs.find(ref => ref.nativeElement.getAttribute('data-id') === field.id);
            const ctx = this.ctxMap[field.id];
            if (canvasRef && ctx) {
              const canvas = canvasRef.nativeElement;
              const img = new Image();
              img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              };
              img.src = field.value;
            }
          }
        });
      }, 0);
    }
  }

  backToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  loadSavedFormsList(): void {
    const saved = localStorage.getItem('savedFormPages');
    if (saved) {
      this.savedForms = JSON.parse(saved);
      this.formListVisible = true;
      this.formBuilderVisible = false;
    } else {
      alert('No saved forms found.');
    }
  }

  saveForm(): void {
    if (!this.formPages[0].fields.length) {
      alert('Cannot save an empty form');
      return;
    }

    // Save signature canvas data as data URL
    this.formPages.forEach(page => {
      page.fields.forEach(field => {
        if (field.type === 'signature') {
          const canvasRef = this.canvasRefs.find(ref => ref.nativeElement.getAttribute('data-id') === field.id);
          if (canvasRef) {
            field.value = canvasRef.nativeElement.toDataURL();
          }
        }
      });
    });

    const filename = prompt(this.currentFormId ? 'Update filename:' : 'Enter filename:', 'form');
    if (!filename) return;

    let data: SavedForm[] = JSON.parse(localStorage.getItem('savedFormPages') || '[]');
    if (this.currentFormId) {
      data = data.map(f =>
        f.formId === this.currentFormId
          ? { formId: f.formId, formName: filename, formPages: this.formPages }
          : f
      );
    } else {
      data.push({
        formId: this.generateId(),
        formName: filename,
        formPages: this.formPages
      });
      this.currentFormId = data[data.length - 1].formId;
    }

    localStorage.setItem('savedFormPages', JSON.stringify(data));
    alert('Form saved');
    this.router.navigate(['/dashboard'], { state: { formSaved: true, formId: this.currentFormId } });
  }

  exportToPDF(): void {
    const filename = prompt('Enter filename for PDF', 'form');
    if (!filename) return;

    import('html2pdf.js').then(m => {
      const content = document.querySelector('.form-canvas');
      if (content) {
        m.default()
          .from(content)
          .set({
            margin: 1,
            filename: `${filename}.pdf`,
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
          })
          .save();
      }
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

      // Setup canvas size with devicePixelRatio for sharpness
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
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

  trackByFieldId(index: number, field: FormField): string {
    return field.id;
  }

onSubmit(): void {
  this.saveForm();
}
  onContentEditableInput(event: Event, field: FormField): void {
    const target = event.target as HTMLElement;
    field.value = target.innerText;
  }

  onDragStart(event: DragEvent, index: number): void {
    this.isDragging[index] = true;
  }

  onDragEnd(event: DragEvent, index: number): void {
    this.isDragging[index] = false;
  }
}