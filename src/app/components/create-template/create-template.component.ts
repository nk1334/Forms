import {
  Component,
  ElementRef,
  ViewChildren,
  QueryList,
  AfterViewInit,
  AfterViewChecked,
  OnInit,
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
  ctxList: CanvasRenderingContext2D[] = [];
  drawingList: boolean[] = [];

  private lastCanvasCount = 0;

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

  constructor(private router: Router, private route: ActivatedRoute) {}

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

  ngAfterViewInit(): void {
    this.initCanvases();
  }

  ngAfterViewChecked(): void {
    const count = this.canvasRefs.length;
    if (count !== this.lastCanvasCount) {
      this.lastCanvasCount = count;
      this.initCanvases();
    }
  }

  @HostListener('window:resize')
  onResize() {
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
    } else if (event.previousContainer === event.container && toCanvas) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    }

    setTimeout(() => {
      this.initCanvases();
    }, 50);
  }

  createField() {
    if (!this.pendingFieldToAdd) return;

    const f = { ...this.newField, id: this.pendingFieldToAdd.id };

    if (f.type === 'project-title') {
      f.value = f.value || '';
    }
    if (f.type === 'branch') {
      f.options = [
        { value: '0', label: 'NSW' },
        { value: '1', label: 'Branch 0 - YATALA' },
        { value: '2', label: 'Branch 3 - MACKAY' }
      ];
    }

    this.formPages[this.currentPage].fields = [
      ...this.formPages[this.currentPage].fields,
      f
    ];

    this.pendingFieldToAdd = null;
    this.cancelFieldConfig();

    setTimeout(() => this.initCanvases(), 50);
  }

  cancelFieldConfig() {
    this.fieldConfigVisible = false;
    this.pendingFieldToAdd = null;
    this.newField = this.getEmptyField();
  }

  removeField(pageIndex: number, field: FormField) {
    this.formPages[pageIndex].fields = this.formPages[pageIndex].fields.filter(f => f !== field);

    setTimeout(() => this.initCanvases(), 0);
  }

  loadFormById(formId: string) {
    const form = this.savedForms.find(f => f.formId === formId);
    if (form) {
      this.formPages = JSON.parse(JSON.stringify(form.formPages));
      this.currentPage = 0;
      this.currentFormId = form.formId;
      this.dashboardVisible = false;
      this.formBuilderVisible = true;
      this.formListVisible = false;
      alert(`Loaded form "${form.formName}"`);
      setTimeout(() => this.initCanvases(), 0);
    }
  }

  backToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  loadSavedFormsList() {
    const saved = localStorage.getItem('savedFormPages');
    if (saved) {
      this.savedForms = JSON.parse(saved);
      this.formListVisible = true;
      this.formBuilderVisible = false;
    } else {
      alert('No saved forms found.');
    }
  }

  saveForm() {
    if (!this.formPages[0].fields.length) {
      alert('Cannot save an empty form');
      return;
    }
    const filename = prompt(this.currentFormId ? 'Update filename:' : 'Enter filename:', 'form');
    if (!filename) return;

    let data: SavedForm[] = JSON.parse(localStorage.getItem('savedFormPages') || '[]');
    if (this.currentFormId) {
      data = data.map(f => f.formId === this.currentFormId
        ? { formId: f.formId, formName: filename, formPages: this.formPages }
        : f
      );
    } else {
      this.currentFormId = this.generateId();
      data.push({ formId: this.currentFormId, formName: filename, formPages: this.formPages });
    }
    localStorage.setItem('savedFormPages', JSON.stringify(data));
    alert('Form saved');
    this.router.navigate(['/dashboard'], { state: { formSaved: true, formId: this.currentFormId } });
  }

  exportToPDF() {
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

  private initCanvases() {
    this.ctxList = [];
    this.drawingList = [];

    this.canvasRefs.toArray().forEach((ref, i) => {
      const c = ref.nativeElement;
      const ctx = c.getContext('2d');
      if (!ctx) return;

      c.width = c.offsetWidth * devicePixelRatio;
      c.height = c.offsetHeight * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);

      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;

      ctx.clearRect(0, 0, c.width, c.height);

      this.ctxList[i] = ctx;
      this.drawingList[i] = false;
    });

    // Attach pointer event listeners for signature canvases
    this.attachCanvasListeners();
  }

  private attachCanvasListeners() {
    this.canvasRefs.forEach((ref, i) => {
      const canvas = ref.nativeElement;

      // Remove previous listeners to avoid duplicates (optional, defensive)
      canvas.onpointerdown = null;
      canvas.onpointermove = null;
      canvas.onpointerup = null;
      canvas.onpointerleave = null;

      canvas.onpointerdown = (e) => this.startDrawing(e, i);
      canvas.onpointermove = (e) => this.draw(e, i);
      canvas.onpointerup = (e) => this.stopDrawing(e, i);
      canvas.onpointerleave = (e) => this.stopDrawing(e, i);
    });
  }

  startDrawing(e: PointerEvent, i: number) {
    const ctx = this.ctxList[i];
    if (!ctx) return;
    const pos = this.getPointerPos(e, i);
    this.drawingList[i] = true;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  draw(e: PointerEvent, i: number) {
    if (!this.drawingList[i]) return;
    const ctx = this.ctxList[i];
    if (!ctx) return;
    const pos = this.getPointerPos(e, i);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  stopDrawing(_: PointerEvent, i: number) {
    if (!this.drawingList[i]) return;
    const ctx = this.ctxList[i];
    if (!ctx) return;
    this.drawingList[i] = false;
    ctx.closePath();
  }

  clearCanvas(i: number) {
    const c = this.canvasRefs.toArray()[i]?.nativeElement;
    const ctx = this.ctxList[i];
    if (c && ctx) {
      ctx.clearRect(0, 0, c.width, c.height);
      this.drawingList[i] = false;
    }
  }

  private getPointerPos(e: PointerEvent, i: number) {
    const c = this.canvasRefs.toArray()[i]?.nativeElement;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private generateId(): string {
    return Math.random().toString(36).slice(2, 11);
  }

  private getEmptyField(): FormField {
    return { id: '', label: '', type: 'text', placeholder: '', width: '150' };
  }

  onContentEditableInput(e: Event, f: FormField) {
    f.value = (e.target as HTMLElement).innerText;
  }

  trackByFieldId(index: number, field: FormField): string {
    return field.id;
  }

  onSubmit() {
    console.log('Form submitted:', this.formPages[this.currentPage].fields);
    alert('Form submitted successfully!');
  }
}