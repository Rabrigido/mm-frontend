import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClassCouplingComponent } from './class-coupling.component';

describe('ClassCouplingComponent', () => {
  let component: ClassCouplingComponent;
  let fixture: ComponentFixture<ClassCouplingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClassCouplingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClassCouplingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
