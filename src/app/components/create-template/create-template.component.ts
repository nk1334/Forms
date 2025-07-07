import { Component, ElementRef, ViewChildren, QueryList, AfterViewInit,OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Router,ActivatedRoute } from '@angular/router';


export interface FormField {
  id: string;
  label: string;
  type: string;
  placeholder?: string;
  width?: '150' | '300' | '400';
  options?: { value: string; label: string }[];
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
  styleUrls: ['./create-template.component.scss'],
})
 export class CreateTemplateComponent implements OnInit, AfterViewInit {
  @ViewChildren('canvasElement') canvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;
  ctxList: CanvasRenderingContext2D[] = [];
  drawingList: boolean[] = [];
  isSigning = false;

  dashboardVisible = true;
  formBuilderVisible = true;
  plusPopupVisible = false;
  fieldConfigVisible = false;
  formListVisible = false;
  

  paletteFields: FormField[] = [
    { id: 'project-title', label: 'Project Name', type: 'text' },
    { id: 'id', label: 'ID Field', type: 'id' },
    { id: 'description', label: 'Description Field', type: 'textarea' },
    { id: 'date', label: 'Date Field', type: 'date' },
    { id: 'text', label: 'Text Field', type: 'text' },
    { id: 'number', label: 'Number Field', type: 'number' },
    { id: 'email', label: 'Email Field', type: 'email' },
    { id: 'branch', label: 'Branch Field', type: 'branch' },
    { id: 'tel', label: 'Phone Field', type: 'tel' },
    { id: 'radio', label: 'Radio Field', type: 'radio' },
    { id: 'file', label: 'Photo', type: 'file' },
    { id: 'empty', label: 'Empty Box', type: 'empty' },
    { id: 'signature', label: 'Signature', type: 'signature' },
    { id: 'submit', label: 'Submit Button', type: 'submit' },
  ];

  inputTypes = [
    'text',
    'number',
    'date',
    'email',
    'radio',
    'tel',
    'file',
    'branch',
    'id',
    'description',
    'empty',
    'signature',
    'submit',
  ];

  newField: FormField = {
    id: '',
    label: '',
    type: 'text',
    placeholder: '',
    width: '150',
  };
  formPages: FormPage[] = new Array({ fields: [] });
  currentPage = 0;

  draggedType: string | null = null;
  draggedField: FormField | null = null;
  savedForms: SavedForm[] = [];
  currentFormId: string | null = null;

  // Inject ActivatedRoute here
 constructor(private router: Router, private route: ActivatedRoute) { }
ngOnInit(): void {
  this.route.queryParams.subscribe(params => {
    console.log('Query Params:', params); // ✅ Good for debugging

    const templateId = params['templateId'];
    if (templateId) {
      const saved = localStorage.getItem('savedFormPages');
      if (saved) {
        this.savedForms = JSON.parse(saved);
        if (this.savedForms && this.savedForms.length > 0) {
          this.loadFormById(templateId);
        } else {
          console.warn('No saved forms found.');
        }
      } else {
        console.warn('No savedFormPages in localStorage.');
      }
    }
  });
}

  ngAfterViewInit(): void {
    this.initCanvases();
    this.canvasRefs.changes.subscribe(() => this.initCanvases());
  }

  getInputSwitchType(type: string): string | null {
    const allowedTypes = [
      'text',
      'number',
      'email',
      'date',
      'radio',
      'tel',
      'file',
      'id',
      'empty',
      'submit',
    ];
    return allowedTypes.includes(type) ? type : null;
  }

  openPlusPopup() {
    this.plusPopupVisible = true;
  }

  closePlusPopup() {
    this.plusPopupVisible = false;
  }

  startTemplate(e: Event) {
    e.preventDefault();
    this.plusPopupVisible = false;
    this.dashboardVisible = false;
    this.formBuilderVisible = true;
  }

  backToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  onDragStart(field: FormField) {
   
    this.draggedType = field.type;
    this.draggedField = field;
  }

  onFieldDragStart(field: FormField, pageIndex: number) {
    this.draggedField = field;
    this.draggedType = null;
  }

  allowDrop(e: DragEvent) {
    e.preventDefault();
  }

  dropField(e: DragEvent) {
    e.preventDefault();
    if (this.draggedType) {
      this.newField = {
        id: this.generateId(),
        label:
          this.draggedField?.label !== 'Project Name'
            ? this.capitalize(this.draggedField?.label || this.draggedType)
            : '',
        type: this.draggedType,
        placeholder: '',
        width: '150',
      };
      this.fieldConfigVisible = true;
      this.draggedType = null;
    } else if (this.draggedField) {
      this.draggedField = null;
    }
  }

  drop(event: CdkDragDrop<any[]>) {
    if (this.draggedType) {
      this.newField = {
        id: this.generateId(),
        label: this.capitalize(this.draggedField?.label || this.draggedType),
        type: this.draggedType,
        placeholder: '',
        width: '150',
      };
      this.fieldConfigVisible = true;
      this.draggedType = null;
    } else if (this.draggedField) {
      moveItemInArray(
        this.formPages[this.currentPage].fields,
        event.previousIndex,
        event.currentIndex
      );
    }
  }

  cancelFieldConfig() {
    this.fieldConfigVisible = false;
    this.newField = {
      id: this.generateId(),
      label: '',
      type: 'text',
      placeholder: '',
      width: '150',
    };
  }

  createField() {
    if (this.newField.type === 'branch') {
      this.formPages[this.currentPage].fields.push({
        id: this.newField.id,
        label: this.newField.label,
        type: this.newField.type,
        placeholder: this.newField.placeholder,
        width: this.newField.width,
        options: [
          { value: '0', label: 'NSW' },
          { value: '1', label: 'Branch 0 - YATALA' },
          { value: '2', label: 'Branch 3 - MACKAY' },
        ],
      });
    } else {
      this.formPages[this.currentPage].fields.push({ ...this.newField });
    }
    this.cancelFieldConfig();
  }

  removeField(pageIndex: number, field: FormField) {
    const idx = this.formPages[pageIndex].fields.indexOf(field);
    if (idx > -1) {
      this.formPages[pageIndex].fields.splice(idx, 1);
    }
  }

  generateJSON() {
    alert(JSON.stringify(this.formPages, null, 2));
  }

  loadSavedFormsList() {
    const saved = localStorage.getItem('savedFormPages');
    if (saved) {
      this.savedForms = JSON.parse(saved);
      this.formListVisible = true;
      this.formBuilderVisible = false;
      this.currentFormId = null;
    } else {
      alert('No saved forms found.');
    }
  }

  loadFormById(formId: string) {
    const formToLoad = this.savedForms.find((f) => f.formId === formId);
    if (formToLoad) {
      this.formPages = JSON.parse(JSON.stringify(formToLoad.formPages));
      this.currentPage = 0;
      this.currentFormId = formToLoad.formId;
         // 🟡 This ensures the form builder is shown and dashboard is hidden
      this.formListVisible = false;
      this.formBuilderVisible = true;
       this.dashboardVisible = false;
      alert(`Loaded form "${formToLoad.formName}" for editing.`);
    } else {
      alert('Form not found.');
    }
  }

  saveForm() {
    if (this.formPages[0].fields.length === 0) {
      alert('Cannot save an empty form');
      return;
    }
    const filename = prompt(
      this.currentFormId ? 'Update filename for the form' : 'Enter filename for the form',
      this.currentFormId ? undefined : 'form'
    );
    if (!filename) {
      alert('Cannot save form without a filename');
      return;
    }

    let formData: SavedForm[] = [];
    const existingData = localStorage.getItem('savedFormPages');
    if (existingData) {
      formData = JSON.parse(existingData);
    }

    if (this.currentFormId) {
      formData = formData.map((f) =>
        f.formId === this.currentFormId
          ? { formId: this.currentFormId, formName: filename, formPages: this.formPages }
          : f
      );
    } else {
      this.currentFormId = this.generateId();
      formData.push({
        formId: this.currentFormId,
        formName: filename,
        formPages: this.formPages,
      });
    }

    localStorage.setItem('savedFormPages', JSON.stringify(formData));
    alert('Form saved to local storage');
    this.router.navigate(['/dashboard']);
  }

  exportToPDF() {
    const filename = prompt('Enter filename for the PDF', 'form');
    if (!filename) {
      alert('PDF export canceled');
      return;
    }
    import('html2pdf.js').then((module) => {
      const html2pdf = module.default;
      const content = document.querySelector('.form-canvas');
      if (content) {
        html2pdf()
          .from(content)
          .set({
            margin: 1,
            filename: `${filename}.pdf`,
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
          })
          .save();
      }
    });
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  // Signature pad drawing methods modified to support multiple canvases


  private initCanvases() {
    this.ctxList = [];
    this.drawingList = [];
    this.canvasRefs.forEach((canvasRef, i) => {
      const canvas = canvasRef.nativeElement;
      const ctx = canvas.getContext('2d')!;
      this.resizeCanvas(canvas, ctx);
      this.ctxList[i] = ctx;
      this.drawingList[i] = false;
    });
  }

  private resizeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
  }

startDrawing(event: PointerEvent, i: number) {
  this.drawingList[i] = true;
  const ctx = this.ctxList[i];
  const pos = this.getPointerPos(event, i);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
}

draw(event: PointerEvent, i: number) {
  if (!this.drawingList[i]) return;
  const ctx = this.ctxList[i];
  const pos = this.getPointerPos(event, i);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
}

stopDrawing(event: PointerEvent, i: number) {
  if (!this.drawingList[i]) return;
  this.drawingList[i] = false;
  const ctx = this.ctxList[i];
  ctx.closePath();
}

private getPointerPos(event: PointerEvent, i: number) {
  const canvas = this.canvasRefs.toArray()[i].nativeElement;
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

  clearCanvas(i: number) {
    const canvas = this.canvasRefs.toArray()[i].nativeElement;
    this.ctxList[i].clearRect(0, 0, canvas.width, canvas.height);
  }

  private getMousePos(event: MouseEvent, i: number) {
    const canvas = this.canvasRefs.toArray()[i].nativeElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }
}