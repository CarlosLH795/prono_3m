import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection
} from '@angular/core';

import {
  registerLocaleData
} from '@angular/common';

import localeEsMx from '@angular/common/locales/es-MX';

import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AuthService } from './services/auth.services';
import { authInterceptor } from './interceptors/auth.interceptor';

import { routes } from './app.routes';

registerLocaleData(localeEsMx);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({
      eventCoalescing: true
    }),
    provideRouter(routes),
    provideAppInitializer(() => { inject(AuthService).inicializarSesion(); }),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};