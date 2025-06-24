import { Component } from '@angular/core';
import { Router } from '@angular/router';
interface FormField {
  label: string;
  type: string;
  placeholder?: string;
  width?: 'small' | 'full';
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
    { label: 'ID Field', type: 'id' },
    { label: 'Description Field', type: 'description' },
    { label: 'Date Field', type: 'date' },
    { label: 'Text Field', type: 'text' },
    { label: 'Number Field', type: 'number' },
    { label: 'Email Field', type: 'email' },
    { label: 'Branch Field', type: 'branch' },
    { label: 'Phone Field', type: 'tel' },
    { label: 'Radio Field', type: 'radio' },
    { label: 'Photo', type: 'photo' },
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
    'photo',
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
  formPages: FormPage[] = [{ fields: [] }];
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
    if (idx > -1) {
      this.formPages[pageIndex].fields.splice(idx, 1);
    }
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
    this.formPages[this.currentPage].fields.push({ ...this.newField });
    this.cancelFieldConfig();
  }

  removeField(pageIndex: number, field: FormField) {
    const idx = this.formPages[pageIndex].fields.indexOf(field);
    if (idx > -1) {
      this.formPages[pageIndex].fields.splice(idx, 1);
    }
  }

  prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
    }
  }

  nextPage() {
    if (this.currentPage === this.formPages.length - 1) {
      this.formPages.push({ fields: [] });
    }
    this.currentPage++;
  }

  generateJSON() {
    alert(JSON.stringify(this.formPages, null, 2));
  }

  saveForm() {
    localStorage.setItem('savedFormPages', JSON.stringify(this.formPages));
    alert('Form saved to local storage');
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
    import('html2pdf.js').then((html2pdf) => {
      const content = document.querySelector('.form-canvas');
      if (content) {
        html2pdf()
          .from(content)
          .set({
            margin: 1,
            filename: 'form.pdf',
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
}
