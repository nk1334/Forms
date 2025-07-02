import { Component } from '@angular/core';
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
  signaturePadOptions?: any;
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

  signaturePadOptions = {
    minWidth: 1,
    maxWidth: 3,
    penColor: 'rgb(0, 0, 0)',
    backgroundColor: 'rgba(255,255,255,0)',
    velocityFilterWeight: 0.7,
  };
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
    signaturePadOptions: this.signaturePadOptions,
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
    // if (this.draggedField && this.draggedType === 'signature') {
    //   const canvas = document.getElementById(
    //     'signature-canvas' + this.draggedField?.id
    //   ) as HTMLCanvasElement;
    //   const signaturePad = new SignaturePad(canvas, {
    //     minWidth: 1,
    //     maxWidth: 3,
    //     penColor: 'rgb(66, 133, 244)',
    //   });
    // } else
    if (this.draggedType) {
      this.newField = {
        id: this.generateId(),
        label: this.capitalize(this.draggedField?.label || this.draggedType),
        type: this.draggedType,
        placeholder: '',
        width: '150',
        signaturePadOptions: this.signaturePadOptions,
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
        width: '150',
        signaturePadOptions: this.signaturePadOptions,
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

  clearSignature(field: FormField) {
    if (field.type === 'signature') {
      field.signaturePadOptions = {
        ...field.signaturePadOptions,
        signature: null, // Assuming you have a way to clear the signature
      };
    }
  }
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
