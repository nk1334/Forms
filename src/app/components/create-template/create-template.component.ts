import { Component } from '@angular/core';
import { Router } from '@angular/router';
import html2pdf from 'html2pdf.js';

interface FormField {
  label: string;
  type: string;
  placeholder?: string;
  width?: 'small' | 'full';
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
  dashboardVisible = true;
  formBuilderVisible = true;
  plusPopupVisible = false;
  fieldConfigVisible = false;

  paletteFields = [
    { label: 'Project Title', type: 'project-title' },
    { label: 'ID Field', type: 'id' },
    { label: 'Description Field', type: 'textarea' },
    { label: 'Date Field', type: 'date' },
    { label: 'Text Field', type: 'text' },
    { label: 'Number Field', type: 'number' },
    { label: 'Email Field', type: 'email' },
    { label: 'Branch Field', type: 'branch' },
    { label: 'Phone Field', type: 'tel' },
    { label: 'Radio Field', type: 'radio' },
    { label: 'Photo', type: 'file' },
    { label: 'Empty Box', type: 'empty' },
    { label: 'Submit Button', type: 'submit' },
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
    'submit',
  ];

  newField: FormField = {
    label: '',
    type: 'text',
    placeholder: '',
    width: 'small',
  };
  formPages: FormPage[] = new Array({ fields: [] });
  currentPage = 0;

  draggedType: string | null = null;
  draggedField: FormField | null = null;

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

  onDragStart(type: string) {
    this.draggedType = type;
    this.draggedField = null;
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
        label: this.capitalize(this.draggedType),
        type: this.draggedType,
        placeholder: '',
        width: 'small',
      };
      this.fieldConfigVisible = true;
      this.draggedType = null;
    } else if (this.draggedField) {
      this.formPages[this.currentPage].fields.push(this.draggedField);
      this.draggedField = null;
    }
  }

  cancelFieldConfig() {
    this.fieldConfigVisible = false;
    this.newField = {
      label: '',
      type: 'text',
      placeholder: '',
      width: 'small',
    };
  }

  createField() {
    if (this.newField.type === 'branch') {
      this.formPages[this.currentPage].fields.push({
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
