import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddPlantDialogComponent } from './add-plant-dialog.component';

describe('AddPlantDialogComponent', () => {
  let component: AddPlantDialogComponent;
  let fixture: ComponentFixture<AddPlantDialogComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AddPlantDialogComponent]
    });
    fixture = TestBed.createComponent(AddPlantDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
