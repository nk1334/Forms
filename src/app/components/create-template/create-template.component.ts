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

export interface FormField {
  id: string;
  label: string;
  type: string;
  placeholder?: string;
  // Allow any number for width and height, not just fixed literal types
  width?: number;
  height?: number;
  options?: { value: string; label: string }[];
  value?: any;
  position?: { x: number; y: number };
  row?: number;
  col?: number;
  problemItems?: { no: number; text: string }[];
nextNo?:number;
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
  isRemovingField: boolean = false;
  isDrawingSignature = false;

  ctxMap: Record<string, CanvasRenderingContext2D> = {};
  drawingMap: Record<string, boolean> = {};
  isDragging: boolean[] = [];

  lastCanvasCount = 0;
  shouldClearSignatureCanvas = false;

  dashboardVisible = true;
  formBuilderVisible = true;
  fieldConfigVisible = false;
  formListVisible = false;
    popupTop = 0;
  popupLeft = 0;

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

  freeDragPositions: { [fieldId: string]: { x: number; y: number } } = {};

  private idCounter = 0;

  pointerPosition = { x: 0, y: 0 };
  allowedWidths = [150, 300, 400];
selectedForm: SavedForm | null = null;
  constructor(
    
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    

  ) { }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const templateId = params['templateId'];
      if (templateId) {
        try {
          const saved = localStorage.getItem('savedFormPages');
          if (saved) {
            this.savedForms = JSON.parse(saved);
            this.loadFormById(templateId);

            this.fixDuplicateIds();
            this.checkDuplicateIds();
          }
        } catch (e) {
          console.error('Failed to parse saved forms from localStorage', e);
        }
      }
    });
  }
  addProblemItem(field: FormField): void {
  if(!field.problemItems)field.problemItems=[];
  if(!field.nextNo)field.nextNo=1;
  field.problemItems.push({no:field.nextNo,text:""});
  field.nextNo++;
  this.cdr.detectChanges();
}

// Update problem text (used by your (ngModelChange))
updateProblemText(field: FormField, idx: number, value: string): void {
  if (!field.problemItems ) return;
  field.problemItems[idx].text=value;
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
  openForm(form: SavedForm): void {
  this.loadFormById(form.formId);
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
      position: { x: 0, y: 0 }
    };
  }

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

  onDrop(event: CdkDragDrop<FormField[]>) {
    if (!event.isPointerOverContainer) return;

    const draggedField = event.item.data;

    // Check if it's a new field or one already on the canvas
    const isExistingField = this.formPages[this.currentPage].fields.some(
      f => f.id === draggedField.id
    );

    // Get drop position
    const containerRect = event.container.element.nativeElement.getBoundingClientRect();
    const nativeEvent = event.event as MouseEvent;
    const clientX = nativeEvent?.clientX ?? 0;
    const clientY = nativeEvent?.clientY ?? 0;
    const paddingLeft = 10;
    const paddingTop = 10;
    const rawX = clientX - containerRect.left + event.container.element.nativeElement.scrollLeft;
    const rawY = clientY - containerRect.top + event.container.element.nativeElement.scrollTop;

    const gridSize = 20;
    let snappedX = Math.round((rawX - paddingLeft) / gridSize) * gridSize;
    let snappedY = Math.round((rawY - paddingTop) / gridSize) * gridSize;

    // Avoid duplicate positions
    const existingPositions = this.formPages[this.currentPage].fields
      .filter(f => f.id !== draggedField.id) // only others
      .map(f => f.position);
    while (existingPositions.some(pos => pos?.x === snappedX && pos?.y === snappedY)) {
      snappedX += gridSize;
      snappedY += gridSize;
    }

    if (isExistingField) {
      // Just update position
      const field = this.formPages[this.currentPage].fields.find(f => f.id === draggedField.id);
      if (field) field.position = { x: snappedX, y: snappedY };
    } else {
      // Prepare newField for modal config instead of adding immediately
      this.newField = {
        ...draggedField,
        id: this.generateId(),
        label: draggedField.label || 'New Field',
        value: '',
        position: { x: snappedX, y: snappedY },
        width: 150 // default width if none provided
      };
      this.pendingFieldToAdd = this.newField;
      this.fieldConfigVisible = true;
    }

    this.initializeFreeDragPositions();
    this.fixDuplicateIds();
    this.cdr.detectChanges(); // optional but helps sometimes
  }

  onFieldDragStarted(event: CdkDragStart, field: FormField): void {
    const pos = field.position || { x: 0, y: 0 };
    event.source.setFreeDragPosition(pos);
  }

  onFieldDragMoved(event: CdkDragMove, field: FormField): void {
    const position = event.source.getFreeDragPosition();
    field.position = { x: position.x, y: position.y };
    this.cdr.detectChanges();
  }

  onFieldDragEnded(event: CdkDragEnd, field: FormField): void {
    const gridSize = 20;
    const maxWidth = 1000; // Prevents endless loop
    const pos = event.source.getFreeDragPosition();
    let x = Math.round(pos.x / gridSize) * gridSize;
    let y = Math.round(pos.y / gridSize) * gridSize;

    const others = this.formPages[this.currentPage].fields.filter(f => f.id !== field.id);
    let tries = 0;
    while (others.some(f => f.position?.x === x && f.position?.y === y) && tries < 50) {
      x += gridSize;
      if (x > maxWidth) { // arbitrary max width
        x = 0;
        y += gridSize;
      }
      tries++;
    }

    field.position = { x, y };
    event.source.setFreeDragPosition({ x, y });
    this.cdr.detectChanges();
  }

  onDragMoved(event: CdkDragMove<any>) {
    this.pointerPosition = { x: event.pointerPosition.x, y: event.pointerPosition.y };
  }

  createField(): void {
    if (!this.pendingFieldToAdd) return;
    const f = { ...this.pendingFieldToAdd };

    // No need to restrict width to literals here, just ensure it's a number
    if (typeof f.width === 'string') {
      f.width = parseInt(f.width, 10);
    }

    f.id = this.generateId();

    if (f.type === 'project-title') f.value = f.value || '';
    if (f.type === 'branch') {
      f.options = [
        { value: '0', label: 'NSW' },
        { value: '1', label: 'Branch 0 - YATALA' },
        { value: '2', label: 'Branch 3 - MACKAY' }
      ];
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

  cancelFieldConfig(): void {
    this.fieldConfigVisible = false;
    this.pendingFieldToAdd = null;
    this.newField = this.getEmptyField();
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

startResize(event: MouseEvent, field: any, isNearRight: boolean, isNearBottom: boolean) {
  event.stopPropagation();
  event.preventDefault();

  this.resizingField = field;
  this.startX = event.clientX;
  this.startY = event.clientY;
  this.startWidth = field.width || 150;
  this.startHeight = field.height || 60;

  document.addEventListener('mousemove', this.onResizeMove);
  document.addEventListener('mouseup', this.stopResize);
}
isDescFree(field: FormField): boolean {
  return field.type === 'textarea' && (field.id === 'description' || field.label === 'Description Field');
}
onResizeMove = (event: MouseEvent) => {
  if (!this.resizingField) return;

  const dx = event.clientX - this.startX;
  const dy = event.clientY - this.startY;

  this.resizingField.width = Math.max(this.startWidth + dx, 1);
  this.resizingField.height = Math.max(this.startHeight + dy, 1);
};

stopResize = (event: MouseEvent) => {
  document.removeEventListener('mousemove', this.onResizeMove);
  document.removeEventListener('mouseup', this.stopResize);

  this.resizingField = null;
};

  loadFormById(formId: string): void {
    const form = this.savedForms.find(f => f.formId === formId);
    if (form) {
      
      this.formPages = JSON.parse(JSON.stringify(form.formPages));

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
    console.log('Saving form with data:', JSON.stringify(this.formPages, null, 2));
    if (!this.formPages[0].fields.length) {
      alert('Cannot save an empty form');
      return;
    }

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

    const filenameRaw = prompt(this.currentFormId ? 'Update filename:' : 'Enter filename:', 'form');
    const filename = filenameRaw?.trim();
    if (!filename) {
      alert('Please enter a valid form name.');
      return;
    }

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
    this.savedForms = data;
    this.router.navigate(['/dashboard'], { state: { formSaved: true, formId: this.currentFormId } });
  }

  saveFilledForm(): void {
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
    alert('Form submitted! You can extend this logic.');
  }
onDragStart(event: DragEvent, index: number): void {
    this.isDragging[index] = true;
  }

  onDragEnd(event: DragEvent, index: number): void {
    this.isDragging[index] = false;
  }
}