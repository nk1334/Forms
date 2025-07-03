import { Component, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import SignaturePad from 'signature_pad';

interface FormField {
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

@Component({
  selector: 'app-create-template',
  templateUrl: './create-template.component.html',
  styleUrls: ['./create-template.component.scss'],
})
export class CreateTemplateComponent {
  @ViewChild('canvasElement', { static: false })
  canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx?: CanvasRenderingContext2D;
  private drawing = false;
  isSigning = false;

  dashboardVisible = true;
  formBuilderVisible = true;
  plusPopupVisible = false;
  fieldConfigVisible = false;

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
    width: '150'
  };
  formPages: FormPage[] = new Array({ fields: [] });
  currentPage = 0;

  draggedType: string | null = null;
  draggedField: FormField | null = null;

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
  constructor(private router: Router) {}

  startDrawing(event: MouseEvent) {
    const canvas = this.canvasRef?.nativeElement;
    const context = canvas.getContext('2d');

    if (!context) {
      console.error('Failed to get canvas 2D context.');
      return;
    }

    this.ctx = context;
    if (!this.ctx) return;

    this.drawing = true;
    this.isSigning = true;
    this.ctx.beginPath(); // Always start a new path
    this.draw(event);
  }

  stopDrawing(event: MouseEvent) {
    this.drawing = false;
    this.isSigning = false;
    this.ctx?.beginPath(); // reset path to avoid artifact lines
  }

  draw(event: MouseEvent) {
    if (!this.drawing || !this.ctx) return;

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';
    this.ctx.strokeStyle = '#000';

    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }

  clearCanvas() {
    if (!this.ctx) return;

    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    // this.draggedField = null;
  }

  onFieldDragStart(field: FormField, pageIndex: number) {
    this.draggedField = field;
    this.draggedType = null;
    const idx = this.formPages[pageIndex].fields.indexOf(field);
    // if (idx > -1) {
    //   setTimeout(() => {
    //     this.formPages[pageIndex].fields.splice(idx, 1);
    //   }, 200);
    // }
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
        width: '150'
      };
      this.fieldConfigVisible = true;
      this.draggedType = null;
    } else if (this.draggedField) {
      // this.formPages[this.currentPage].fields.push(this.draggedField);
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
        width: '150'
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

  // prevPage() {
  //   if (this.currentPage > 0) {
  //     this.currentPage--;
  //   }
  // }

  // nextPage() {
  //   if (this.currentPage === this.formPages.length - 1) {
  //     this.formPages.push({ fields: [] });
  //   }
  //   this.currentPage++;
  // }

  generateJSON() {
    alert(JSON.stringify(this.formPages, null, 2));
  }

  saveForm() {
    if (this.formPages[0].fields.length !== 0) {
      const filename = prompt('Enter filename for the PDF', 'form');
      if (!filename) {
        alert('Cannot save form without a filename');
        return;
      }
      var formData: any[] = [];
      const existingData = localStorage.getItem('savedFormPages');
      if (existingData) {
        const existingFormData = JSON.parse(existingData);
        if (existingFormData.length > 0) {
          formData.push(...existingFormData);
          formData.push({
            formId: this.generateId(),
            formName: filename,
            formPages: this.formPages,
          });
        } else {
          formData = [];
          formData.push({
            formId: this.generateId(),
            formName: filename,
            formPages: this.formPages,
          });
        }
      }
      localStorage.setItem('savedFormPages', JSON.stringify(formData));
      alert('Form saved to local storage');
      this.router.navigate(['/dashboard']);
    } else {
      alert('Cannot save an empty form');
    }
  }

  loadForm() {
    const saved = localStorage.getItem('savedFormPages');
    if (saved) {
      this.formPages = JSON.parse(saved);
      this.currentPage = 0;
      alert('Form loaded');
    } else {
      alert('No saved form found');
    }
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
}
