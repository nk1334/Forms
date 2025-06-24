import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-add-new-template-modal',
  templateUrl: './add-new-template-modal.component.html',
  styleUrls: ['./add-new-template-modal.component.scss'],
})
export class AddNewTemplateModalComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {}
}
