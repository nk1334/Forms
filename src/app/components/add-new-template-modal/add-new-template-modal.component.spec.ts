import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddNewTemplateModalComponent } from './add-new-template-modal.component';

describe('AddNewTemplateModalComponent', () => {
  let component: AddNewTemplateModalComponent;
  let fixture: ComponentFixture<AddNewTemplateModalComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AddNewTemplateModalComponent]
    });
    fixture = TestBed.createComponent(AddNewTemplateModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
