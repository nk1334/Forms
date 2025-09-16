import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FieldRendererComponent } from './field-renderer.component';

describe('FieldRendererComponent', () => {
  let component: FieldRendererComponent;
  let fixture: ComponentFixture<FieldRendererComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [FieldRendererComponent]
    });
    fixture = TestBed.createComponent(FieldRendererComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
