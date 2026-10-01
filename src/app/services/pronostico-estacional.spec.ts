import { TestBed } from '@angular/core/testing';
import { PronosticoEstacional } from './pronostico-estacional';

describe('PronosticoEstacional', () => {
  let service: PronosticoEstacional;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PronosticoEstacional);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
