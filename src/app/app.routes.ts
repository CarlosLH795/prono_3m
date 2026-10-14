import { Routes } from '@angular/router';
import { Login } from './login/login';
import { PronosticoMap } from './pronostico-map/pronostico-map';
import { authGuard } from './auth-guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: '', component: PronosticoMap, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
