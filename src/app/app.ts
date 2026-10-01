import { Component } from '@angular/core';

import { PronosticoMap } from './pronostico-map/pronostico-map';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    PronosticoMap
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}