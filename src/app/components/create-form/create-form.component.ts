import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-create-form',
  templateUrl: './create-form.component.html',
  styleUrls: ['./create-form.component.scss']
})
export class CreateFormComponent implements OnInit{
forms: any[] = [];
  selectedForm: any = null;
  showFormEditor = false;

  ngOnInit(): void {
    this.loadForms();
  }

  loadForms() {
    const savedFormPages = localStorage.getItem('savedFormPages');
    this.forms = savedFormPages ? JSON.parse(savedFormPages) : [];
  }

  openForm(form: any) {
    this.selectedForm = JSON.parse(JSON.stringify(form)); // deep copy
    this.showFormEditor = true;
  }

  closeForm() {
    this.showFormEditor = false;
    this.selectedForm = null;
  }
}

